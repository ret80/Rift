/**
 * PickupCatalog — единый каталог видов пикапов.
 * Описывает эффект подбора и канонический отображаемый ключ.
 * Добавление нового пикапа = запись здесь + (при необходимости) dropChanceFor.
 */

import type { PickupKind } from "./drops";
import { C } from "./player";
import type { WeaponPickupDisplay, WeaponPickupId } from "../weapons/WeaponCatalog";
import { WEAPON_CATALOG } from "../weapons/WeaponCatalog";

/** Канонический ключ отображения (группа пикапа). */
export type PickupDisplay =
  | "heal"
  | "rate"
  | "gun"
  | "shield"
  | WeaponPickupDisplay
  | "quantum_swap";

/** Вид эффекта подбора пикапа. */
export type PickupEffect =
  | { type: "heal" }
  | { type: "bonus" }
  | { type: "shield"; amount: number }
  | { type: "weapon"; id: WeaponPickupId }
  | { type: "ability"; id: "quantum_swap" };

/** Описание пикапа: эффект и канонический ключ отображения. */
export interface PickupDefinition {
  /** Канонический ключ отображения (heal | rate | ...). */
  display: PickupDisplay;
  /** Цвет пикапа. */
  color: string;
  /** Эффект подбора. */
  effect: PickupEffect;
}

/** Запись пикапа, выдающего оружие, из общего каталога оружия. */
function weaponPickup(id: WeaponPickupId): PickupDefinition {
  const def = WEAPON_CATALOG[id].pickup;
  if (!def) throw new Error(`Оружие без пикапа: ${id}`);
  return { display: def.display, color: def.color, effect: { type: "weapon", id } };
}

/** Каталог всех пикапов. */
export const PICKUP_CATALOG: Record<PickupKind, PickupDefinition> = {
  heal: { display: "heal", color: C.heal, effect: { type: "heal" } },
  rate20: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  rate40: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  rate60: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  rate: { display: "rate", color: C.fighter, effect: { type: "bonus" } },
  gun: { display: "gun", color: C.player, effect: { type: "bonus" } },
  shield: { display: "shield", color: C.shield, effect: { type: "shield", amount: 40 } },
  drone: weaponPickup("drone"),
  missile: weaponPickup("missile"),
  laser: weaponPickup("laser"),
  quantum_swap: { display: "quantum_swap", color: "#7cf3ff", effect: { type: "ability", id: "quantum_swap" } },
};

/** Канонический ключ отображения пикапа. */
export function pickupDisplayKey(kind: PickupKind): PickupDisplay {
  return PICKUP_CATALOG[kind].display;
}