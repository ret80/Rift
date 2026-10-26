import { PickupKind } from "../balance";
import { PICKUP_CATALOG } from "../balance/pickupCatalog";
import type { AbilityId } from "../abilities/Ability";
import type { WeaponId } from "../weapons/Weapon";

interface PickupDependencies {
  /** Применить временный бонус по пикапу (темп огня, стволы, здоровье). */
  applyBonus(pickup: PickupKind): void;
  /** Восстановить энергию щита (мгновенный бонус). */
  rechargeShield(amount: number): void;
  /** Экипировать оружие по пикапу. */
  equipWeapon(id: WeaponId): void;
  /** Выдать активную способность по пикапу. */
  grantAbility(id: AbilityId): void;
  /** Проиграть звук подбора. */
  playPickupSound(kind: string): void;
}

/**
 * ApplyPickupSystem — применяет поднятый пикап.
 * Эффект подбора берётся из каталога PICKUP_CATALOG:
 *   • временные бонусы — делегируются BonusManager;
 *   • мгновенные бонусы (ремонт, щит, минерал) — применяются здесь;
 *   • оружие и способности — делегируются менеджерам.
 */
export class ApplyPickupSystem {
  constructor(private deps: PickupDependencies) {}

  apply(kind: PickupKind): void {
    const effect = PICKUP_CATALOG[kind].effect;
    switch (effect.type) {
      case "heal":
        // Временный бонус «здоровье»: лечение идёт в BonusManager.
        this.deps.applyBonus(kind);
        break;
      case "bonus":
        // Временные бонусы (темп огня, стволы) — BonusManager сам
        // решает, относится ли пикап к его видам.
        this.deps.applyBonus(kind);
        break;
      case "shield":
        this.deps.rechargeShield(effect.amount);
        break;
      case "weapon":
        this.deps.equipWeapon(effect.id);
        break;
      case "ability":
        this.deps.grantAbility(effect.id);
        break;
    }

    this.deps.playPickupSound(kind);
  }
}
