/**
 * Список артефактов Наследия Механики 3 (GDD §11).
 */

import type { LegacyArtifact } from "./types";

export const LEGACY_ARTIFACTS: LegacyArtifact[] = [
  {
    id: "phoenix_feather",
    nameKey: "legacy.phoenixFeather",
    descKey: "legacy.phoenixFeatherDesc",
    effect: { reviveOnce: true, reviveHpPercent: 0.3 },
    unlockCondition: { type: "boss", wave: 10 },
    unlocked: false,
  },
  {
    id: "lens",
    nameKey: "legacy.lens",
    descKey: "legacy.lensDesc",
    effect: { critChance: 0.1 },
    unlockCondition: { type: "achievement", achievementId: "kills_no_miss_500" },
    unlocked: false,
  },
  {
    id: "battery",
    nameKey: "legacy.battery",
    descKey: "legacy.batteryDesc",
    effect: { shieldEnergyBonus: 50 },
    unlockCondition: { type: "achievement", achievementId: "block_500_run" },
    unlocked: false,
  },
  {
    id: "compass",
    nameKey: "legacy.compass",
    descKey: "legacy.compassDesc",
    effect: { radarAnchors: true },
    unlockCondition: { type: "achievement", achievementId: "wave15_anchors" },
    unlocked: false,
  },
  {
    id: "magnet_charm",
    nameKey: "legacy.magnetCharm",
    descKey: "legacy.magnetCharmDesc",
    effect: { magnetBonus: 0.5 },
    unlockCondition: { type: "parts", total: 1000 },
    unlocked: false,
  },
  {
    id: "crystal",
    nameKey: "legacy.crystal",
    descKey: "legacy.crystalDesc",
    effect: { partsPerKill: 1 },
    unlockCondition: { type: "parts", total: 50000 },
    unlocked: false,
  },
  {
    id: "mirror",
    nameKey: "legacy.mirror",
    descKey: "legacy.mirrorDesc",
    effect: { reflectDamage: 0.1 },
    unlockCondition: { type: "achievement", achievementId: "reflect_1000" },
    unlocked: false,
  },
  {
    id: "hourglass",
    nameKey: "legacy.hourglass",
    descKey: "legacy.hourglassDesc",
    effect: { bonusDurationMult: 1.1 },
    unlockCondition: { type: "achievement", achievementId: "use_50_bonuses" },
    unlocked: false,
  },
  {
    id: "key",
    nameKey: "legacy.key",
    descKey: "legacy.keyDesc",
    effect: { extraWeaponSlot: true },
    unlockCondition: { type: "achievement", achievementId: "all_weapons" },
    unlocked: false,
  },
  {
    id: "heart",
    nameKey: "legacy.heart",
    descKey: "legacy.heartDesc",
    effect: { extraLife: true },
    unlockCondition: { type: "achievement", achievementId: "wave30_no_artifacts" },
    unlocked: false,
  },
  {
    id: "eye",
    nameKey: "legacy.eye",
    descKey: "legacy.eyeDesc",
    effect: { showEnemyHp: true },
    unlockCondition: { type: "kills", enemyKind: "any", count: 1000 },
    unlocked: false,
  },
  {
    id: "wing",
    nameKey: "legacy.wing",
    descKey: "legacy.wingDesc",
    effect: { speedBonus: 0.1, dodgeChance: 0.05 },
    unlockCondition: { type: "achievement", achievementId: "wave20_fast" },
    unlocked: false,
  },
];
