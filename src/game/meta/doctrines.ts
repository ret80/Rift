/**
 * Доктрины — добровольный контракт на забег.
 *
 * Игрок выбирает одну доктрину перед стартом: она даёт заметный бонус и
 * почти всегда чем-то платит. Эффекты выражены в тех же множителях, что и
 * таланты Эха Разлома, поэтому применяются одним кодом и не расходятся
 * с фактической прокачкой.
 */

import type { TKey } from "../../i18n";
import type { MetaBonuses } from "./types";

export interface Doctrine {
  id: string;
  nameKey: TKey;
  descKey: TKey;
  /** Бонусы доктрины поверх талантов мета-дерева. */
  effect: Partial<MetaBonuses>;
}

export const DOCTRINES: Doctrine[] = [
  {
    id: "bulwark",
    nameKey: "meta.docBulwark",
    descKey: "meta.docBulwarkDesc",
    effect: { hpMult: 1.25, speedMult: 0.92 },
  },
  {
    id: "raider",
    nameKey: "meta.docRaider",
    descKey: "meta.docRaiderDesc",
    effect: { speedMult: 1.12, fireRateMult: 1.08 },
  },
  {
    id: "gunner",
    nameKey: "meta.docGunner",
    descKey: "meta.docGunnerDesc",
    effect: { weaponSlots: 1, hpMult: 0.9 },
  },
  {
    id: "swarm",
    nameKey: "meta.docSwarm",
    descKey: "meta.docSwarmDesc",
    effect: { droneSlots: 1, weaponSlots: 1, partsMult: 0.9 },
  },
  {
    id: "salvager",
    nameKey: "meta.docSalvager",
    descKey: "meta.docSalvagerDesc",
    effect: { partsMult: 1.25 },
  },
  {
    id: "usurer",
    nameKey: "meta.docUsurer",
    descKey: "meta.docUsurerDesc",
    effect: { creditsMult: 1.3, hpMult: 0.85 },
  },
  {
    id: "storm",
    nameKey: "meta.docStorm",
    descKey: "meta.docStormDesc",
    effect: { fireRateMult: 1.18, speedMult: 0.9 },
  },
  {
    id: "aegis",
    nameKey: "meta.docAegis",
    descKey: "meta.docAegisDesc",
    effect: { shieldBlockLevel: 2, shieldRegenLevel: 1 },
  },
  {
    id: "glass",
    nameKey: "meta.docGlass",
    descKey: "meta.docGlassDesc",
    effect: { fireRateMult: 1.35, hpMult: 0.75 },
  },
  {
    id: "traveler",
    nameKey: "meta.docTraveler",
    descKey: "meta.docTravelerDesc",
    effect: { speedMult: 1.15, partsMult: 1.1 },
  },
  {
    id: "collector",
    nameKey: "meta.docCollector",
    descKey: "meta.docCollectorDesc",
    effect: { partsMult: 1.1, creditsMult: 1.2 },
  },
  {
    id: "steady",
    nameKey: "meta.docSteady",
    descKey: "meta.docSteadyDesc",
    effect: { hpMult: 1.08, speedMult: 1.08, fireRateMult: 1.08 },
  },
];

/** Доктрина по id; null — неизвестный id. */
export function doctrineById(id: string | null): Doctrine | null {
  if (!id) return null;
  return DOCTRINES.find((doctrine) => doctrine.id === id) ?? null;
}
