import { PickupKind } from "../balance";
import { PICKUP_CATALOG } from "../balance/pickupCatalog";
import type { AbilityId } from "../abilities/Ability";
import type { WeaponId } from "../weapons/Weapon";

interface PickupDependencies {
  /** Лечение корпуса (мгновенный бонус). */
  heal(amount: number): void;
  /** Применить временный бонус по пикапу (темп огня, стволы, рывок). */
  applyBonus(pickup: PickupKind): void;
  /** Экипировать оружие по пикапу. */
  equipWeapon(id: WeaponId): void;
  /** Выдать активную способность по пикапу. */
  grantAbility(id: AbilityId): void;
  /** Добавить минералы (мгновенный бонус). */
  addMinerals(count: number): void;
  /** Добавить очки за минерал. */
  addScore(amount: number): void;
  /** Проиграть звук подбора. */
  playPickupSound(kind: string): void;
}

/**
 * ApplyPickupSystem — применяет поднятый пикап.
 * Эффект подбора берётся из каталога PICKUP_CATALOG:
 *   • временные бонусы — делегируются BonusManager;
 *   • мгновенные бонусы (ремонт, минерал) — применяются здесь;
 *   • оружие и способности — делегируются менеджерам.
 */
export class ApplyPickupSystem {
  constructor(private deps: PickupDependencies) {}

  apply(kind: PickupKind): void {
    const effect = PICKUP_CATALOG[kind].effect;
    switch (effect.type) {
      case "heal":
        this.deps.heal(effect.amount);
        break;
      case "bonus":
        // Временные бонусы (темп огня, стволы, рывок) — BonusManager сам
        // решает, относится ли пикап к его видам.
        this.deps.applyBonus(kind);
        break;
      case "weapon":
        this.deps.equipWeapon(effect.id);
        break;
      case "ability":
        this.deps.grantAbility(effect.id);
        break;
      case "mineral":
        this.deps.addMinerals(effect.amount);
        this.deps.addScore(effect.score);
        break;
    }

    this.deps.playPickupSound(kind);
  }
}
