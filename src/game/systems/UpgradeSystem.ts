/**
 * UpgradeSystem — персистентные апгрейды игрока.
 * Управляет состоянием playerUpgrades/appliedUpgrades,
 * загрузкой/сохранением в localStorage, применением бонусов к системам.
 */

import {
  loadUpgrades as loadUpgradesRaw,
  saveUpgrades as saveUpgradesRaw,
  applyUpgrades as applyUpgradesRaw,
  loadWeaponLoadout,
  saveWeaponLoadout,
  defaultWeaponLoadout,
  weaponCost,
  weaponUpgradeCost,
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type AppliedUpgrades,
  type WeaponStatKey,
} from "../upgrades";
import type { PersistencePort } from "../core/PersistencePort";
import type {
  WeaponId,
  WeaponLoadout,
  WeaponUpgrades,
} from "../weapons/Weapon";
import { DroneSystem } from "../drones/DroneSystem";
import type { DroneId, DroneLoadout, DroneStatKey } from "../drones/Drone";

export class UpgradeSystem {
  private _playerUpgrades: PlayerUpgrades = {} as PlayerUpgrades;
  private _loadout: WeaponLoadout = defaultWeaponLoadout();
  private _droneSystem: DroneSystem | null = null;
  private _storage!: PersistencePort;

  get playerUpgrades(): PlayerUpgrades {
    return this._playerUpgrades;
  }

  /** Персистентный арсенал: купленные виды оружия и их модели. */
  get loadout(): WeaponLoadout {
    return this._loadout;
  }

  /** Персистентный ангар дронов: купленные дроны и их модели. */
  get droneLoadout(): DroneLoadout {
    return this.droneSys().loadout;
  }

  private _appliedUpgrades: AppliedUpgrades | null = null!;

  /* ======================== Factory ======================== */

  static create(storage: PersistencePort): UpgradeSystem {
    const sys = new UpgradeSystem();
    sys._storage = storage;
    sys._playerUpgrades = loadUpgradesRaw(storage);
    sys._loadout = loadWeaponLoadout(storage);
    sys._droneSystem = DroneSystem.create(storage);
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
    /** Задать множитель длительности рывка. */
    setDashDurationMult: (v: number) => void;
    /** Восстановить корпус игрока до максимума. */
    resetHp?: () => void;
  }): void {
    const up = this._appliedUpgrades;
    if (!up) return;
    targets.setMaxHp(up.baseHp);
    targets.setWeaponUpgrades(up);
    targets.setSpeedMult(up.speedMult);
    targets.setDashDurationMult(up.dashDurationMult);
    if (targets.resetHp) {
      targets.resetHp();
    }
  }

  /* ======================== Refresh / Reload ======================== */

  refresh(): void {
    this._playerUpgrades = loadUpgradesRaw(this._storage);
    this._loadout = loadWeaponLoadout(this._storage);
    this._droneSystem?.refresh();
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades);
  }

  /* ======================== Purchase (debug) ======================== */

  /** Debug-only: purchase upgrade without cost (dev only). */
  purchaseNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
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

  /* ======================== Weapon loadout management ======================== */

  /** Купить оружие в арсенале. Возвращает true при успехе. */
  purchaseWeapon(id: WeaponId): boolean {
    return this.purchaseWeaponImpl(id, false);
  }

  /** Debug-only: получить оружие без стоимости. */
  purchaseWeaponNoCost(id: WeaponId): boolean {
    return this.purchaseWeaponImpl(id, true);
  }

  /** Купить уровень линии оружия в арсенале. Возвращает true при успехе. */
  upgradeWeaponStat(id: WeaponId, stat: WeaponStatKey): boolean {
    return this.upgradeWeaponStatImpl(id, stat, false);
  }

  /** Debug-only: прокачать линию оружия без стоимости. */
  upgradeWeaponStatNoCost(id: WeaponId, stat: WeaponStatKey): boolean {
    return this.upgradeWeaponStatImpl(id, stat, true);
  }

  private purchaseWeaponImpl(id: WeaponId, free: boolean): boolean {
    const entry = this._loadout[id];
    if (!entry || entry.owned) return false;
    if (this.getUsedWeaponSlots() >= this.getApplied("weaponSlots")) return false;
    if (!free) {
      const cost = weaponCost(id);
      if (this._playerUpgrades.parts < cost) return false;
      this._playerUpgrades.parts -= cost;
    }
    entry.owned = true;
    saveUpgradesRaw(this._playerUpgrades, this._storage);
    saveWeaponLoadout(this._loadout, this._storage);
    return true;
  }

  private upgradeWeaponStatImpl(id: WeaponId, stat: WeaponStatKey, free: boolean): boolean {
    const entry = this._loadout[id];
    if (!entry || !entry.owned) return false;
    const level = entry.model[stat];
    if (level >= WEAPON_STAT_MAX_LEVEL) return false;
    if (!free) {
      const cost = weaponUpgradeCost(level);
      if (this._playerUpgrades.parts < cost) return false;
      this._playerUpgrades.parts -= cost;
    }
    entry.model[stat] = level + 1;
    saveUpgradesRaw(this._playerUpgrades, this._storage);
    saveWeaponLoadout(this._loadout, this._storage);
    return true;
  }

  /* ======================== Accessors ======================== */

  getParts(): number {
    return this._playerUpgrades.parts;
  }

  getApplied<T extends keyof AppliedUpgrades>(key: T): AppliedUpgrades[T] {
    return this._appliedUpgrades?.[key] ?? (1 as AppliedUpgrades[T]);
  }

  /** Всего занятых слотов оружия (купленные виды). */
  getUsedWeaponSlots(): number {
    let used = 0;
    for (const entry of Object.values(this._loadout)) {
      if (entry.owned) used++;
    }
    return used;
  }

  /* ======================== Drone hangar ======================== */

  private droneSys(): DroneSystem {
    return this._droneSystem ?? (this._droneSystem = DroneSystem.create(this._storage));
  }

  /** Снимок флота купленных дронов для боя. */
  getDroneFleetSpec() {
    return this.droneSys().getFleetSpec();
  }

  /** Сколько единиц дрона куплено. */
  getDroneCount(id: DroneId): number {
    return this.droneSys().getCount(id);
  }

  /** Всего занятых слотов флотом. */
  getDroneTotalCount(): number {
    return this.droneSys().getTotalCount();
  }

  /** Уровень линии дрона (0 — дрон не куплен). */
  getDroneStatLevel(id: DroneId, stat: DroneStatKey): number {
    return this.droneSys().getStatLevel(id, stat);
  }

  /** Купить единицу дрона (детали уже списаны вызывающим). */
  buyDrone(id: DroneId): boolean {
    return this.droneSys().buy(id);
  }

  /** Прокачать линию дрона (детали уже списаны вызывающим). */
  upgradeDroneStat(id: DroneId, stat: DroneStatKey): boolean {
    return this.droneSys().upgradeStat(id, stat);
  }
}
