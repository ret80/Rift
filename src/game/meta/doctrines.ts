/**
 * Список доктрин Механики 3 (GDD §10).
 */

import type { Doctrine } from "./types";

export const DOCTRINES: Doctrine[] = [
  {
    id: "glass_cannon",
    nameKey: "doctrine.glassCannon",
    descKey: "doctrine.glassCannonDesc",
    effect: { damageMult: 1.5, hpMult: 0.5 },
    unlockCondition: { type: "achievement", achievementId: "wave20_no_damage" },
    unlocked: false,
  },
  {
    id: "tank",
    nameKey: "doctrine.tank",
    descKey: "doctrine.tankDesc",
    effect: { hpMult: 1.5, speedMult: 0.7, damageMult: 0.8 },
    unlockCondition: { type: "achievement", achievementId: "wave10_low_hp" },
    unlocked: false,
  },
  {
    id: "rapid_fire",
    nameKey: "doctrine.rapidFire",
    descKey: "doctrine.rapidFireDesc",
    effect: { fireRateMult: 1.5, damageMult: 0.8, accuracyMult: 0.9 },
    unlockCondition: { type: "kills", enemyKind: "fighter", count: 500 },
    unlocked: false,
  },
  {
    id: "lone_wolf",
    nameKey: "doctrine.loneWolf",
    descKey: "doctrine.loneWolfDesc",
    effect: { noDrones: true, damageMult: 1.3, speedMult: 1.2 },
    unlockCondition: { type: "achievement", achievementId: "wave15_no_drones" },
    unlocked: false,
  },
  {
    id: "magnet",
    nameKey: "doctrine.magnet",
    descKey: "doctrine.magnetDesc",
    effect: { magnetBonus: 1.0, damageMult: 0.8 },
    unlockCondition: { type: "parts", total: 5000 },
    unlocked: false,
  },
  {
    id: "hardcore",
    nameKey: "doctrine.hardcore",
    descKey: "doctrine.hardcoreDesc",
    effect: { noHealing: true, partsMult: 2.0, creditsMult: 2.0 },
    unlockCondition: { type: "wave", wave: 30 },
    unlocked: false,
  },
  {
    id: "phantom",
    nameKey: "doctrine.phantom",
    descKey: "doctrine.phantomDesc",
    effect: { damageMult: 0.8 },
    unlockCondition: { type: "achievement", achievementId: "graze_100" },
    unlocked: false,
  },
  {
    id: "time_attack",
    nameKey: "doctrine.timeAttack",
    descKey: "doctrine.timeAttackDesc",
    effect: { waveTimeMult: 0.7, enemyCountMult: 1.5, partsMult: 1.5 },
    unlockCondition: { type: "achievement", achievementId: "wave20_fast" },
    unlocked: false,
  },
  {
    id: "gambler",
    nameKey: "doctrine.gambler",
    descKey: "doctrine.gamblerDesc",
    effect: { randomModifier: true, creditsMult: 2.0 },
    unlockCondition: { type: "wave", wave: 25 },
    unlocked: false,
  },
  {
    id: "arsenal",
    nameKey: "doctrine.arsenal",
    descKey: "doctrine.arsenalDesc",
    effect: { partsMult: 0.5 },
    unlockCondition: { type: "achievement", achievementId: "all_weapons" },
    unlocked: false,
  },
  {
    id: "aegis",
    nameKey: "doctrine.aegis",
    descKey: "doctrine.aegisDesc",
    effect: { damageMult: 0.7 },
    unlockCondition: { type: "achievement", achievementId: "block_1000" },
    unlocked: false,
  },
  {
    id: "blink",
    nameKey: "doctrine.blink",
    descKey: "doctrine.blinkDesc",
    effect: { hpMult: 0.5 },
    unlockCondition: { type: "achievement", achievementId: "dash_200" },
    unlocked: false,
  },
];
