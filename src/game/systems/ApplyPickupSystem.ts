import { PickupKind } from "../balance";
import {
  DASH_BONUS_TIME,
  GUN_BONUS_TIME,
} from "../balance/player";
import type { WeaponId } from "../weapons/Weapon";

interface PickupDependencies {
  heal(amount: number): void;
  boostRate(): void;
  addGunBonus(guns: number, duration: number): void;
  equipWeapon(id: WeaponId): void;
  setDashT(duration: number): void;
  addMinerals(count: number): void;
  addScore(amount: number): void;
  playPickupSound(kind: string): void;
}

export class ApplyPickupSystem {
  constructor(private deps: PickupDependencies) {}

  apply(kind: PickupKind): void {
    const handlers: Record<PickupKind, () => void> = {
      heal25: () => this.deps.heal(25),
      heal50: () => this.deps.heal(50),
      heal100: () => this.deps.heal(100),
      hp: () => this.deps.heal(25),
      rate20: () => this.deps.boostRate(),
      rate40: () => this.deps.boostRate(),
      rate60: () => this.deps.boostRate(),
      rate: () => this.deps.boostRate(),
      gun: () => this.deps.addGunBonus(2, GUN_BONUS_TIME),
      drone: () => this.deps.equipWeapon("drone"),
      dash: () => this.deps.setDashT(DASH_BONUS_TIME),
      mineral: () => {
        this.deps.addMinerals(1);
        this.deps.addScore(50);
      },
      missile: () => this.deps.equipWeapon("missile"),
    };

    const handler = handlers[kind];
    if (handler) {
      handler();
    }

    this.deps.playPickupSound(kind);
  }
}
