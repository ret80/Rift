/**
 * PickupCatalog — единый каталог видов пикапов.
 * Описывает эффект подбора и канонический отображаемый ключ.
 * Добавление нового пикапа = запись здесь + (при необходимости) dropChanceFor.
 */

import type { PickupKind } from "./drops";
import { C } from "./player";

/** Канонический ключ отображения (группа пикапа). */
export type PickupDisplay =
  | "heal"
  | "rate"
  | "gun"
  | "shield"
  | "mineral"
  | "drone"
  | "missile"
  | "laser"
  | "quantum_swap";

/** Вид эффекта подбора пикапа. */
export type PickupEffect =
  | { type: "heal"; amount: number }
  | { type: "bonus" }
  | { type: "shield"; amount: number }
  | { type: "weapon"; id: "cannon" | "missile" | "drone" | "laser" }
  | { type: "ability"; id: "quantum_swap" }
  | { type: "mineral"; amount: number; score: number };

/** Описание пикапа: эффект и канонический ключ отображения. */
export interface PickupDefinition {
  /** Канонический ключ отображения (heal | rate | ...). */
  display: PickupDisplay;
  /** Цвет пикапа. */
  color: string;
  /** Эффект подбора. */
  effect: PickupEffect;
}

/** Каталог всех пикапов. */
export const PICKUP_CATALOG: Record<PickupKind, PickupDefinition> = {
  heal25: { display: "heal", color: C.heal, effect: { type: "heal", amount: 25 } },
  heal50: { display: "heal", color: C.heal, effect: { type: "heal", amount: 50 } },
  heal100: { display: "heal", color: C.heal, effect: { type: "heal", amount: 100 } },
  hp: { display: "heal", color: C.heal, effect: { type: "heal", amount: 25 } },
  rate20: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  rate40: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  rate60: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  rate: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  gun: { display: "gun", color: C.player, effect: { type: "bonus" } },
  shield: { display: "shield", color: C.shield, effect: { type: "shield", amount: 40 } },
  mineral: { display: "mineral", color: C.heal, effect: { type: "mineral", amount: 1, score: 50 } },
  drone: { display: "drone", color: C.mint, effect: { type: "weapon", id: "drone" } },
  missile: { display: "missile", color: C.bullet, effect: { type: "weapon", id: "missile" } },
  laser: { display: "laser", color: "#ff4d6d", effect: { type: "weapon", id: "laser" } },
  quantum_swap: { display: "quantum_swap", color: "#7cf3ff", effect: { type: "ability", id: "quantum_swap" } },
};

/** Канонический ключ отображения пикапа. */
export function pickupDisplayKey(kind: PickupKind): PickupDisplay {
  return PICKUP_CATALOG[kind].display;
}