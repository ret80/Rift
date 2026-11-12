/**
 * Типы мета-прогрессии (Зеркало Ночи).
 *
 * Мета-слой — единственное, что переживает смерть: кредиты, купленные
 * таланты и выбранные перед забегом доктрина с уровнем угрозы. Всё
 * остальное (детали, линии корабля, оружие, дроны) — забег, он
 * сбрасывается при старте нового забега.
 */

import type { TKey } from "../../i18n";

/* ======================== Мета-таланты (Зеркало Ночи) ======================== */

export type MetaTalentBranch = "red" | "green";

/**
 * Бонусы мета-талантов.
 *
 * Только те эффекты, которые реально применяются в бою: множители поверх
 * прокачки забега, прибавка слотов и уровней линий щита. Никаких «заглушек
 * на будущее» — каждый талант должен менять игру.
 */
export interface MetaBonuses {
  /** Множитель максимального корпуса. */
  hpMult: number;
  /** Множитель скорости. */
  speedMult: number;
  /** Множитель темпа огня. */
  fireRateMult: number;
  /** Прибавка слотов оружия. */
  weaponSlots: number;
  /** Прибавка слотов дронов. */
  droneSlots: number;
  /** Прибавка уровней линии «процент щита». */
  shieldBlockLevel: number;
  /** Прибавка уровней линии «восстановление щита». */
  shieldRegenLevel: number;
  /** Множитель деталей за забег. */
  partsMult: number;
  /** Множитель кредитов за забег. */
  creditsMult: number;
}

/** Нейтральные бонусы: мета ничего не даёт. */
export function noMetaBonuses(): MetaBonuses {
  return {
    hpMult: 1,
    speedMult: 1,
    fireRateMult: 1,
    weaponSlots: 0,
    droneSlots: 0,
    shieldBlockLevel: 0,
    shieldRegenLevel: 0,
    partsMult: 1,
    creditsMult: 1,
  };
}

/**
 * Наложить бонусы `extra` поверх `base`.
 *
 * Множители перемножаются, прибавки складываются — так доктрина и таланты
 * Зеркала Ночи применяются одним и тем же путём.
 */
export function mergeMetaBonuses(
  base: MetaBonuses,
  extra: Partial<MetaBonuses>,
): MetaBonuses {
  return {
    hpMult: base.hpMult * (extra.hpMult ?? 1),
    speedMult: base.speedMult * (extra.speedMult ?? 1),
    fireRateMult: base.fireRateMult * (extra.fireRateMult ?? 1),
    weaponSlots: base.weaponSlots + (extra.weaponSlots ?? 0),
    droneSlots: base.droneSlots + (extra.droneSlots ?? 0),
    shieldBlockLevel: base.shieldBlockLevel + (extra.shieldBlockLevel ?? 0),
    shieldRegenLevel: base.shieldRegenLevel + (extra.shieldRegenLevel ?? 0),
    partsMult: base.partsMult * (extra.partsMult ?? 1),
    creditsMult: base.creditsMult * (extra.creditsMult ?? 1),
  };
}

export interface MetaTalent {
  id: string;
  nameKey: TKey;
  descKey: TKey;
  /** Ветка: красная — атака, зелёная — защита. */
  branch: MetaTalentBranch;
  maxLevel: number;
  /** Стоимость каждого следующего уровня, кредиты. */
  costs: number[];
  /** Талант-предок: без единого уровня в нём покупка закрыта. */
  prerequisite?: string;
  /** Эффект текущего уровня (суммируется по всем талантам). */
  effect: (level: number) => Partial<MetaBonuses>;
}

export interface MetaTreeState {
  /** id таланта → купленный уровень. */
  talents: Record<string, number>;
}
