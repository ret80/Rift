/**
 * ArchetypeMovement — общие примитивы движения для архетипов Mechanic 3.
 *
 * Стратегии не должны дублировать формулы удержания дистанции и разворота.
 * Здесь только чистая геометрия: угол на точку удержания, поворот скорости
 * к желаемому курсу и удержание точки внутри арены.
 */

import type { EnemyRef } from "../../ecs";
import { clamp, lerpAngle, smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";

/** Направить скорость и нос врага к желаемому курсу. */
export function steer(
  enemy: EnemyRef,
  desiredAngle: number,
  speed: number,
  turnRate: number,
  dt: number,
): void {
  const vx = Math.cos(desiredAngle) * speed;
  const vy = Math.sin(desiredAngle) * speed;
  smoothVelocity(enemy.velocity, vx, vy, turnRate, dt);

  const velSpeed = Math.hypot(enemy.velocity.vx, enemy.velocity.vy);
  if (velSpeed > 5) {
    const velAngle = Math.atan2(enemy.velocity.vy, enemy.velocity.vx);
    enemy.marker.angle = lerpAngle(
      enemy.marker.angle,
      velAngle,
      1 - Math.exp(-8 * dt),
    );
  }
}

/** Угол движения на кольцо удержания вокруг игрока. */
export function standoffAngle(
  enemy: EnemyRef,
  context: GameContext,
  standoff: number,
  strafeDir: number,
): number {
  const dx = context.playerX - enemy.position.x;
  const dy = context.playerY - enemy.position.y;
  const dist = Math.hypot(dx, dy) || 1;
  const angleToPlayer = Math.atan2(dy, dx);
  const err = dist - standoff;
  const mix = clamp(Math.abs(err) / 140, 0, 1);
  const radial = angleToPlayer + (err > 0 ? 0 : Math.PI);
  const tangent = angleToPlayer + (Math.PI / 2) * strafeDir;
  return lerpAngle(tangent, radial, mix);
}

/** Удержать точку внутри зоны с отступом margin. */
export function keepInsideZone(
  point: { x: number; y: number },
  context: GameContext,
  margin: number,
): void {
  if (context.zoneRadius <= margin * 2) return;
  const dx = point.x - context.zoneX;
  const dy = point.y - context.zoneY;
  const dist = Math.hypot(dx, dy);
  const limit = context.zoneRadius - margin;
  if (dist > limit && dist > 0.001) {
    const k = limit / dist;
    point.x = context.zoneX + dx * k;
    point.y = context.zoneY + dy * k;
  }
}

/** Угол на упреждённую позицию игрока через lead секунд. */
export function leadAngle(
  enemy: EnemyRef,
  context: GameContext,
  lead = 0.35,
): number {
  return Math.atan2(
    context.playerY + context.playerVy * lead - enemy.position.y,
    context.playerX + context.playerVx * lead - enemy.position.x,
  );
}

/** Привести угол к диапазону (−π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle % (Math.PI * 2);
  if (a > Math.PI) a -= Math.PI * 2;
  if (a <= -Math.PI) a += Math.PI * 2;
  return a;
}
