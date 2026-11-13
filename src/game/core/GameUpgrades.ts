/**
 * GameUpgrades — публичный фасад покупки/обновления апгрейдов.
 * Изолирует правила стоимости, сохранения и повторного применения
 * апгрейдов от фасада Game.
 *
 * Все траты выполняет `UpgradeSystem` через кошелёк деталей: фасад только
 * пересчитывает боевые значения после успешной покупки.
 */

import type { PlayerUpgrades, UpgradeKey, WeaponStatKey } from "../upgrades";
import type { WeaponId } from "../weapons/Weapon";
import type { DroneId, DroneStatKey } from "../drones/Drone";
import type { GameContext } from "./GameContext";

export class GameUpgrades {
  constructor(private readonly ctx: GameContext) {}

  /** Пересчитать прокачку после покупки. */
  refresh(): void {
    this.ctx.upgradeSystem.refresh();
    this.ctx.applyUpgrades(false);
  }

  /** Купить уровень линии корабля/бонуса за детали. */
  purchaseUpgrade(key: UpgradeKey): boolean {
    const success = this.ctx.upgradeSystem.purchaseUpgrade(key);
    if (success) {
      this.refresh();
    }
    return success;
  }

  /** Get persistent player upgrades. */
  get(): PlayerUpgrades {
    return this.ctx.upgradeSystem.playerUpgrades;
  }

  /** Купить оружие в арсенале. */
  purchaseWeapon(id: WeaponId): boolean {
    const success = this.ctx.upgradeSystem.purchaseWeapon(id);
    if (success) {
      this.refresh();
    }
    return success;
  }

  /** Купить уровень линии оружия в арсенале. */
  upgradeWeaponStat(id: WeaponId, stat: WeaponStatKey): boolean {
    const success = this.ctx.upgradeSystem.upgradeWeaponStat(id, stat);
    if (success) {
      this.refresh();
    }
    return success;
  }

  /** Персистентный арсенал игрока. */
  getLoadout() {
    return this.ctx.upgradeSystem.loadout;
  }

  /** Число слотов оружия у текущего корабля. */
  getWeaponSlots(): number {
    return this.ctx.upgradeSystem.getApplied("weaponSlots");
  }

  /** Число занятых слотов (купленные виды оружия). */
  getUsedWeaponSlots(): number {
    return this.ctx.upgradeSystem.getUsedWeaponSlots();
  }

  /* ======================== Drone hangar ======================== */

  /** Персистентный ангар дронов игрока. */
  getDroneLoadout() {
    return this.ctx.upgradeSystem.droneLoadout;
  }

  /** Число слотов под дроны у текущего корабля. */
  getDroneSlots(): number {
    return this.ctx.upgradeSystem.getApplied("droneSlots");
  }

  /** Число занятых слотов (купленные единицы дронов). */
  getUsedDroneSlots(): number {
    return this.ctx.upgradeSystem.getDroneTotalCount();
  }

  /** Купить единицу дрона в ангаре. */
  purchaseDrone(id: DroneId): boolean {
    const success = this.ctx.upgradeSystem.purchaseDrone(id);
    if (success) {
      this.refresh();
    }
    return success;
  }

  /** Купить уровень линии дрона в ангаре. */
  upgradeDroneStat(id: DroneId, stat: DroneStatKey): boolean {
    const success = this.ctx.upgradeSystem.upgradeDroneStat(id, stat);
    if (success) {
      this.refresh();
    }
    return success;
  }
}
