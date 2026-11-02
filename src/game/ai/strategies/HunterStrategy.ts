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
import { clamp, lerpAngle } from '../../math';
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
const WINDUP_DURATION = 0.35;
/** Множитель скорости в замахe. */
const WINDUP_SPEED_MULT = 0.9;
/** Множитель скорости в ударе. */
const CHARGE_SPEED_MULT = 1.4;
/** Длительность удара, с. */
const CHARGE_DURATION = 1.0;
/** Множитель скорости в восстановлении. */
const RECOVER_SPEED_MULT = 0.6;
/** Длительность восстановления, с. */
const RECOVER_DURATION = 0.8;
/** Скорость доворота в крейсерском полёте. */
const TURN_CRUISE = 6.0;
/** Скорость доворота в замахe (быстрее). */
const TURN_WINDUP = 3.0;
/** Скорость доворота в ударе (но всё ещё ограничен). */
const TURN_CHARGE = 1.2;
/** Скорость доворота в восстановлении. */
const TURN_RECOVER = 4.0;
/** Полоса у барьера, в которой хантер уходит от стены. */
const WALL_MARGIN = 90;
/** Отступ внутрь зоны для точки перехвата. */
const ZONE_KEEP_MARGIN = 60;
/** Разгон/торможение хантера по модулю скорости, px/с². */
const HUNTER_ACCEL = 1800;

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

        let desired = Math.atan2(aim.y - pos.y, aim.x - pos.x);
        if (!context.playerOutsideZone) {
          desired = this.avoidWallAngle(enemy, context, desired);
        }

        // Нос всегда совпадает с курсом: поворачиваем корпус и сразу
        // направляем скорость по нему. Никакого бокового сноса.
        this.steerNose(enemy, desired, marker.speed, TURN_CRUISE, dt);

        // Ближе к зоне замахa — переходим к WINDUP
        if (dist <= WINDUP_DIST) {
          marker.mode = WINDUP;
          marker.modeT = WINDUP_DURATION;
          marker.lockAngle = this.chargeAimAngle(enemy, context);
        }
        break;
      }

      case WINDUP: {
        marker.modeT -= dt;

        // Замах: корпус и скорость разворачиваются к упреждающей точке.
        // Угол ещё можно подправлять, пока идёт телеграф.
        marker.lockAngle = this.chargeAimAngle(enemy, context);
        const speed = marker.speed * WINDUP_SPEED_MULT;
        this.steerNose(enemy, marker.lockAngle, speed, TURN_WINDUP, dt);

        // Если истёк таймер или слишком близко — удар
        if (marker.modeT <= 0 || dist <= CHARGE_MIN_DIST) {
          marker.mode = CHARGE;
          marker.modeT = CHARGE_DURATION;
        }
        break;
      }

      case CHARGE: {
        marker.modeT -= dt;

        // Удар: угол зафиксирован, корпус и скорость идут строго по нему.
        // Доворот почти отключён — игрок может уйти в сторону.
        const speed = marker.speed * CHARGE_SPEED_MULT;
        this.steerNose(enemy, marker.lockAngle, speed, TURN_CHARGE, dt);

        // Пролетели игрока или истёк таймер — восстановление
        const closing = dx * vel.vx + dy * vel.vy;
        if (marker.modeT <= -0.2 || (closing < 0 && dist > 40)) {
          marker.mode = RECOVER;
          marker.modeT = RECOVER_DURATION;
          marker.strafeDir = -marker.strafeDir;
        }
        break;
      }

      case RECOVER: {
        marker.modeT -= dt;

        // Восстановление: медленно, но снова доворачивает к игроку.
        // Это окно, в которое игрок успевает наказать камикадзе.
        const speed = marker.speed * RECOVER_SPEED_MULT;
        this.steerNose(enemy, angleToPlayer, speed, TURN_RECOVER, dt);

        // Восстановились — снова охота
        if (marker.modeT <= 0) {
          marker.mode = HUNT;
          marker.modeT = 0;
        }
        break;
      }
    }
  }

  /**
   * Повернуть нос к желаемому углу с ограниченной угловой скоростью и
   * направить скорость строго по носу. Именно это убирает «полёт боком»:
   * вектор скорости больше не живёт отдельно от ориентации корпуса.
   */
  private steerNose(
    enemy: EnemyRef,
    desired: number,
    targetSpeed: number,
    maxTurnRate: number,
    dt: number
  ): void {
    const marker = enemy.marker;
    const vel = enemy.velocity;

    let diff = desired - marker.angle;
    diff = ((diff % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
    if (diff > Math.PI) diff -= Math.PI * 2;
    const step = clamp(diff, -maxTurnRate * dt, maxTurnRate * dt);
    marker.angle += step;
    marker.angle = ((marker.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

    // Разгон/торможение по модулю, направление — всегда по носу.
    const current = Math.hypot(vel.vx, vel.vy);
    const next = current + clamp(targetSpeed - current, -HUNTER_ACCEL * dt, HUNTER_ACCEL * dt);
    vel.vx = Math.cos(marker.angle) * next;
    vel.vy = Math.sin(marker.angle) * next;
  }

  /** Угол захода на упреждение с учётом скорости рывка. */
  private chargeAimAngle(enemy: EnemyRef, context: GameContext): number {
    const pos = enemy.position;
    const speed = enemy.marker.speed * CHARGE_SPEED_MULT;
    const aim = this.computeIntercept(
      pos.x, pos.y,
      context.playerX, context.playerY,
      context.playerVx, context.playerVy,
      speed
    );
    if (!context.playerOutsideZone) {
      this.keepInsideZonePoint(aim, context.zoneX, context.zoneY, context.zoneRadius);
    }
    return Math.atan2(aim.y - pos.y, aim.x - pos.x);
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
   * У барьера не гасим скорость сбоку, а подмешиваем в желаемый курс
   * касательную к зоне. Скорость всё равно остаётся направленной по носу,
   * поэтому визуально хантер не «скользит» боком.
   */
  private avoidWallAngle(enemy: EnemyRef, context: GameContext, desired: number): number {
    const { zoneX, zoneY, zoneRadius } = context;
    if (zoneRadius <= 40) return desired;

    const pos = enemy.position;
    const cx = pos.x - zoneX;
    const cy = pos.y - zoneY;
    const cd = Math.hypot(cx, cy);
    if (cd < 0.001) return desired;

    const toEdge = zoneRadius - cd - enemy.radius.r;
    if (toEdge >= WALL_MARGIN) return desired;

    const angleToCenter = Math.atan2(zoneY - pos.y, zoneX - pos.x);
    // Курс уже ведёт внутрь — вмешиваться не нужно.
    if (Math.cos(desired - angleToCenter) > 0.2) return desired;

    const edgeAngle = Math.atan2(cy, cx);
    const tangentA = edgeAngle + Math.PI / 2;
    const tangentB = edgeAngle - Math.PI / 2;
    const tangent =
      Math.abs(Math.cos(desired - tangentA)) >= Math.abs(Math.cos(desired - tangentB))
        ? tangentA
        : tangentB;

    const weight = clamp(1 - toEdge / WALL_MARGIN, 0, 1) * 0.85;
    return lerpAngle(desired, tangent, weight);
  }
}
