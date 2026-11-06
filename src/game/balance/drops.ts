/* ============================================================
   Drop chances — per-enemy-kind pickup probability.
   ============================================================ */

import type { EnemyKind } from "./enemies";

/* ------------------------------- pickup kinds ------------------------------- */

export type PickupKind =
  | "heal"
  | "rate20"
  | "rate40"
  | "rate60"
  | "gun"
  | "drone"
  | "shield"
  | "rate"
  | "missile"
  | "laser"
  | "quantum_swap";

/** All possible pickup kinds in display order */
export const ALL_PICKUP_KINDS: PickupKind[] = [
  "heal",
  "rate20",
  "rate40",
  "rate60",
  "gun",
  "drone",
  "shield",
  "rate",
  "missile",
  "laser",
  "quantum_swap",
];

/* ------------------------------- drop chances ------------------------------- */

/** Chance that destroying this enemy drops any bonus at all. */
export function dropChanceFor(kind: EnemyKind): number {
  switch (kind) {
    case "drone":
      return 0.07;
    case "hunter":
      return 0.25;
    case "fighter":
      return 0.1;
    case "cruiser":
      return 0.25;
    case "carrier":
      return 0.7;
    case "miner":
      return 0.3;
    case "boss":
      return 0.9;
    case "mine":
      return 0;
    /* c8 ignore next 2 */
    default:
      return 0;
  }
}

/* ------------------------------- asteroid kinds ------------------------------- */

/* ------------------------------- economy ------------------------------- */

/** Бонус за зачистку волны: база и прибавка за номер волны. */
export const WAVE_CLEAR_PARTS_BASE = 15;
export const WAVE_CLEAR_PARTS_PER_WAVE = 6;
/**
 * Множитель бонуса зачистки, если волна закрыта без единого полученного удара.
 *
 * Награда должна зависеть от того, как игрок сыграл, а не от того, сколько
 * времени он провёл в бою: раньше за простой платила «страховка за выживание»,
 * теперь — только чистая работа.
 */
export const WAVE_CLEAN_CLEAR_MULT = 1.5;
/** Сколько касаний (graze) дают одну деталь. */
export const GRAZE_PARTS_PER_COIN = 5;
/** Потолок деталей за graze на одной волне. */
export const GRAZE_PARTS_WAVE_CAP = 20;
/** Прибавка к деталям за убийство за каждую ступень комбо. */
export const KILL_PARTS_COMBO_STEP = 0.15;
/** Потолок множителя деталей за комбо. */
export const KILL_PARTS_COMBO_CAP = 2;

/**
 * Множитель деталей за убийство по текущему комбо.
 *
 * Комбо считается от 1.0 (без серии) до 10.0: за серию платим до ×2, но не
 * больше, иначе один удачный рой перекрывает всю волну.
 */
export function killPartsMultiplier(comboMult: number): number {
  const steps = Math.max(0, comboMult - 1);
  return Math.min(KILL_PARTS_COMBO_CAP, 1 + steps * KILL_PARTS_COMBO_STEP);
}

/** Детали за зачистку волны. */
export function waveClearParts(wave: number): number {
  return WAVE_CLEAR_PARTS_BASE + WAVE_CLEAR_PARTS_PER_WAVE * Math.max(1, Math.floor(wave));
}

export type AsteroidKind = "small" | "medium" | "large";
