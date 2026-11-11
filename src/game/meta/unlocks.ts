/**
 * Разблокировки Механики 3 (GDD §3.4, §9.2-9.4).
 */

import type { Unlock } from "./types";

export const UNLOCKS: Unlock[] = [
  // Оружие
  {
    id: "weapon_missile",
    kind: "weapon",
    nameKey: "weapon.missile",
    condition: { type: "wave", wave: 10 },
    unlocked: false,
  },
  {
    id: "weapon_laser",
    kind: "weapon",
    nameKey: "weapon.laser",
    condition: { type: "wave", wave: 20 },
    unlocked: false,
  },
  {
    id: "weapon_railgun",
    kind: "weapon",
    nameKey: "weapon.railgun",
    condition: { type: "achievement", achievementId: "wave15_500_kills" },
    unlocked: false,
  },
  {
    id: "weapon_flak",
    kind: "weapon",
    nameKey: "weapon.flak",
    condition: { type: "wave", wave: 12 },
    unlocked: false,
  },
  {
    id: "weapon_tether",
    kind: "weapon",
    nameKey: "weapon.tether",
    condition: { type: "wave", wave: 25 },
    unlocked: false,
  },
  {
    id: "weapon_devourer",
    kind: "weapon",
    nameKey: "weapon.devourer",
    condition: { type: "wave", wave: 30 },
    unlocked: false,
  },

  // Дроны
  {
    id: "drone_scout",
    kind: "drone",
    nameKey: "drone.scout",
    condition: { type: "kills", enemyKind: "drone", count: 100 },
    unlocked: false,
  },
  {
    id: "drone_assault",
    kind: "drone",
    nameKey: "drone.assault",
    condition: { type: "kills", enemyKind: "hunter", count: 50 },
    unlocked: false,
  },
  {
    id: "drone_sentinel",
    kind: "drone",
    nameKey: "drone.sentinel",
    condition: { type: "wave", wave: 15 },
    unlocked: false,
  },

  // Способности
  {
    id: "ability_quantum_swap",
    kind: "ability",
    nameKey: "ability.quantumSwap",
    condition: { type: "wave", wave: 20 },
    unlocked: false,
  },
  {
    id: "ability_active_shield",
    kind: "ability",
    nameKey: "ability.activeShield",
    condition: { type: "wave", wave: 5 },
    unlocked: false,
  },
  {
    id: "ability_lockon",
    kind: "ability",
    nameKey: "ability.lockon",
    condition: { type: "wave", wave: 8 },
    unlocked: false,
  },

  // Доктрины
  {
    id: "doctrine_glass_cannon",
    kind: "doctrine",
    nameKey: "doctrine.glassCannon",
    condition: { type: "achievement", achievementId: "wave20_no_damage" },
    unlocked: false,
  },
  {
    id: "doctrine_tank",
    kind: "doctrine",
    nameKey: "doctrine.tank",
    condition: { type: "achievement", achievementId: "wave10_low_hp" },
    unlocked: false,
  },

  // Наследие
  {
    id: "legacy_phoenix_feather",
    kind: "legacy",
    nameKey: "legacy.phoenixFeather",
    condition: { type: "boss", wave: 10 },
    unlocked: false,
  },
  {
    id: "legacy_lens",
    kind: "legacy",
    nameKey: "legacy.lens",
    condition: { type: "achievement", achievementId: "kills_no_miss_500" },
    unlocked: false,
  },
];
