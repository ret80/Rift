/**
 * BulletRenderer — отрисовка пуль игрока и врагов.
 * Извлечён из RendererSystem для разделения ответственности.
 */

import { C } from "../../balance";
import { rgba } from "../../math";
import type { Renderer, RGBA } from "../../render";

export interface BulletRenderState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  r?: number;
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
 * Строит render-state из raw-массива пуль.
 * BulletRenderState структурно идентичен Bullet.
 */
export function buildBulletState(bullets: unknown[]): BulletRenderState[] {
  return bullets as unknown as BulletRenderState[];
}

/**
 * Строит render-state из raw-массива вражеских пуль.
 */
export function buildEBulletState(bullets: unknown[]): EBulletRenderState[] {
  return bullets as unknown as EBulletRenderState[];
}

/**
 * Нарисовать все пули (игрока и врагов).
 */
export function renderBullets(
  R: Renderer,
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
function renderPlayerBullet(R: Renderer, b: BulletRenderState): void {
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

/** Отрисовка пули врага с учётом типа. */
function renderEnemyBullet(R: Renderer, b: EBulletRenderState): void {
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
