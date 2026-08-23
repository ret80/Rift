/**
 * UpgradeSystem — персистентные апгрейды игрока.
 * Управляет состоянием playerUpgrades/appliedUpgrades,
 * загрузкой/сохранением в localStorage, применением бонусов к системам.
 */

import {
  loadUpgrades as loadUpgradesRaw,
  saveUpgrades as saveUpgradesRaw,
  applyUpgrades as applyUpgradesRaw,
  defaultUpgrades as defaultUpgradesRaw,
  UPGRADE_TIERS,
  type PlayerUpgrades,
  type AppliedUpgrades,
} from "../upgrades";

export class UpgradeSystem {
  private _playerUpgrades: PlayerUpgrades = {} as PlayerUpgrades;

  get playerUpgrades(): PlayerUpgrades {
    return this._playerUpgrades;
  }

  get appliedUpgrades(): AppliedUpgrades | null {
    return this._appliedUpgrades;
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

  applyToSystems(
    setMaxHp: (v: number) => void,
    setGuns: (v: number) => void,
    setBulletDmg: (v: number) => void,
    getResetHp?: () => void
  ): void {
    const up = this._appliedUpgrades;
    if (!up) return;
    setMaxHp(up.baseHp);
    setGuns(up.gunCount);
    setBulletDmg(up.bulletDmg);
    if (getResetHp) {
      getResetHp();
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
