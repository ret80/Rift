/* ============================================================
   Drop chances — per-enemy-kind pickup probability.
   ============================================================ */

import type { EnemyKind } from "./enemies";

/* ------------------------------- pickup kinds ------------------------------- */

export type PickupKind =
  | "heal25"
  | "heal50"
  | "heal100"
  | "rate20"
  | "rate40"
  | "rate60"
  | "gun"
  | "drone"
  | "dash"
  | "mineral"
  | "hp"
  | "rate"
  | "missile";

/** All possible pickup kinds in display order */
export const ALL_PICKUP_KINDS: PickupKind[] = [
  "heal25",
  "heal50",
  "heal100",
  "rate20",
  "rate40",
  "rate60",
  "gun",
  "drone",
  "dash",
  "mineral",
  "hp",
  "rate",
  "missile",
];

/** Map pickup kind to a canonical display key */
export function pickupDisplayKey(kind: PickupKind): string {
  switch (kind) {
    case "heal25":
    case "heal50":
    case "heal100":
    case "hp":
      return "heal";
    case "rate20":
    case "rate40":
    case "rate60":
    case "rate":
      return "rate";
    default:
      return kind;
  }
}

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

export type AsteroidKind = "small" | "medium" | "large";
