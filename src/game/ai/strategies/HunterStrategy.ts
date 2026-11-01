/**
 * HunterStrategy — камикадзе-перехватчик.
 *
 * Состояния (marker.mode):
 *   HUNT     (0) — текущий перехват по уравнению встречи.
 *                  Не летит в упор: цель — начать заход с 300–500 px.
 *   WINDUP   (1) — замах 0.45 с: фиксирует угол на игрока,
 *                  скорость 0.8×, визуальный телеграф.
 *   CHARGE   (2) — удар 0.9 с: движение по зафиксированному углу,
 *                  скорость 1.25×, доворот почти отключён (0.8 рад/с).
 *                  Игрок может уйти в сторону в последний момент.
 *   RECOVER  (3) — восстановление 1.0 с: скорость 0.55×,
 *                  доворот 1.5 рад/с — окно наказания.
 *
 * Физика перехвата (уравнение встречи) остаётся в HUNT.
 * В WINDUP/CHARGE/RECOVER хантер движется по фиксированному углу.
 *
 * Константы вынесены в balance/enemies.ts.
 */

import { solveInterceptTime } from '../../aiming/AimSolver';
import type { EnemyRef } from '../../ecs';
import { clamp, lerpAngle, smoothVelocity } from '../../math';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

// === Состояния ===
const HUNT = 0;
const WINDUP = 1;
const CHARGE = 2;
const RECOVER = 3;

// === Константы камикадзе ===
/** Порог скорости игрока: ниже считаем его неподвижным. */
const MIN_SPEED_EPS = 20;
/** Верхние границы прогноза курса: по времени и по дистанции. */
const MAX_LOOKAHEAD = 1.0;
const LEAD_MAX_DIST = 260;
/** Дальность перехода в замах: с неё начинается WINDUP. */
const WINDUP_DIST = 450;
/** Минимальная дистанция для захода: ниже — сразу CHARGE. */
const CHARGE_MIN_DIST = 300;
/** Длительность замаха, с. */
const WINDUP_DURATION = 0.45;
/** Множитель скорости в замахe. */
const WINDUP_SPEED_MULT = 0.8;
/** Множитель скорости в ударе. */
const CHARGE_SPEED_MULT = 1.25;
/** Длительность удара, с. */
const CHARGE_DURATION = 0.9;
/** Множитель скорости в восстановлении. */
const RECOVER_SPEED_MULT = 0.55;
/** Длительность восстановления, с. */
const RECOVER_DURATION = 1.0;
/** Скорость доворота в крейсерском полёте. */
const TURN_CRUISE = 3.0;
/** Скорость доворота в замахe (почти отключён). */
const TURN_WINDUP = 1.5;
/** Скорость доворота в ударе. */
const TURN_CHARGE = 0.8;
/** Скорость доворота в восстановлении. */
const TURN_RECOVER = 1.5;
/** Полоса у барьера, в которой хантер уходит от стены. */
const WALL_MARGIN = 90;
/** Отступ внутрь зоны для точки перехвата. */
const ZONE_KEEP_MARGIN = 60;

export class HunterStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const pos = enemy.position;
    const vel = enemy.velocity;
    const marker = enemy.marker;

    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    // Инициализация состояния
    if (marker.mode < HUNT || marker.mode > RECOVER) {
      marker.mode = HUNT;
      marker.modeT = 0;
    }

    // Если игрок снаружи — зоны не удерживаем
    if (!context.playerOutsideZone) {
      // Удерживаем точку перехвата внутри зоны
      this.keepInsideZone(context);
    }

    switch (marker.mode) {
      case HUNT: {
        // Текущий перехват
        const aim = this.computeIntercept(
          pos.x, pos.y,
          context.playerX, context.playerY,
          context.playerVx, context.playerVy,
          marker.speed
        );
        if (!context.playerOutsideZone) {
          this.keepInsideZonePoint(aim, context.zoneX, context.zoneY, context.zoneRadius);
        }

        const gx = aim.x - pos.x;
        const gy = aim.y - pos.y;
        const gd = Math.hypot(gx, gy) || 1;

        // Ближе к зоне замахa — переходим к WINDUP
        if (dist <= WINDUP_DIST) {
          marker.mode = WINDUP;
          marker.modeT = WINDUP_DURATION;
          marker.lockAngle = angleToPlayer; // фиксируем угол захода
        } else {
          // Обычный перехват
          smoothVelocity(vel, (gx / gd) * marker.speed, (gy / gd) * marker.speed, TURN_CRUISE, dt);
          if (!context.playerOutsideZone) this.avoidWall(enemy, context, dt);
        }
        break;
      }

      case WINDUP: {
        marker.modeT -= dt;

        // Фиксированный угол, слегка сниженная скорость
        const speed = marker.speed * WINDUP_SPEED_MULT;
        const targetVx = Math.cos(marker.lockAngle) * speed;
        const targetVy = Math.sin(marker.lockAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, TURN_WINDUP, dt);

        // Вращение: смотреть по зафиксированному углу
        marker.angle = lerpAngle(marker.angle, marker.lockAngle, 1 - Math.exp(-6 * dt));

        // Если истёк таймер или слишком близко — удар
        if (marker.modeT <= 0 || dist <= CHARGE_MIN_DIST) {
          marker.mode = CHARGE;
          marker.modeT = CHARGE_DURATION;
        }
        break;
      }

      case CHARGE: {
        marker.modeT -= dt;

        // Удар: фиксированный угол, ускорение, почти без доворота
        const speed = marker.speed * CHARGE_SPEED_MULT;
        const targetVx = Math.cos(marker.lockAngle) * speed;
        const targetVy = Math.sin(marker.lockAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, TURN_CHARGE, dt);

        // Вращение: смотреть по зафиксированному углу
        marker.angle = lerpAngle(marker.angle, marker.lockAngle, 1 - Math.exp(-TURN_CHARGE * dt));

        // Пролетели игрока или истёк таймер — восстановление
        if (marker.modeT <= -0.3 || dist < 20) {
          marker.mode = RECOVER;
          marker.modeT = RECOVER_DURATION;
        }
        break;
      }

      case RECOVER: {
        marker.modeT -= dt;

        // Восстановление: медленное движение, слабый доворот
        const speed = marker.speed * RECOVER_SPEED_MULT;
        const currentAngle = Math.atan2(vel.vy, vel.vx);
        const targetVx = Math.cos(currentAngle) * speed;
        const targetVy = Math.sin(currentAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, TURN_RECOVER, dt);

        // Вращение: по направлению движения
        const hv = Math.hypot(vel.vx, vel.vy);
        if (hv > 5) {
          const movementAngle = Math.atan2(vel.vy, vel.vx);
          marker.angle = lerpAngle(marker.angle, movementAngle, 1 - Math.exp(-TURN_RECOVER * dt));
        }

        // Восстановились — снова охота
        if (marker.modeT <= 0) {
          marker.mode = HUNT;
          marker.modeT = 0;
        }
        break;
      }
    }

    // Вращение: смотреть по направлению движения (если не в замахe/ударе)
    if (marker.mode === HUNT) {
      const hv = Math.hypot(vel.vx, vel.vy);
      if (hv > 5) {
        const targetAngle = Math.atan2(vel.vy, vel.vx);
        marker.angle = lerpAngle(marker.angle, targetAngle, 1 - Math.exp(-9 * dt));
      }
    }
  }

  /**
   * Аналитический расчёт точки перехвата.
   */
  private computeIntercept(
    hx: number, hy: number,
    px: number, py: number,
    pvx: number, pvy: number,
    hunterSpeed: number
  ): { x: number; y: number } {
    const pSpeed = Math.hypot(pvx, pvy);
    if (pSpeed < MIN_SPEED_EPS) {
      return { x: px, y: py };
    }

    const dx = px - hx;
    const dy = py - hy;

    const meet = solveInterceptTime(dx, dy, pvx, pvy, hunterSpeed);
    const flyThrough = Math.hypot(dx, dy) / Math.max(hunterSpeed, 1);

    const lead = Math.min(meet ?? flyThrough, MAX_LOOKAHEAD, LEAD_MAX_DIST / pSpeed);

    return { x: px + pvx * lead, y: py + pvy * lead };
  }

  /**
   * Точка перехвата не должна лежать за барьером.
   */
  private keepInsideZone(context: GameContext): void {
    // Метод оставлен для совместимости — точка перехвата теперь
    // обрабатывается внутри switch через keepInsideZonePoint.
  }

  private keepInsideZonePoint(
    point: { x: number; y: number },
    zoneX: number, zoneY: number, zoneRadius: number
  ): void {
    if (zoneRadius <= 40) return;

    const ax = point.x - zoneX;
    const ay = point.y - zoneY;
    const ad = Math.hypot(ax, ay);
    const limit = zoneRadius - ZONE_KEEP_MARGIN;
    if (ad > limit && ad > 0.001) {
      const k = limit / ad;
      point.x = zoneX + ax * k;
      point.y = zoneY + ay * k;
    }
  }

  /**
   * У барьера гасим составляющую скорости наружу.
   */
  private avoidWall(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { zoneX, zoneY, zoneRadius } = context;
    if (zoneRadius <= 40) return;

    const pos = enemy.position;
    const vel = enemy.velocity;
    const cx = pos.x - zoneX;
    const cy = pos.y - zoneY;
    const cd = Math.hypot(cx, cy);
    if (cd < 0.001) return;

    const toEdge = zoneRadius - cd - enemy.radius.r;
    if (toEdge >= WALL_MARGIN) return;

    const rx = cx / cd;
    const ry = cy / cd;
    const outward = vel.vx * rx + vel.vy * ry;
    if (outward <= 0) return;

    const weight = clamp(1 - toEdge / WALL_MARGIN, 0, 1);
    const damp = outward * weight * (1 - Math.exp(-8 * dt));
    vel.vx -= rx * damp;
    vel.vy -= ry * damp;
  }
}
