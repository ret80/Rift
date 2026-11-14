/**
 * Наследие — артефакты, которые выдаёт забег.
 *
 * Артефакт не покупается и не выбирается заранее: после зачистки первой
 * волны забег выдаёт один случайный артефакт и показывает его карточку.
 * Бонус действует до конца забега и складывается с доктриной и талантами
 * Эха Разлома.
 */

import type { TKey } from "../../i18n";
import type { Rng } from "../core/rng";
import type { MetaBonuses } from "./types";

/**
 * Редкость артефакта.
 *
 * Чем сильнее бонус, тем ниже редкость: забег платит карточкой раз в жизни,
 * поэтому «Чёрное сердце» или ядро Эгиды должны выпадать заметно реже
 * обычной пластины предков.
 */
export type LegacyRarity = "common" | "rare" | "epic";

/** Вес выпадения по редкости; доли считаются от суммы весов всех артефактов. */
export const LEGACY_RARITY_WEIGHTS: Record<LegacyRarity, number> = {
  common: 10,
  rare: 5,
  epic: 2,
};

export interface LegacyArtifact {
  id: string;
  nameKey: TKey;
  descKey: TKey;
  /** Редкость: задаёт шанс выпадения. */
  rarity: LegacyRarity;
  /** Бонусы артефакта поверх талантов и доктрины. */
  effect: Partial<MetaBonuses>;
  /** Минимальный TL Асценсии: до него артефакт не выпадает. */
  minThreatLevel?: number;
}

export const LEGACY_ARTIFACTS: LegacyArtifact[] = [
  {
    id: "hull_plate",
    nameKey: "meta.legHullPlate",
    descKey: "meta.legHullPlateDesc",
    rarity: "common",
    effect: { hpMult: 1.15 },
  },
  {
    id: "ion_drive",
    nameKey: "meta.legIonDrive",
    descKey: "meta.legIonDriveDesc",
    rarity: "common",
    effect: { speedMult: 1.08 },
  },
  {
    id: "targeting_core",
    nameKey: "meta.legTargetingCore",
    descKey: "meta.legTargetingCoreDesc",
    rarity: "common",
    effect: { fireRateMult: 1.1 },
  },
  {
    id: "drone_bay",
    nameKey: "meta.legDroneBay",
    descKey: "meta.legDroneBayDesc",
    rarity: "rare",
    effect: { droneSlots: 1 },
  },
  {
    id: "weapon_hardpoint",
    nameKey: "meta.legWeaponHardpoint",
    descKey: "meta.legWeaponHardpointDesc",
    rarity: "rare",
    effect: { weaponSlots: 1 },
  },
  {
    id: "salvage_magnet",
    nameKey: "meta.legSalvageMagnet",
    descKey: "meta.legSalvageMagnetDesc",
    rarity: "common",
    effect: { partsMult: 1.2 },
  },
  {
    id: "credit_note",
    nameKey: "meta.legCreditNote",
    descKey: "meta.legCreditNoteDesc",
    rarity: "common",
    effect: { creditsMult: 1.15 },
  },
  {
    id: "shield_matrix",
    nameKey: "meta.legShieldMatrix",
    descKey: "meta.legShieldMatrixDesc",
    rarity: "rare",
    effect: { shieldBlockLevel: 1, shieldRegenLevel: 1 },
  },
  {
    id: "overdrive",
    nameKey: "meta.legOverdrive",
    descKey: "meta.legOverdriveDesc",
    rarity: "epic",
    effect: { speedMult: 1.08, fireRateMult: 1.06 },
  },
  {
    id: "aegis_core",
    nameKey: "meta.legAegisCore",
    descKey: "meta.legAegisCoreDesc",
    rarity: "epic",
    effect: { shieldBlockLevel: 2 },
  },
  {
    id: "archivist",
    nameKey: "meta.legArchivist",
    descKey: "meta.legArchivistDesc",
    rarity: "rare",
    effect: { partsMult: 1.15, creditsMult: 1.1 },
  },
  {
    id: "black_heart",
    nameKey: "meta.legBlackHeart",
    descKey: "meta.legBlackHeartDesc",
    rarity: "epic",
    effect: { hpMult: 1.2, speedMult: 0.95 },
  },
  // Награды Асценсии: артефакты выпадают только начиная с нужного TL.
  {
    id: "rift_core",
    nameKey: "meta.legRiftCore",
    descKey: "meta.legRiftCoreDesc",
    rarity: "epic",
    effect: { shieldBlockLevel: 3, shieldRegenLevel: 2 },
    minThreatLevel: 12,
  },
  {
    id: "hunter_mark",
    nameKey: "meta.legHunterMark",
    descKey: "meta.legHunterMarkDesc",
    rarity: "epic",
    effect: { fireRateMult: 1.2, speedMult: 1.1 },
    minThreatLevel: 15,
  },
  {
    id: "ancestral_alloy",
    nameKey: "meta.legAncestralAlloy",
    descKey: "meta.legAncestralAlloyDesc",
    rarity: "epic",
    effect: { hpMult: 1.3, partsMult: 1.15 },
    minThreatLevel: 18,
  },
  {
    id: "abyss_crown",
    nameKey: "meta.legAbyssCrown",
    descKey: "meta.legAbyssCrownDesc",
    rarity: "epic",
    effect: { hpMult: 1.25, fireRateMult: 1.15, speedMult: 1.1 },
    minThreatLevel: 20,
  },
];

/** Артефакты, доступные на этом TL. */
export function availableArtifacts(threatLevel: number): LegacyArtifact[] {
  return LEGACY_ARTIFACTS.filter((artifact) => (artifact.minThreatLevel ?? 0) <= threatLevel);
}

/** Карточка выданного артефакта: за какую волну и что именно досталось. */
export interface LegacyAward {
  /** Зачищенная волна, за которую выдан артефакт. */
  wave: number;
  /** id выданного артефакта. */
  id: string;
}

/** Артефакт по id; null — неизвестный id. */
export function artifactById(id: string | null): LegacyArtifact | null {
  if (!id) return null;
  return LEGACY_ARTIFACTS.find((artifact) => artifact.id === id) ?? null;
}

/** Шанс артефакта в процентах среди доступных на TL. */
export function artifactChance(artifact: LegacyArtifact, threatLevel = 0): number {
  const total = availableArtifacts(threatLevel).reduce(
    (sum, entry) => sum + LEGACY_RARITY_WEIGHTS[entry.rarity],
    0,
  );
  return total > 0 ? (LEGACY_RARITY_WEIGHTS[artifact.rarity] / total) * 100 : 0;
}

/**
 * Случайный артефакт с учётом редкости.
 *
 * Один бросок `rng.next()` и взвешенное вычитание весов: сильные артефакты
 * выпадают реже, но никогда не исключены полностью. Источник случайности —
 * поток мира, поэтому запись и симуляция воспроизводятся один в один.
 */
export function pickLegacyArtifact(rng: Rng, threatLevel = 0): LegacyArtifact | null {
  const pool = availableArtifacts(threatLevel);
  const total = pool.reduce((sum, artifact) => sum + LEGACY_RARITY_WEIGHTS[artifact.rarity], 0);
  if (total <= 0) return null;
  let roll = rng.next() * total;
  for (const artifact of pool) {
    roll -= LEGACY_RARITY_WEIGHTS[artifact.rarity];
    if (roll < 0) return artifact;
  }
  // Попадание ровно в верхнюю границу: последний элемент забирает остаток.
  return pool[pool.length - 1] ?? null;
}
