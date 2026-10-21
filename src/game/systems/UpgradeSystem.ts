/**
 * UpgradeSystem — персистентные апгрейды игрока.
 * Управляет состоянием playerUpgrades/appliedUpgrades,
 * загрузкой/сохранением в localStorage, применением бонусов к системам.
 */

import {
  loadUpgrades as loadUpgradesRaw,
  saveUpgrades as saveUpgradesRaw,
  applyUpgrades as applyUpgradesRaw,
  type PlayerUpgrades,
  type AppliedUpgrades,
} from "../upgrades";
import type { WeaponUpgrades } from "../weapons/Weapon";

export class UpgradeSystem {
  private _playerUpgrades: PlayerUpgrades = {} as PlayerUpgrades;

  get playerUpgrades(): PlayerUpgrades {
    return this._playerUpgrades;
  }

  private _appliedUpgrades: AppliedUpgrades | null = null!;

  /* ======================== Factory ======================== */

  static create(): UpgradeSystem {
    const sys = new UpgradeSystem();
    sys._playerUpgrades = loadUpgradesRaw();
    sys._appliedUpgrades = applyUpgradesRaw(sys._playerUpgrades);
    return sys;
  }

  private constructor() {}

  /* ======================== Apply to systems ======================== */

  /**
   * Применить персистентные апгрейды к живым системам.
   * Каждая система сама решает, что с ней делать.
   */
  applyToSystems(targets: {
    /** Задать максимальный корпус игрока. */
    setMaxHp: (v: number) => void;
    /** Передать апгрейды оружию. */
    setWeaponUpgrades: (upgrades: WeaponUpgrades) => void;
    /** Восстановить корпус игрока до максимума. */
    resetHp?: () => void;
  }): void {
    const up = this._appliedUpgrades;
    if (!up) return;
    targets.setMaxHp(up.baseHp);
    targets.setWeaponUpgrades(up);
    if (targets.resetHp) {
      targets.resetHp();
    }
  }

  /* ======================== Refresh / Reload ======================== */

  refresh(): void {
    this._playerUpgrades = loadUpgradesRaw();
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades);
  }

  /* ======================== Purchase (debug) ======================== */

  /** Debug-only: purchase upgrade without cost. Currently disabled in production. */
  purchaseNoCost(_key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    // Debug feature: gated by build environment in production
    return false;
  }

  /* ======================== Parts management ======================== */

  addParts(amount: number): void {
    this._playerUpgrades.parts += amount;
    saveUpgradesRaw(this._playerUpgrades);
  }

  /* ======================== Accessors ======================== */

  getParts(): number {
    return this._playerUpgrades.parts;
  }

  getApplied<T extends keyof AppliedUpgrades>(key: T): AppliedUpgrades[T] {
    return this._appliedUpgrades?.[key] ?? (1 as AppliedUpgrades[T]);
  }
}
