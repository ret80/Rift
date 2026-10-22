/**
 * AbilityRegistry — реестр активных способностей.
 *
 * Построен по образцу реестра оружия: одна точка сборки, из которой
 * AbilitySystem получает все виды способностей. Добавить новую —
 * дописать одну строку здесь.
 */

import type { Ability, AbilityId } from "./Ability";
import { QuantumSwapAbility } from "./QuantumSwapAbility";

/** Собранные экземпляры всех способностей по их идентификаторам. */
export type AbilityRegistryData = Record<AbilityId, Ability>;

export function createAbilityRegistry(): AbilityRegistryData {
  return {
    quantum_swap: new QuantumSwapAbility(),
  };
}
