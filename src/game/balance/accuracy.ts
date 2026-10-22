/* ============================================================
    Accuracy balance — шансы попадания орудий игрока и врагов.
    Ни один шанс никогда не достигает 100%: потолок задаётся
    AIM_CHANCE_CEILING из aiming.ts и собственным максимумом линии.
    ============================================================ */

import { clamp } from "../math";
import { AIM_CHANCE_CEILING, AIM_CHANCE_FLOOR } from "./aiming";
import type { EnemyKind } from "./enemies";

/* ------------------------------ Игрок ------------------------------ */

/** Шанс попадания автонаведения без прокачки точности (0..1). */
export const PLAYER_AIM_BASE_CHANCE = 0.75;

/** Прирост шанса попадания за один уровень апгрейда «точность». */
export const PLAYER_AIM_PER_LEVEL = 0.05;

/** Потолок шанса попадания игрока — сколько бы уровней ни было куплено. */
export const PLAYER_AIM_MAX_CHANCE = 0.95;

/**
 * Шанс попадания орудия игрока по уровню апгрейда «точность».
 * Уровень 0 — базовый шанс, дальше линейно до PLAYER_AIM_MAX_CHANCE.
 */
export function playerHitChance(level: number): number {
  const raw = PLAYER_AIM_BASE_CHANCE + Math.max(0, level) * PLAYER_AIM_PER_LEVEL;
  return Math.min(raw, PLAYER_AIM_MAX_CHANCE, AIM_CHANCE_CEILING);
}

/* ------------------------------ Враги ------------------------------ */

/** Шанс попадания на первой волне (0..1). */
export const ENEMY_AIM_BASE_CHANCE = 0.2;

/** Прирост шанса попадания за каждую волну. */
export const ENEMY_AIM_PER_WAVE = 0.012;

/** Волна, после которой меткость врагов перестаёт расти. */
export const ENEMY_AIM_RAMP_WAVE = 30;

/** Потолок шанса попадания врагов — до 100% дело не доходит никогда. */
export const ENEMY_AIM_MAX_CHANCE = 0.5;

/**
 * Вклад класса врага в меткость.
 * Нет записи в таблице — враг стреляет с полной расчётной меткостью.
 */
export const ENEMY_AIM_KIND_MULT: Partial<Record<EnemyKind, number>> = {
  fighter: 1,
  cruiser: 0.9,
  carrier: 0.7,
};

/**
 * Шанс попадания орудия врага на заданной волне.
 * Растёт линейно до ENEMY_AIM_RAMP_WAVE и упирается в ENEMY_AIM_MAX_CHANCE.
 */
export function enemyHitChance(wave: number, kind: EnemyKind): number {
  const steps = clamp(wave - 1, 0, ENEMY_AIM_RAMP_WAVE - 1);
  const mult = ENEMY_AIM_KIND_MULT[kind] ?? 1;
  const raw = (ENEMY_AIM_BASE_CHANCE + steps * ENEMY_AIM_PER_WAVE) * mult;
  return clamp(raw, AIM_CHANCE_FLOOR, Math.min(ENEMY_AIM_MAX_CHANCE, AIM_CHANCE_CEILING));
}
