/**
 * BonusRegistry — реестр всех бонусов игрока.
 *
 * Единственное место в проекте, где перечислены виды бонусов:
 * добавить новый временный бонус — новый класс + запись в createBonusRegistry;
 * добавить новый мгновенный бонус — запись в INSTANT_BONUS_META.
 *
 * Построено по образцу WeaponRegistry (src/game/weapons/WeaponRegistry.ts).
 */

import type { PickupKind } from "../../balance";
import type { BonusId, BonusKind, BonusMeta } from "./Bonus";
import { GunsBonus } from "./GunsBonus";
import { RateBonus } from "./RateBonus";
import { HealBonus } from "./HealBonus";

/** Как долго мгновенный бонус мигает в строке снаряжения, секунды. */
export const INSTANT_BONUS_FLASH = 1.8;

/** Оформление мгновенных бонусов (без состояния и таймера). */
export const INSTANT_BONUS_META: Record<BonusKind, BonusMeta | undefined> = {
  rate: undefined,
  guns: undefined,
  heal: undefined,
};

/**
 * Экземпляры всех временных бонусов.
 * Типизированы конкретными классами, чтобы менеджер мог вызывать
 * узкие методы (getRateMult, getExtraBarrels)
 * без приведения типов.
 */
export interface BonusRegistryData {
  rate: RateBonus;
  guns: GunsBonus;
  heal: HealBonus;
}

/**
 * Создать свежий набор экземпляров всех временных бонусов.
 * Добавить новый бонус — новый класс + запись здесь.
 */
export function createBonusRegistry(): BonusRegistryData {
  return {
    rate: new RateBonus(),
    guns: new GunsBonus(),
    heal: new HealBonus(),
  };
}

/**
 * Маппинг пикапов на бонусы.
 * Объединяет bonusIdForPickup и bonusKindForPickup в одну функцию.
 */
interface PickupBonusMapping {
  bonusId: BonusId | null;
  bonusKind: BonusKind | null;
}

const PICKUP_BONUS_MAP: Record<PickupKind, PickupBonusMapping> = {
  // Временные бонусы
  rate: { bonusId: "rate", bonusKind: "rate" },
  rate20: { bonusId: "rate", bonusKind: "rate" },
  rate40: { bonusId: "rate", bonusKind: "rate" },
  rate60: { bonusId: "rate", bonusKind: "rate" },
  gun: { bonusId: "guns", bonusKind: "guns" },
  heal: { bonusId: "heal", bonusKind: "heal" },
  // Пикапы щита заряжают энергию щита — в строке живёт постоянный слот щита.
  shield: { bonusId: null, bonusKind: null },
  // Пикапы оружия — не являются бонусами
  drone: { bonusId: null, bonusKind: null },
  missile: { bonusId: null, bonusKind: null },
  laser: { bonusId: null, bonusKind: null },
  // Пикапы способностей — не являются бонусами
  quantum_swap: { bonusId: null, bonusKind: null },
};

/**
 * Какой бонус соответствует поднятому пикапу.
 * Пикапы оружия (ракетомёт, дрон) бонусом не являются — возвращают null.
 */
export function bonusIdForPickup(kind: PickupKind): BonusId | null {
  return PICKUP_BONUS_MAP[kind].bonusId;
}

/**
 * Какой бонус виден в строке снаряжения после подъёма пикапа.
 * Для мгновенных бонусов возвращает их вид (для вспышки в HUD),
 * для оружия — null.
 */
export function bonusKindForPickup(kind: PickupKind): BonusKind | null {
  return PICKUP_BONUS_MAP[kind].bonusKind;
}
