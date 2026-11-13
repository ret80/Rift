/**
 * Таланты Эха Разлома.
 *
 * Каждый эффект применяется в `applyUpgrades`: таланты дают множители
 * поверх прокачки забега или прибавку слотов/уровней линий щита. Поэтому
 * ни один талант не может оказаться «мёртвой покупкой».
 */

import type { MetaTalent } from "./types";

export const META_TALENTS: MetaTalent[] = [
  /* ======================== Красная ветка: атака ======================== */
  {
    id: "red_fire_rate",
    nameKey: "meta.redFireRate",
    descKey: "meta.redFireRateDesc",
    branch: "red",
    maxLevel: 5,
    costs: [10, 20, 35, 55, 80],
    effect: (level) => ({ fireRateMult: 1 + 0.04 * level }),
  },
  {
    id: "red_guns",
    nameKey: "meta.redGuns",
    descKey: "meta.redGunsDesc",
    branch: "red",
    maxLevel: 1,
    costs: [150],
    prerequisite: "red_fire_rate",
    effect: (level) => ({ weaponSlots: level }),
  },
  {
    id: "red_parts",
    nameKey: "meta.redParts",
    descKey: "meta.redPartsDesc",
    branch: "red",
    maxLevel: 3,
    costs: [40, 90, 160],
    prerequisite: "red_fire_rate",
    effect: (level) => ({ partsMult: 1 + 0.1 * level }),
  },

  /* ======================== Зелёная ветка: защита ======================== */
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
    id: "green_shield_block",
    nameKey: "meta.greenShieldBlock",
    descKey: "meta.greenShieldBlockDesc",
    branch: "green",
    maxLevel: 3,
    costs: [30, 60, 100],
    prerequisite: "green_speed",
    effect: (level) => ({ shieldBlockLevel: level }),
  },
  {
    id: "green_shield_regen",
    nameKey: "meta.greenShieldRegen",
    descKey: "meta.greenShieldRegenDesc",
    branch: "green",
    maxLevel: 3,
    costs: [30, 60, 100],
    prerequisite: "green_shield_block",
    effect: (level) => ({ shieldRegenLevel: level }),
  },
  {
    id: "green_drones",
    nameKey: "meta.greenDrones",
    descKey: "meta.greenDronesDesc",
    branch: "green",
    maxLevel: 2,
    costs: [60, 120],
    prerequisite: "green_hp",
    effect: (level) => ({ droneSlots: level }),
  },
  {
    id: "green_credits",
    nameKey: "meta.greenCredits",
    descKey: "meta.greenCreditsDesc",
    branch: "green",
    maxLevel: 2,
    costs: [80, 180],
    prerequisite: "green_hp",
    effect: (level) => ({ creditsMult: 1 + 0.15 * level }),
  },
];
