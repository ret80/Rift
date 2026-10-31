/**
 * HunterStrategy - таран-перехватчик (intercept pursuit).
 *
 * Хантер не тащится за кормой игрока (это делает дрон), а берёт упреждение:
 * решает уравнение встречи
 *   | P + Vp·t - H | = Vs·t
 * и летит в точку P + Vp·t - туда, где игрок окажется. Скорость тарана
 * заведомо выше скорости игрока (HUNTER_SPEED), поэтому решение существует
 * при любой геометрии.
 *
 * Если точной встречи нет (игрок ушёл строго от нас быстрее тарана),
 * упреждение берётся на время перелёта до текущей позиции игрока: цель
 * маршрута существует всегда, поведение не вырождается в догонялки.
 *
 * Прогноз ограничен по времени (MAX_LOOKAHEAD) и по дистанции (LEAD_MAX_DIST),
 * а точка перехвата удерживается внутри зоны: иначе при длинном прямом курсе
 * игрока точка улетает за барьер, и хантер виснет у стены вместо атаки.
 *
 * У цели хантер НЕ тормозит - на финальном заходе он разворачивается резче и
 * ускоряется. Окно для уклонения при этом остаётся: упреждение считается по
 * текущему курсу игрока, а резкий рывок в сторону смещает точку перехвата,
 * которую хантер не доворачивает из-за ограниченной скорости разворота.
 */

import { solveInterceptTime } from '../../aiming/AimSolver';
import type { EnemyRef } from '../../ecs';
import { clamp, lerpAngle, smoothVelocity } from '../../math';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

// Порог скорости игрока: ниже считаем его неподвижным → точка = его позиция
const MIN_SPEED_EPS = 20;
// Верхние границы прогноза курса: по времени и по дистанции упреждения
const MAX_LOOKAHEAD = 1.0;
const LEAD_MAX_DIST = 260;
// Дальность захода на таран: с неё разворот резче, скорость выше
const STRIKE_DIST = 240;
// Прибавка к скорости в ударе (доля базовой скорости в точке контакта)
const STRIKE_BOOST = 0.18;
// Скорость набора курса, обратные секунды: крейсерский полёт и удар
const TURN_CRUISE = 3.0;
const TURN_STRIKE = 7.0;
// Полоса у барьера, в которой хантер уходит от стены, и запас внутрь зоны,
// до которого сжимается точка перехвата
const WALL_MARGIN = 90;
const ZONE_KEEP_MARGIN = 60;

export class HunterStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const pos = enemy.position;
    const vel = enemy.velocity;
    const marker = enemy.marker;

    // Точка перехвата, пересчитанная в этом кадре
    const aim = this.computeIntercept(
      pos.x, pos.y,
      context.playerX, context.playerY,
      context.playerVx, context.playerVy,
      marker.speed
    );
    this.keepInsideZone(aim, context.zoneX, context.zoneY, context.zoneRadius);

    const gx = aim.x - pos.x;
    const gy = aim.y - pos.y;
    const gd = Math.hypot(gx, gy) || 1;

    // Финальный заход: чем ближе к цели, тем резче разворот и выше скорость.
    // Таран не тормозит у игрока — иначе он лишь виснет рядом, как дрон.
    const strike = clamp(1 - gd / STRIKE_DIST, 0, 1);
    const speed = marker.speed * (1 + STRIKE_BOOST * strike);
    const turnRate = TURN_CRUISE + (TURN_STRIKE - TURN_CRUISE) * strike;

    // Целевая скорость в направлении точки перехвата
    smoothVelocity(vel, (gx / gd) * speed, (gy / gd) * speed, turnRate, dt);

    this.avoidWall(enemy, context, dt);

    // Вращение: смотреть по направлению движения
    const hv = Math.hypot(vel.vx, vel.vy);
    if (hv > 5) {
      const targetAngle = Math.atan2(vel.vy, vel.vx);
      marker.angle = lerpAngle(marker.angle, targetAngle, 1 - Math.exp(-9 * dt));
    }
  }

  /**
   * Аналитический расчёт точки перехвата: куда лететь в этом кадре.
   * Точка есть всегда — при отсутствии точной встречи берётся максимально
   * осмысленное упреждение по курсу игрока.
   */
  private computeIntercept(
    hx: number, hy: number,
    px: number, py: number,
    pvx: number, pvy: number,
    hunterSpeed: number
  ): { x: number; y: number } {
    // Игрок практически стоит — перехватываем в его текущей позиции
    const pSpeed = Math.hypot(pvx, pvy);
    if (pSpeed < MIN_SPEED_EPS) {
      return { x: px, y: py };
    }

    const dx = px - hx;
    const dy = py - hy;

    // Время точной встречи из уравнения a·t² + b·t + c = 0 (общий решатель
    // с вражескими орудиями). Если встречи нет — прогноз на время перелёта
    // до текущей позиции игрока.
    const meet = solveInterceptTime(dx, dy, pvx, pvy, hunterSpeed);
    const flyThrough = Math.hypot(dx, dy) / Math.max(hunterSpeed, 1);

    // Упреждение урезаем и по времени, и по дистанции: точка перехвата должна
    // оставаться в пределах манёвра, а не улетать через всю арену.
    const lead = Math.min(meet ?? flyThrough, MAX_LOOKAHEAD, LEAD_MAX_DIST / pSpeed);

    return { x: px + pvx * lead, y: py + pvy * lead };
  }

  /**
   * Точка перехвата не должна лежать за барьером — иначе хантер догоняет
   * стену вместо игрока и виснет на её отражении.
   */
  private keepInsideZone(
    point: { x: number; y: number },
    zoneX: number, zoneY: number, zoneRadius: number
  ): void {
    if (zoneRadius <= 40) return; // зоны нет (меню, отладочный экран)

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
   * У барьера гасим составляющую скорости наружу: хантер скользит вдоль края,
   * а не тыкается в него (кламп зоны только отражал бы его каждый кадр).
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
    if (outward <= 0) return; // уже уходим от стены

    const weight = clamp(1 - toEdge / WALL_MARGIN, 0, 1);
    const damp = outward * weight * (1 - Math.exp(-8 * dt));
    vel.vx -= rx * damp;
    vel.vy -= ry * damp;
  }
}
