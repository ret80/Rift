/* ============================================================
   Impact damage — урон от столкновений зависит от скорости сближения.
   ============================================================ */

import type { AsteroidKind } from "./drops";

/** Скорость сближения, при которой контакт наносит базовый урон. */
export const IMPACT_REF_SPEED = 300;

/** Минимальная доля базового урона: даже медленное касание ощутимо. */
export const IMPACT_MIN_FACTOR = 0.25;

/** Максимальная доля: таран на полной скорости не умножает урон бесконечно. */
export const IMPACT_MAX_FACTOR = 2.0;

/** Потолок урона от контакта с врагом, доля max HP игрока. */
export const ENEMY_CONTACT_CAP_FRACTION = 0.35;

/** Потолок урона от контакта с астероидом, доля max HP игрока. */
export const ASTEROID_CONTACT_CAP_FRACTION = 0.45;

/** Базовый урон астероида по размеру (до множителя скорости). */
export const ASTEROID_CONTACT_BASE: Record<AsteroidKind, number> = {
  small: 8,
  medium: 16,
  large: 28,
};

/**
 * Множитель урона по скорости сближения.
 * 300 px/s — база; ниже 75 px/s урон не превышает 25% базового.
 */
export function impactFactor(speed: number): number {
  if (!Number.isFinite(speed) || speed <= 0) return IMPACT_MIN_FACTOR;
  return Math.max(IMPACT_MIN_FACTOR, Math.min(IMPACT_MAX_FACTOR, speed / IMPACT_REF_SPEED));
}
