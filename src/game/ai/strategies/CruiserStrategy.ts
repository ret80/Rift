/**
 * CruiserStrategy — тяжёлая огневая платформа с двойными турелями и тараном.
 *
 * Порядок приоритетов поведения (сами орудия ведёт EnemyShootingSystem):
 *
 * Базовое поведение (режим NORMAL):
 * 1. Рядом живой Carrier — эскорт. Крейсер закрепляется на дистанции
 *    «орбита дронов носителя + два радиуса крейсера» и встаёт на этой
 *    орбите со стороны игрока, прикрывая носитель.
 * 2. Носителя рядом нет — крейсер действует сам: от позиции игрока вдоль
 *    его вектора движения откладывается CRUISER_LEAD_DISTANCE, и крейсер
 *    летит в полученную точку упреждения, ведя огонь из неё.
 * 3. Игрок дальше CRUISER_MANEUVER_RANGE, но в дистанции огня — держит
 *    позицию и ведёт прицельный огонь.
 * 4. Игрок дальше дистанции огня — сокращает дистанцию.
 *
 * Таран (режимы WINDUP → CHARGE → RECOVER):
 * Активируется когда: игрок ближе 420 px, крейсер держится рядом ≥1.2 с,
 * кулдаун 6 с истёк, корпус смотрит на игрока (угол < 0.6 рад).
 *
 *   WINDUP   (1) — 0.8 с: скорость 0.4×, доворот к игроку,
 *                турели продолжают стрелять — замах читается.
 *   CHARGE   (2) — 0.8 с: разгон до ~2.4× базовой (~720),
 *                угол зафиксирован, доворот 0.5 рад/с.
 *   RECOVER  (3) — 1.2 с: двигатели почти погашены, доворот 0.8 —
 *                окно расстрела.
 *
 * Ориентация: корпус смотрит ПО КУРСУ. Орудия отделены — наводит
 * на игрока EnemyShootingSystem через marker.turretAngle.
 */

import {
  CARRIER_DRONE_ORBIT_GAP,
  CRUISER_ESCORT_ARC_OFFSET,
  CRUISER_ESCORT_RANGE,
  CRUISER_FIRE_RANGE_R,
  CRUISER_LEAD_DISTANCE,
  CRUISER_MANEUVER_RANGE,
  CRUISER_ZONE_EDGE_MARGIN_RADII,
  EnemyKind,
} from '../../balance';
import type { EnemyRef } from '../../ecs';
import { lerpAngle, smoothVelocity } from '../../math';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { edgeAvoidScale } from '../ZoneEdgePolicy';

/** Точка манёвра крейсера в мировых координатах. */
interface CruiserTarget {
  x: number;
  y: number;
}

/** Состояния поведения крейсера. */
const NORMAL = 0;
const WINDUP = 1;
const CHARGE = 2;
const RECOVER = 3;

/** Резкость доворота крейсера к желаемой скорости. */
const CRUISER_SMOOTH_RATE = 2.8;
/** Радиус захода в точку: ближе крейсер тормозит. */
const CRUISER_ARRIVE_RADIUS = 90;
/** Внутри этого радиуса точка считается достигнутой. */
const CRUISER_ARRIVE_EPS = 6;
/** Скорость игрока ниже этой величины — вектор движения считать нулевым. */
const CRUISER_PLAYER_STOP_SPEED = 12;
/** Скорость доворота корпуса: ниже порога хода нос некуда разворачивать. */
const CRUISER_COURSE_SPEED = 5;
/** Резкость поворота корпуса к курсу, 1/с. */
const CRUISER_TURN_RATE = 4;

// === Константы тарана ===
/** Дистанция, на которой крейсер начинает думать о таране. */
const CHARGE_TRIGGER_DIST = 420;
/** Минимальное время удержания рядом для запуска тарана, с. */
const CHARGE_HOLD_TIME_REQ = 1.2;
/** Кулдаун между таранами, с. */
const CHARGE_COOLDOWN = 6;
/** Длительность замаха тарана, с. */
const CHARGE_WINDUP_DURATION = 0.8;
/** Множитель скорости в замахe. */
const CHARGE_WINDUP_SPEED_MULT = 0.4;
/** Множитель скорости в ударе. */
const CHARGE_SPEED_MULT = 2.4;
/** Длительность удара, с. */
const CHARGE_DURATION = 0.8;
/** Множитель скорости в восстановлении. */
const CHARGE_RECOVER_SPEED_MULT = 0.3;
/** Длительность восстановления, с. */
const CHARGE_RECOVER_DURATION = 1.2;
/** Скорость доворота в замахe. */
const CHARGE_TURN_WINDUP = 4;
/** Скорость доворота в ударе. */
const CHARGE_TURN_CHARGE = 0.5;
/** Скорость доворота в восстановлении. */
const CHARGE_TURN_RECOVER = 0.8;
/** Угол между корпусом и линией на игрока для запуска тарана, рад. */
const CHARGE_ANGLE_THRESHOLD = 0.6;

export class CruiserStrategy implements IEnemyStrategy {
  private chargeCooldown = 0;
  private holdTime = 0;
  private chargeAngle = 0;

  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;

    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    // Инициализация состояния
    if (marker.mode < NORMAL || marker.mode > RECOVER) {
      marker.mode = NORMAL;
      marker.modeT = 0;
    }

    // Глобальный кулдаун
    this.chargeCooldown = Math.max(0, this.chargeCooldown - dt);

    switch (marker.mode) {
      case NORMAL: {
        // Проверяем условия для тарана
        const angleDiff = Math.abs(lerpAngle(marker.angle, angleToPlayer, 1));
        const nearPlayer = dist < CHARGE_TRIGGER_DIST;
        const facingPlayer = angleDiff < CHARGE_ANGLE_THRESHOLD;

        // Таран — только с жетоном атаки: иначе один крейсер занимал бы
        // весь бюджет угроз и его разгон читался бы как постоянный шум.
        if (nearPlayer && facingPlayer && this.chargeCooldown <= 0 && marker.attackAllowed) {
          this.holdTime += dt;
          if (this.holdTime >= CHARGE_HOLD_TIME_REQ) {
            // Запускаем таран
            marker.mode = WINDUP;
            marker.modeT = CHARGE_WINDUP_DURATION;
            this.chargeAngle = angleToPlayer;
            this.holdTime = 0;
          }
        } else {
          this.holdTime = Math.max(0, this.holdTime - dt * 2);
        }

        // Базовое поведение
        const target = this.pickTarget(enemy, context);
        this.clampIntoZone(target, enemy.radius.r * CRUISER_ZONE_EDGE_MARGIN_RADII, context);
        this.applyNormalMovement(enemy, target, dt);
        break;
      }

      case WINDUP: {
        marker.modeT -= dt;

        // Замах: медленно разворачиваемся к игроку, скорость снижена
        const speed = marker.speed * CHARGE_WINDUP_SPEED_MULT;
        const targetVx = Math.cos(this.chargeAngle) * speed;
        const targetVy = Math.sin(this.chargeAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, CHARGE_TURN_WINDUP, dt);

        // Корпус разворачивается к игроку
        marker.angle = lerpAngle(marker.angle, this.chargeAngle, 1 - Math.exp(-CRUISER_TURN_RATE * dt));

        // Если истёк таймер — удар
        if (marker.modeT <= 0) {
          marker.mode = CHARGE;
          marker.modeT = CHARGE_DURATION;
        }
        break;
      }

      case CHARGE: {
        marker.modeT -= dt;

        // Удар: максимальная скорость по фиксированному углу
        const speed = marker.speed * CHARGE_SPEED_MULT;
        const targetVx = Math.cos(this.chargeAngle) * speed;
        const targetVy = Math.sin(this.chargeAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, CHARGE_TURN_CHARGE, dt);

        // Корпус смотрит по зафиксированному углу
        marker.angle = lerpAngle(marker.angle, this.chargeAngle, 1 - Math.exp(-CHARGE_TURN_CHARGE * dt));

        // Пролетели или истёк таймер — восстановление
        if (marker.modeT <= -0.3 || dist < 30) {
          marker.mode = RECOVER;
          marker.modeT = CHARGE_RECOVER_DURATION;
        }
        break;
      }

      case RECOVER: {
        marker.modeT -= dt;

        // Восстановление: почти стоя, слабый доворот
        const speed = marker.speed * CHARGE_RECOVER_SPEED_MULT;
        const currentAngle = Math.atan2(vel.vy, vel.vx);
        const targetVx = Math.cos(currentAngle) * speed;
        const targetVy = Math.sin(currentAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, CHARGE_TURN_RECOVER, dt);

        if (marker.modeT <= 0) {
          marker.mode = NORMAL;
          marker.modeT = 0;
          this.chargeCooldown = CHARGE_COOLDOWN;
        }
        break;
      }
    }

    // Корпус разворачивается по курсу (только в NORMAL)
    if (marker.mode === NORMAL) {
      const course = Math.hypot(vel.vx, vel.vy);
      if (course > CRUISER_COURSE_SPEED) {
        marker.angle = lerpAngle(
          marker.angle,
          Math.atan2(vel.vy, vel.vx),
          1 - Math.exp(-CRUISER_TURN_RATE * dt),
        );
      }
    }
  }

  /**
   * Базовое движение крейсера (NORMAL).
   */
  private applyNormalMovement(
    enemy: EnemyRef,
    target: CruiserTarget,
    dt: number
  ): void {
    const pos = enemy.position;
    const vel = enemy.velocity;

    const tx = target.x - pos.x;
    const ty = target.y - pos.y;
    const td = Math.hypot(tx, ty);

    let desX = 0;
    let desY = 0;
    if (td > CRUISER_ARRIVE_EPS) {
      const speed = enemy.marker.speed * Math.min(1, td / CRUISER_ARRIVE_RADIUS);
      desX = (tx / td) * speed;
      desY = (ty / td) * speed;
    }

    smoothVelocity(vel, desX, desY, CRUISER_SMOOTH_RATE, dt);
  }

  /** Точка, к которой стремится крейсер, по приоритетам поведения. */
  private pickTarget(enemy: EnemyRef, context: GameContext): CruiserTarget {
    const carrier = this.findEscortCarrier(enemy, context);
    if (carrier) return this.escortPoint(enemy, carrier, context);

    const pos = enemy.position;
    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Вне дистанции огня: идём на линию огня
    const fireRange = Math.max(CRUISER_MANEUVER_RANGE, context.zoneRadius * CRUISER_FIRE_RANGE_R);
    if (dist > fireRange) {
      const hold = fireRange * 0.9;
      return {
        x: context.playerX - (dx / dist) * hold,
        y: context.playerY - (dy / dist) * hold,
      };
    }

    // Далеко для перестроения, но под огнём: держим позицию
    if (dist > CRUISER_MANEUVER_RANGE) return { x: pos.x, y: pos.y };

    // Игрок близко: занимаем точку упреждения
    return this.leadPoint(context, dx, dy, dist);
  }

  /**
   * Точка упреждения: от позиции игрока вдоль его вектора движения
   * откладывается CRUISER_LEAD_DISTANCE.
   */
  private leadPoint(
    context: GameContext,
    dx: number,
    dy: number,
    dist: number,
  ): CruiserTarget {
    const move = Math.hypot(context.playerVx, context.playerVy);
    let ux: number;
    let uy: number;
    if (move > CRUISER_PLAYER_STOP_SPEED) {
      ux = context.playerVx / move;
      uy = context.playerVy / move;
    } else {
      ux = -dx / dist;
      uy = -dy / dist;
    }
    return {
      x: context.playerX + ux * CRUISER_LEAD_DISTANCE,
      y: context.playerY + uy * CRUISER_LEAD_DISTANCE,
    };
  }

  /**
   * Эскорт носителя.
   */
  private escortPoint(
    enemy: EnemyRef,
    carrier: EnemyRef,
    context: GameContext,
  ): CruiserTarget {
    const orbit = carrier.radius.r + CARRIER_DRONE_ORBIT_GAP + enemy.radius.r * 2;
    const angle =
      Math.atan2(context.playerY - carrier.position.y, context.playerX - carrier.position.x) +
      enemy.marker.strafeDir * CRUISER_ESCORT_ARC_OFFSET;
    return {
      x: carrier.position.x + Math.cos(angle) * orbit,
      y: carrier.position.y + Math.sin(angle) * orbit,
    };
  }

  /** Ближайший живой Carrier в пределах дистанции эскорта. */
  private findEscortCarrier(enemy: EnemyRef, context: GameContext): EnemyRef | null {
    let best: EnemyRef | null = null;
    let bestDist = CRUISER_ESCORT_RANGE;
    for (const o of context.enemies) {
      if (o.marker.kind !== EnemyKind.Carrier || o.marker.dead) continue;
      const dist = Math.hypot(enemy.position.x - o.position.x, enemy.position.y - o.position.y);
      if (dist < bestDist) {
        bestDist = dist;
        best = o;
      }
    }
    return best;
  }

  /**
   * Вталкивает точку манёвра внутрь игровой зоны.
   */
  private clampIntoZone(
    point: CruiserTarget,
    margin: number,
    context: GameContext,
  ): void {
    if (context.playerOutsideZone) return;
    const { zoneX, zoneY, zoneRadius } = context;
    if (zoneRadius <= 0) return;
    // У кромки игрока отступ сжимается: крейсер не держит внутреннее кольцо,
    // пока цель прячется снаружи.
    const limit = Math.max(0, zoneRadius - margin * edgeAvoidScale(context));
    const dx = point.x - zoneX;
    const dy = point.y - zoneY;
    const dist = Math.hypot(dx, dy);
    if (dist <= limit) return;
    if (dist <= 0.0001) {
      point.x = zoneX;
      point.y = zoneY;
      return;
    }
    point.x = zoneX + (dx / dist) * limit;
    point.y = zoneY + (dy / dist) * limit;
  }
}
