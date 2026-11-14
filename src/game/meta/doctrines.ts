/**
 * Доктрины — добровольный контракт на забег.
 *
 * Игрок выбирает одну доктрину перед стартом: она даёт заметный бонус и
 * почти всегда чем-то платит. Эффекты выражены в тех же множителях, что и
 * таланты Эха Разлома, поэтому применяются одним кодом и не расходятся
 * с фактической прокачкой.
 */

import type { TKey } from "../../i18n";
import type { Rng } from "../core/rng";
import type { MetaBonuses } from "./types";

export interface Doctrine {
  id: string;
  nameKey: TKey;
  descKey: TKey;
  /** Бонусы доктрины поверх талантов мета-дерева. */
  effect: Partial<MetaBonuses>;
  /** Минимальный TL Асценсии: до него доктрина в выбор не попадает. */
  minThreatLevel?: number;
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
  // Награды Асценсии: доктрины появляются в выборе только с нужного TL.
  {
    id: "siege",
    nameKey: "meta.docSiege",
    descKey: "meta.docSiegeDesc",
    effect: { weaponSlots: 1, fireRateMult: 1.12, speedMult: 0.9 },
    minThreatLevel: 11,
  },
  {
    id: "ash",
    nameKey: "meta.docAsh",
    descKey: "meta.docAshDesc",
    effect: { shieldBlockLevel: 2, hpMult: 1.1, partsMult: 0.9 },
    minThreatLevel: 14,
  },
  {
    id: "predator",
    nameKey: "meta.docPredator",
    descKey: "meta.docPredatorDesc",
    effect: { speedMult: 1.2, fireRateMult: 1.15, hpMult: 0.85 },
    minThreatLevel: 17,
  },
  {
    id: "absolute",
    nameKey: "meta.docAbsolute",
    descKey: "meta.docAbsoluteDesc",
    effect: { weaponSlots: 1, droneSlots: 1, hpMult: 1.15, partsMult: 0.8 },
    minThreatLevel: 20,
  },
];

/** Открыта ли доктрина на этом TL. */
export function doctrineUnlocked(doctrine: Doctrine, threatLevel: number): boolean {
  return (doctrine.minThreatLevel ?? 0) <= threatLevel;
}

/** Доктрина по id; null — неизвестный id. */
export function doctrineById(id: string | null): Doctrine | null {
  if (!id) return null;
  return DOCTRINES.find((doctrine) => doctrine.id === id) ?? null;
}

/** Награда за босс-волну: игрок выбирает одну доктрину из предложенных. */
export interface DoctrineOffer {
  /** Босс-волна, за которую выдана награда. */
  wave: number;
  /** id предложенных доктрин. */
  options: string[];
}

/**
 * Предложить доктрины на выбор после босс-волны.
 *
 * Действующая доктрина исключается: игрок не должен брать одну и ту же
 * дважды подряд. Порядок детерминирован потоком случайности мира, поэтому
 * запись и симуляция воспроизводятся один в один.
 */
export function pickDoctrineOptions(
  currentId: string | null,
  rng: Rng,
  count = 2,
  threatLevel = 0,
): string[] {
  const pool = DOCTRINES.filter(
    (doctrine) => doctrine.id !== currentId && doctrineUnlocked(doctrine, threatLevel),
  ).map((doctrine) => doctrine.id);
  // Тасование Фишера—Йетса: первые `count` и уходят в предложение.
  for (let i = pool.length - 1; i > 0; i--) {
    const j = rng.int(i + 1);
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  return pool.slice(0, Math.min(count, pool.length));
}
