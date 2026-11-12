/**
 * Наследие — артефакты, которые открываются достижениями и выбираются
 * перед забегом.
 *
 * Артефакт не покупается: он открывается за лучшую дошедшую волну и даёт
 * постоянный бонус, пока выбран. Слот один, поэтому игрок выбирает между
 * знакомыми бонусами, а не собирает всё сразу.
 */

import type { TKey } from "../../i18n";
import type { MetaBonuses } from "./types";

export interface LegacyArtifact {
  id: string;
  nameKey: TKey;
  descKey: TKey;
  /** Лучшая волна, начиная с которой артефакт открыт. */
  unlockWave: number;
  /** Бонусы артефакта поверх талантов и доктрины. */
  effect: Partial<MetaBonuses>;
}

export const LEGACY_ARTIFACTS: LegacyArtifact[] = [
  {
    id: "hull_plate",
    nameKey: "meta.legHullPlate",
    descKey: "meta.legHullPlateDesc",
    unlockWave: 3,
    effect: { hpMult: 1.15 },
  },
  {
    id: "ion_drive",
    nameKey: "meta.legIonDrive",
    descKey: "meta.legIonDriveDesc",
    unlockWave: 6,
    effect: { speedMult: 1.08 },
  },
  {
    id: "targeting_core",
    nameKey: "meta.legTargetingCore",
    descKey: "meta.legTargetingCoreDesc",
    unlockWave: 10,
    effect: { fireRateMult: 1.1 },
  },
  {
    id: "drone_bay",
    nameKey: "meta.legDroneBay",
    descKey: "meta.legDroneBayDesc",
    unlockWave: 14,
    effect: { droneSlots: 1 },
  },
  {
    id: "weapon_hardpoint",
    nameKey: "meta.legWeaponHardpoint",
    descKey: "meta.legWeaponHardpointDesc",
    unlockWave: 18,
    effect: { weaponSlots: 1 },
  },
  {
    id: "salvage_magnet",
    nameKey: "meta.legSalvageMagnet",
    descKey: "meta.legSalvageMagnetDesc",
    unlockWave: 22,
    effect: { partsMult: 1.2 },
  },
  {
    id: "credit_note",
    nameKey: "meta.legCreditNote",
    descKey: "meta.legCreditNoteDesc",
    unlockWave: 26,
    effect: { creditsMult: 1.15 },
  },
  {
    id: "shield_matrix",
    nameKey: "meta.legShieldMatrix",
    descKey: "meta.legShieldMatrixDesc",
    unlockWave: 30,
    effect: { shieldBlockLevel: 1, shieldRegenLevel: 1 },
  },
  {
    id: "overdrive",
    nameKey: "meta.legOverdrive",
    descKey: "meta.legOverdriveDesc",
    unlockWave: 35,
    effect: { speedMult: 1.08, fireRateMult: 1.06 },
  },
  {
    id: "aegis_core",
    nameKey: "meta.legAegisCore",
    descKey: "meta.legAegisCoreDesc",
    unlockWave: 40,
    effect: { shieldBlockLevel: 2 },
  },
  {
    id: "archivist",
    nameKey: "meta.legArchivist",
    descKey: "meta.legArchivistDesc",
    unlockWave: 45,
    effect: { partsMult: 1.15, creditsMult: 1.1 },
  },
  {
    id: "black_heart",
    nameKey: "meta.legBlackHeart",
    descKey: "meta.legBlackHeartDesc",
    unlockWave: 55,
    effect: { hpMult: 1.2, speedMult: 0.95 },
  },
];

/** Артефакт по id; null — неизвестный id. */
export function artifactById(id: string | null): LegacyArtifact | null {
  if (!id) return null;
  return LEGACY_ARTIFACTS.find((artifact) => artifact.id === id) ?? null;
}

/** Открыт ли артефакт на текущей лучшей волне. */
export function isArtifactUnlocked(artifact: LegacyArtifact, bestWave: number): boolean {
  return bestWave >= artifact.unlockWave;
}
