/**
 * BulletRenderer — отрисовка пуль игрока и врагов.
 * Извлечён из RendererSystem для разделения ответственности.
 */

import { C } from "../../balance";
import { rgba } from "../../math";
import type { IRenderer } from "../../render/index";
import type { BulletRef, EnemyBulletRef } from "../../ecs";

export interface BulletRenderState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  r?: number;
  /** Самонаводящийся снаряд (ракета) — рисуется крупным корпусом с носом. */
  homing?: unknown;
}

export interface EBulletRenderState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  heavy: boolean;
  cruiser: boolean;
}

/**
 * Строит render-state из живых связок снарядов игрока.
 */
export function buildBulletState(bullets: BulletRef[]): BulletRenderState[] {
  return bullets.map((b) => ({
    x: b.position.x,
    y: b.position.y,
    vx: b.velocity.vx,
    vy: b.velocity.vy,
    life: b.life.remaining,
    dmg: b.bullet.dmg,
    homing: b.homing,
  }));
}

/**
 * Строит render-state из живых связок вражеских снарядов.
 */
export function buildEBulletState(bullets: EnemyBulletRef[]): EBulletRenderState[] {
  return bullets.map((b) => ({
    x: b.position.x,
    y: b.position.y,
    vx: b.velocity.vx,
    vy: b.velocity.vy,
    life: b.life.remaining,
    dmg: b.bullet.dmg,
    heavy: b.bullet.heavy,
    cruiser: b.bullet.cruiser,
  }));
}

/**
 * Нарисовать все пули (игрока и врагов).
 */
export function renderBullets(
  R: IRenderer,
  bullets: BulletRenderState[],
  ebullets: EBulletRenderState[]
): void {
  for (const b of bullets) {
    renderPlayerBullet(R, b);
  }
  for (const b of ebullets) {
    renderEnemyBullet(R, b);
  }
}

/** Отрисовка пули игрока. */
function renderPlayerBullet(R: IRenderer, b: BulletRenderState): void {
  if (b.homing) {
    renderMissile(R, b);
    return;
  }
  if (b.r && b.r > 0) {
    const col = rgba(C.bullet, 0.95);
    R.circle(b.x, b.y, b.r, col, 10);
    R.circle(b.x, b.y, b.r * 0.6, rgba(C.white, 0.35), 8);
    return;
  }
  const l = 7;
  const d = Math.hypot(b.vx, b.vy) || 1;
  R.pushLine(
    b.x - (b.vx / d) * l, b.y - (b.vy / d) * l,
    b.x, b.y,
    rgba(C.bullet, 0.95)
  );
}

/**
 * Ракета: небольшой прямоугольный корпус с треугольным носом-пирамидой,
 * хвостовыми стабилизаторами и продольной осью. Размер — примерно
 * с дрона-компаньона, чтобы не превышать корабль. Ориентация — по скорости.
 */
function renderMissile(R: IRenderer, b: BulletRenderState): void {
  const angle = Math.atan2(b.vy, b.vx);
  const col = rgba("#9dffe8", 0.95);
  const core = rgba("#eaffff", 0.5);

  // Корпус (прямоугольник).
  R.drawPolygon(b.x, b.y, angle, [[-5, -2], [4, -2], [4, 2], [-5, 2]], col);
  // Нос — пирамида (треугольник) на конце.
  R.drawPolygon(b.x, b.y, angle, [[4, -2], [9, 0], [4, 2]], col);
  // Хвостовые стабилизаторы.
  R.drawPolygon(b.x, b.y, angle, [[-5, -2], [-7.5, -4]], col, false);
  R.drawPolygon(b.x, b.y, angle, [[-5, 2], [-7.5, 4]], col, false);
  // Продольная ось ракеты.
  R.drawPolygon(b.x, b.y, angle, [[-5.5, 0], [4, 0]], core, false);
}

/** Отрисовка пули врага с учётом типа. */
function renderEnemyBullet(R: IRenderer, b: EBulletRenderState): void {
  if (b.cruiser) {
    // Cruiser bullets: large and ominous
    R.circle(b.x, b.y, 5.5, rgba(C.enemyBullet, 1), 12);
    R.circle(b.x, b.y, 3.2, rgba(C.white, 0.5), 8);
  } else if (b.heavy) {
    R.circle(b.x, b.y, 3.4, rgba(C.enemyBullet, 0.95), 10);
  } else {
    const l = 6;
    const d = Math.hypot(b.vx, b.vy) || 1;
    R.pushLine(
      b.x - (b.vx / d) * l, b.y - (b.vy / d) * l,
      b.x, b.y,
      rgba(C.enemyBullet, 0.9)
    );
  }
}
