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
import type { PersistencePort } from "../core/PersistencePort";

export class UpgradeSystem {
  private _playerUpgrades: PlayerUpgrades = {} as PlayerUpgrades;
  private _storage!: PersistencePort;

  get playerUpgrades(): PlayerUpgrades {
    return this._playerUpgrades;
  }

  private _appliedUpgrades: AppliedUpgrades | null = null!;

  /* ======================== Factory ======================== */

  static create(storage: PersistencePort): UpgradeSystem {
    const sys = new UpgradeSystem();
    sys._storage = storage;
    sys._playerUpgrades = loadUpgradesRaw(storage);
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
    /** Задать постоянный множитель скорости игрока. */
    setSpeedMult: (v: number) => void;
    /** Задать радиус безопасного ядра хитбокса (0 — ядра нет). */
    setCoreRadius: (v: number) => void;
    /** Задать множитель длительности рывка. */
    setDashDurationMult: (v: number) => void;
    /** Задать уровень апгрейда «поглощение импульса». */
    setMomentumLevel: (v: number) => void;
    /** Восстановить корпус игрока до максимума. */
    resetHp?: () => void;
  }): void {
    const up = this._appliedUpgrades;
    if (!up) return;
    targets.setMaxHp(up.baseHp);
    targets.setWeaponUpgrades(up);
    targets.setSpeedMult(up.speedMult);
    targets.setCoreRadius(up.phantomCoreRadius);
    targets.setDashDurationMult(up.dashDurationMult);
    targets.setMomentumLevel(up.momentumLevel);
    if (targets.resetHp) {
      targets.resetHp();
    }
  }

  /* ======================== Refresh / Reload ======================== */

  refresh(): void {
    this._playerUpgrades = loadUpgradesRaw(this._storage);
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades);
  }

  /* ======================== Purchase (debug) ======================== */

  /** Debug-only: purchase upgrade without cost (dev only). */
  purchaseNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    if (typeof process !== "undefined" && process.env?.NODE_ENV === "production") {
      return false;
    }
    if (this._playerUpgrades[key] == null) return false;
    (this._playerUpgrades[key] as number) += 1;
    saveUpgradesRaw(this._playerUpgrades, this._storage);
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades);
    return true;
  }

  /* ======================== Parts management ======================== */

  /** Добавить детали к прокачке (localStorage — через порт). */
  addParts(amount: number): void {
    this._playerUpgrades.parts += amount;
    saveUpgradesRaw(this._playerUpgrades, this._storage);
  }

  /** Сохранить текущее состояние прокачки. */
  save(): void {
    saveUpgradesRaw(this._playerUpgrades, this._storage);
  }

  /* ======================== Accessors ======================== */

  getParts(): number {
    return this._playerUpgrades.parts;
  }

  getApplied<T extends keyof AppliedUpgrades>(key: T): AppliedUpgrades[T] {
    return this._appliedUpgrades?.[key] ?? (1 as AppliedUpgrades[T]);
  }
}
