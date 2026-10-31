/**
 * CruiserStrategy — тяжёлая огневая платформа с двойными турелями.
 *
 * Порядок приоритетов поведения (сами орудия ведёт EnemyShootingSystem):
 *
 * 1. Рядом живой Carrier — эскорт. Крейсер закрепляется на дистанции
 *    «орбита дронов носителя + два радиуса крейсера» и встаёт на этой
 *    орбите со стороны игрока, прикрывая носитель.
 * 2. Носителя рядом нет — крейсер действует сам: от позиции игрока вдоль
 *    его вектора движения откладывается CRUISER_LEAD_DISTANCE, и крейсер
 *    летит в полученную точку упреждения, ведя огонь из неё. Точка
 *    вталкивается внутрь зоны с отступом CRUISER_ZONE_EDGE_MARGIN_RADII
 *    радиусов корпуса от края, чтобы не упираться в границу.
 * 3. Игрок дальше CRUISER_MANEUVER_RANGE, но в дистанции огня — лететь в
 *    точку упреждения поздно и незачем: крейсер держит позицию и просто
 *    ведёт по игроку прицельный огонь.
 * 4. Игрок дальше дистанции огня — крейсер сокращает дистанцию, иначе
 *    его орудия молчат.
 *
 * Carrier погиб — его больше нет «рядом», и крейсер автоматически
 * переходит к самостоятельному пункту 2.
 *
 * Ориентация: корпус смотрит ПО КУРСУ (как у остальных кораблей). Орудия
 * отделены от корпуса — их наводит на игрока EnemyShootingSystem в поле
 * marker.turretAngle, поэтому крейсер ведёт огонь, не поворачиваясь к цели
 * носом.
 */

import {
  CARRIER_DRONE_ORBIT_GAP,
  CRUISER_ESCORT_ARC_OFFSET,
  CRUISER_ESCORT_RANGE,
  CRUISER_FIRE_RANGE,
  CRUISER_LEAD_DISTANCE,
  CRUISER_MANEUVER_RANGE,
  CRUISER_ZONE_EDGE_MARGIN_RADII,
  EnemyKind,
} from '../../balance';
import type { EnemyRef } from '../../ecs';
import { lerpAngle, smoothVelocity } from '../../math';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

/** Точка манёвра крейсера в мировых координатах. */
interface CruiserTarget {
  x: number;
  y: number;
}

/** Резкость доворота крейсера к желаемой скорости. */
const CRUISER_SMOOTH_RATE = 2.8;
/** Радиус захода в точку: ближе крейсер тормозит, чтобы не проскочить её. */
const CRUISER_ARRIVE_RADIUS = 90;
/** Внутри этого радиуса точка считается достигнутой. */
const CRUISER_ARRIVE_EPS = 6;
/** Скорость игрока ниже этой величины — вектор движения считать нулевым. */
const CRUISER_PLAYER_STOP_SPEED = 12;
/** Сила разъезда с другими врагами (ускорение на единицу проникновения). */
const CRUISER_SEPARATION_PUSH = 180;
/** Скорость доворота корпуса: ниже порога хода нос некуда разворачивать. */
const CRUISER_COURSE_SPEED = 5;
/** Резкость поворота корпуса к курсу, 1/с. */
const CRUISER_TURN_RATE = 4;

export class CruiserStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;

    const target = this.pickTarget(enemy, context);
    this.clampIntoZone(target, enemy.radius.r * CRUISER_ZONE_EDGE_MARGIN_RADII, context);

    // Курс в точку: полный ход, с торможением на радиусе захода.
    let desX = 0;
    let desY = 0;
    const tx = target.x - pos.x;
    const ty = target.y - pos.y;
    const td = Math.hypot(tx, ty);
    if (td > CRUISER_ARRIVE_EPS) {
      const speed = marker.speed * Math.min(1, td / CRUISER_ARRIVE_RADIUS);
      desX = (tx / td) * speed;
      desY = (ty / td) * speed;
    }

    // Избегание других врагов.
    for (const o of context.enemies) {
      if (o === enemy || o.marker.dead) continue;
      const ddx = pos.x - o.position.x;
      const ddy = pos.y - o.position.y;
      const d2 = ddx * ddx + ddy * ddy;
      const minSep = (enemy.radius.r + o.radius.r) * 1.1;
      if (d2 < minSep * minSep && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = ((minSep - d) / d) * CRUISER_SEPARATION_PUSH;
        desX += (ddx / d) * push;
        desY += (ddy / d) * push;
      }
    }

    smoothVelocity(vel, desX, desY, CRUISER_SMOOTH_RATE, dt);

    // Корпус разворачивается по курсу. Орудия — отдельная турель: её наводит
    // на игрока EnemyShootingSystem через marker.turretAngle.
    const course = Math.hypot(vel.vx, vel.vy);
    if (course > CRUISER_COURSE_SPEED) {
      marker.angle = lerpAngle(
        marker.angle,
        Math.atan2(vel.vy, vel.vx),
        1 - Math.exp(-CRUISER_TURN_RATE * dt),
      );
    }
  }

  /** Точка, к которой стремится крейсер, по приоритетам поведения. */
  private pickTarget(enemy: EnemyRef, context: GameContext): CruiserTarget {
    const carrier = this.findEscortCarrier(enemy, context);
    if (carrier) return this.escortPoint(enemy, carrier, context);

    const pos = enemy.position;
    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Вне дистанции огня: идём на линию огня, иначе орудия бесполезны.
    if (dist > CRUISER_FIRE_RANGE) {
      const hold = CRUISER_FIRE_RANGE * 0.9;
      return {
        x: context.playerX - (dx / dist) * hold,
        y: context.playerY - (dy / dist) * hold,
      };
    }

    // Далеко для перестроения, но под огнём: держим позицию — пункт 3.
    if (dist > CRUISER_MANEUVER_RANGE) return { x: pos.x, y: pos.y };

    // Игрок близко: занимаем точку упреждения перед ним — пункт 2.
    return this.leadPoint(context, dx, dy, dist);
  }

  /**
   * Точка упреждения: от позиции игрока вдоль его вектора движения
   * откладывается CRUISER_LEAD_DISTANCE. Игрок стоит — вектор нулевой,
   * и точку берём на пеленге крейсера, чтобы тот держал дистанцию,
   * а не падал игроку на голову.
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
   * Эскорт носителя: дистанция орбиты его дронов плюс два радиуса
   * крейсера, со стороны игрока. Угловой сдвиг по strafeDir разводит
   * два эскорта по дуге, чтобы они не слипались в одной точке.
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
   * Вталкивает точку манёвра внутрь игровой зоны: от края отступает
   * margin, чтобы корабль не вставал ребром к границе.
   */
  private clampIntoZone(
    point: CruiserTarget,
    margin: number,
    context: GameContext,
  ): void {
    const { zoneX, zoneY, zoneRadius } = context;
    if (zoneRadius <= 0) return;
    const limit = Math.max(0, zoneRadius - margin);
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