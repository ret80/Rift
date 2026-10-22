import { PickupKind } from "../balance";
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
 *
 * Диспетчеризация разделена по ответственности:
 *   • временные бонусы — делегируются BonusManager (он знает виды бонусов);
 *   • мгновенные бонусы (ремонт, минерал) — применяются здесь;
 *   • оружие — делегируется менеджеру оружия.
 */
export class ApplyPickupSystem {
  constructor(private deps: PickupDependencies) {}

  apply(kind: PickupKind): void {
    switch (kind) {
      case "heal25":
        this.deps.heal(25);
        break;
      case "heal50":
        this.deps.heal(50);
        break;
      case "heal100":
        this.deps.heal(100);
        break;
      case "hp":
        this.deps.heal(25);
        break;
      case "mineral":
        this.deps.addMinerals(1);
        this.deps.addScore(50);
        break;
      case "drone":
        this.deps.equipWeapon("drone");
        break;
      case "missile":
        this.deps.equipWeapon("missile");
        break;
      case "weaver":
        this.deps.equipWeapon("weaver");
        break;
      case "quantum_swap":
        this.deps.grantAbility("quantum_swap");
        break;
      default:
        // Временные бонусы (темп огня, стволы, рывок) — BonusManager сам
        // решает, относится ли пикап к его видам.
        this.deps.applyBonus(kind);
        break;
    }

    this.deps.playPickupSound(kind);
  }
}
