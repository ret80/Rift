/* ============================================================
   Loadout slots — HUD representation of weapons and bonuses.

   Every weapon and every bonus gets one slot in the loadout row
   rendered under the top HUD bar. The slot shows the matching icon
   with a ring around it:

   • weapon  → ring shows the reload time (fills up as it recharges)
   • bonus   → ring shows the remaining lifetime (drains as it expires)
   • instant → no timer, the icon flashes briefly and disappears
   ============================================================ */

import type { PickupKind } from "./drops";

/** Slot kinds rendered in the HUD loadout row. */
export type LoadoutKind =
  /* weapons */
  | "cannon"
  | "missile"
  | "drone"
  /* timed bonuses */
  | "rate"
  | "guns"
  | "dash"
  /* instant bonuses */
  | "heal"
  | "mineral"
  | "mine";

/** One rendered slot of the HUD loadout row. */
export interface LoadoutSlotData {
  kind: LoadoutKind;
  /** Ring fill, 0..1. */
  progress: number;
  /** Seconds left on the timer (0 for slots without a timer). */
  remaining: number;
}

/** How long an instant bonus (heal / mineral / mine) stays on screen. */
export const INSTANT_BONUS_FLASH = 1.8;

/** Canonical row order — weapons first, then bonuses. */
export const LOADOUT_ORDER: LoadoutKind[] = [
  "cannon",
  "missile",
  "drone",
  "rate",
  "guns",
  "dash",
  "mine",
  "heal",
  "mineral",
];

/** Position of a kind in the canonical row order. */
export const LOADOUT_SORT: Record<LoadoutKind, number> = LOADOUT_ORDER.reduce(
  (acc, kind, i) => {
    acc[kind] = i;
    return acc;
  },
  {} as Record<LoadoutKind, number>,
);

/** Map a collected pickup to the loadout slot it drives. */
export function loadoutKindForPickup(kind: PickupKind): LoadoutKind | null {
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
    case "gun":
      return "guns";
    case "drone":
      return "drone";
    case "dash":
      return "dash";
    case "miner":
    case "mine":
      return "mine";
    case "mineral":
      return "mineral";
    case "missile":
      return "missile";
    default:
      return null;
  }
}
