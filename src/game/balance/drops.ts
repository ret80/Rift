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
/** Страховка за выживание: одна деталь за интервал и потолок за забег. */
export const SURVIVAL_PARTS_INTERVAL = 3;
export const SURVIVAL_PARTS_CAP = 30;

/** Детали за зачистку волны. */
export function waveClearParts(wave: number): number {
  return WAVE_CLEAR_PARTS_BASE + WAVE_CLEAR_PARTS_PER_WAVE * Math.max(1, Math.floor(wave));
}

export type AsteroidKind = "small" | "medium" | "large";
