/**
 * Crit — критические попадания оружия игрока (GDD §6.7).
 *
 * Крит — это второй бросок за попадание: сначала решается само попадание
 * (разброс AimSolver), и только потом крит умножает урон одного попадания.
 * Промах критом быть не может.
 *
 * Шанс складывается из базового шанса оружия и линии прокачки `crit`
 * (по +4 % за уровень), но не превышает общего предела. Множитель задаёт
 * оружие: прокачка крита меняет только шанс.
 */

import type { Rng } from "../core/rng";
import type { WeaponId, WeaponModelUpgrades } from "./Weapon";

/** Максимальный уровень линии крита. */
export const CRIT_MAX_LEVEL = 5;
/** Прирост шанса крита за уровень линии, доля. */
export const CRIT_PER_LEVEL = 0.04;
/** Предел шанса крита от всех источников, доля. */
export const CRIT_MAX_CHANCE = 0.5;

/**
 * Базовый шанс и множитель крита по видам оружия.
 *
 * Тетера, пожирателя и дронов в таблице нет: у первого урон общий для двух
 * целей, у второго — площадь, у третьих — постоянный поток. Крит им не положен.
 */
export const CRIT_BY_WEAPON: Partial<Record<WeaponId, { chance: number; mult: number }>> = {
  cannon: { chance: 0.05, mult: 2.0 },
  missile: { chance: 0.04, mult: 2.2 },
  laser: { chance: 0.06, mult: 1.8 },
  railgun: { chance: 0.1, mult: 2.5 },
  flak: { chance: 0.03, mult: 2.0 },
};

/** Номер уровня линии крита в допустимых границах. */
function critLevel(model: WeaponModelUpgrades): number {
  // Старые записи арсенала и реплеи линии крита не содержат.
  const level = model.crit ?? 0;
  return Math.max(0, Math.min(CRIT_MAX_LEVEL, level));
}

/** Шанс крита оружия с учётом прокачки (0 — крита нет). */
export function weaponCritChance(id: WeaponId, model: WeaponModelUpgrades): number {
  const base = CRIT_BY_WEAPON[id];
  if (!base) return 0;
  return Math.min(CRIT_MAX_CHANCE, base.chance + critLevel(model) * CRIT_PER_LEVEL);
}

/** Множитель критического попадания оружия (1 — крита нет). */
export function weaponCritMult(id: WeaponId): number {
  return CRIT_BY_WEAPON[id]?.mult ?? 1;
}

/**
 * Бросок крита на состоявшееся попадание.
 * Возвращает множитель урона: 1 — обычное попадание, `mult` — критическое.
 */
export function rollCrit(rng: Rng, chance: number, mult: number): number {
  if (chance <= 0) return 1;
  return rng.next() < chance ? mult : 1;
}
