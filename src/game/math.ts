/* Pure math & color helpers shared across the engine. */

import type { RGBA } from "./render/index";

/** Источник случайности в диапазоне [0, 1); по умолчанию — Math.random. */
export type RandomSource = () => number;

export const TAU = Math.PI * 2;

export function rand(a: number, b: number) {
  return a + Math.random() * (b - a);
}

export function clamp(v: number, a: number, b: number) {
  return Math.max(a, Math.min(b, v));
}

/** Linear 0..1 ramp between waves s and f, clamped. */
export function ramp01(v: number, s: number, f: number) {
  return clamp((v - s) / (f - s), 0, 1);
}

export function lerpAngle(a: number, b: number, k: number) {
  // Нормализация разности углов на кратчайший путь
  let d = b - a;
  d = ((d % TAU) + TAU) % TAU;
  if (d > Math.PI) d -= TAU;
  
  // Catastrophic shift protection > PI (angular overflow)
  const maxDelta = Math.PI * 0.9;
  if (Math.abs(d) > maxDelta && k > 0.5) {
    // Слишком большой скачок — ограничиваем
    d = Math.sign(d) * maxDelta;
  }
  
  return a + d * k;
}

export function easeOutCubic(x: number) {
  return 1 - Math.pow(1 - x, 3);
}

/**
 * Parse hex color (#RRGGBB) to RGBA array.
 * Note: no caching — call sites should memoize if called per-frame.
 */
export function rgba(hex: string, a: number): RGBA {
  const r = parseInt(hex.slice(1, 3), 16) / 255;
  const g = parseInt(hex.slice(3, 5), 16) / 255;
  const b = parseInt(hex.slice(5, 7), 16) / 255;
  return [r, g, b, a];
}

/** Deterministic seeded PRNG (chunked star/asteroid fields). */
export function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Lightweight deterministic PRNG (simple LCG) — for game logic randomness. */
export function createRng(seed: number) {
  let s = (seed | 0) || 1;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

// ============================== AI helpers ==============================

/**
 * Вычислить угол от позиции (fx, fy) до позиции (tx, ty).
 * Утилита для AI-стратегий — заменяет повторяющийся Math.atan2(dy, dx).
 */
export function angleTo(fx: number, fy: number, tx: number, ty: number): number {
  return Math.atan2(ty - fy, tx - fx);
}

/**
 * Плавное применение target velocity к enemy с exponential smoothing.
 * Используется во всех AI-стратегиях — заменяет дублирующийся паттерн:
 *   const k = 1 - Math.exp(-rate * dt);
 *   enemy.vx += (targetVx - enemy.vx) * k;
 *   enemy.vy += (targetVy - enemy.vy) * k;
 *
 * @param enemy — объект врага с полями vx, vy
 * @param targetVx, targetVy — целевая скорость
 * @param rate — коэффициент сглаживания (чем больше, тем резче поворот)
 */
export function smoothVelocity(
  enemy: { vx: number; vy: number },
  targetVx: number,
  targetVy: number,
  rate: number,
  dt: number
): void {
  const k = 1 - Math.exp(-rate * dt);
  enemy.vx += (targetVx - enemy.vx) * k;
  enemy.vy += (targetVy - enemy.vy) * k;
}
