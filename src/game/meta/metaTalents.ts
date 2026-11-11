/**
 * Таланты Зеркала Ночи (мета-дерево) Механики 3.
 */

import type { MetaTalent } from "./types";

export const META_TALENTS: MetaTalent[] = [
  // Красная ветка
  {
    id: "red_damage",
    nameKey: "meta.redDamage",
    descKey: "meta.redDamageDesc",
    branch: "red",
    maxLevel: 5,
    costs: [10, 20, 35, 55, 80],
    effect: (level) => ({ damageMult: 1 + 0.05 * level }),
  },
  {
    id: "red_fire_rate",
    nameKey: "meta.redFireRate",
    descKey: "meta.redFireRateDesc",
    branch: "red",
    maxLevel: 5,
    costs: [10, 20, 35, 55, 80],
    prerequisite: "red_damage",
    effect: (level) => ({ fireRateMult: 1 + 0.04 * level }),
  },
  {
    id: "red_crit",
    nameKey: "meta.redCrit",
    descKey: "meta.redCritDesc",
    branch: "red",
    maxLevel: 3,
    costs: [30, 60, 100],
    prerequisite: "red_fire_rate",
    effect: (level) => ({ critChance: 0.05 * level }),
  },
  {
    id: "red_pierce",
    nameKey: "meta.redPierce",
    descKey: "meta.redPierceDesc",
    branch: "red",
    maxLevel: 1,
    costs: [150],
    prerequisite: "red_crit",
    effect: () => ({ pierce: 1 }),
  },
  // Зелёная ветка
  {
    id: "green_hp",
    nameKey: "meta.greenHp",
    descKey: "meta.greenHpDesc",
    branch: "green",
    maxLevel: 5,
    costs: [10, 20, 35, 55, 80],
    effect: (level) => ({ hpMult: 1 + 0.08 * level }),
  },
  {
    id: "green_speed",
    nameKey: "meta.greenSpeed",
    descKey: "meta.greenSpeedDesc",
    branch: "green",
    maxLevel: 5,
    costs: [10, 20, 35, 55, 80],
    prerequisite: "green_hp",
    effect: (level) => ({ speedMult: 1 + 0.03 * level }),
  },
  {
    id: "green_shield",
    nameKey: "meta.greenShield",
    descKey: "meta.greenShieldDesc",
    branch: "green",
    maxLevel: 3,
    costs: [30, 60, 100],
    prerequisite: "green_speed",
    effect: (level) => ({ shieldEnergy: 20 * level }),
  },
  {
    id: "green_regen",
    nameKey: "meta.greenRegen",
    descKey: "meta.greenRegenDesc",
    branch: "green",
    maxLevel: 1,
    costs: [150],
    prerequisite: "green_shield",
    effect: () => ({ regen: 1 }),
  },
];
