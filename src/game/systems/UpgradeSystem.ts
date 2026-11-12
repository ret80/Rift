/**
 * UpgradeSystem — прокачка забега игрока.
 *
 * Держит линии корабля, арсенал и ангар дронов текущего забега и
 * пересчитывает боевые значения (`AppliedUpgrades`) после каждой покупки.
 * Ничего из этого не сохраняется: смерть/новый забег начинаются с
 * базового корабля. Постоянный слой — кредиты и таланты Зеркала Ночи,
 * их бонусы применяются поверх прокачки забега.
 */

import {
  applyUpgrades as applyUpgradesRaw,
  defaultUpgrades,
  defaultWeaponLoadout,
  weaponCost,
  weaponUpgradeCost,
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type AppliedUpgrades,
  type WeaponStatKey,
} from "../upgrades";
import type {
  WeaponId,
  WeaponLoadout,
  WeaponUpgrades,
} from "../weapons/Weapon";
import { DroneSystem } from "../drones/DroneSystem";
import type { DroneId, DroneLoadout, DroneStatKey } from "../drones/Drone";
import { defaultDroneLoadout } from "../drones/DroneSystem";

/** Начальное состояние забега: используется симуляцией и реплеем. */
export interface RunSeed {
  upgrades?: Partial<PlayerUpgrades>;
  weaponLoadout?: WeaponLoadout;
  droneLoadout?: DroneLoadout;
}
import type { MetaBonuses } from "../meta/types";
import { noMetaBonuses } from "../meta/types";

export class UpgradeSystem {
  private _playerUpgrades: PlayerUpgrades = defaultUpgrades();
  private _loadout: WeaponLoadout = defaultWeaponLoadout();
  private readonly _droneSystem = new DroneSystem();
  private _appliedUpgrades: AppliedUpgrades;
  /** Бонусы мета-талантов, применяемые поверх прокачки забега. */
  private _metaBonuses: MetaBonuses = noMetaBonuses();
  /**
   * Открытые достижениями виды оружия и дронов. `null` — без ограничений
   * (симуляция, отладка и сценарии не зависят от прогресса игрока).
   */
  private _unlockedWeapons: ReadonlySet<string> | null = null;
  private _unlockedDrones: ReadonlySet<string> | null = null;

  private constructor() {
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses);
  }

  static create(): UpgradeSystem {
    return new UpgradeSystem();
  }

  /* ======================== Run lifecycle ======================== */

  /**
   * Сбросить прокачку забега к базовому кораблю.
   * `seed` задаёт стартовое состояние (сценарии симуляции и реплей).
   */
  resetRun(seed?: RunSeed): void {
    this._playerUpgrades = { ...defaultUpgrades(), ...(seed?.upgrades ?? {}) };
    this._loadout = seed?.weaponLoadout ?? defaultWeaponLoadout();
    this._droneSystem.setLoadout(seed?.droneLoadout ?? defaultDroneLoadout());
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses);
  }

  /** Задать открытые достижениями виды оружия; null — все доступны. */
  setUnlockedWeapons(ids: ReadonlySet<string> | null): void {
    this._unlockedWeapons = ids;
  }

  /** Задать открытые достижениями виды дронов; null — все доступны. */
  setUnlockedDrones(ids: ReadonlySet<string> | null): void {
    this._unlockedDrones = ids;
  }

  /** Открыт ли вид оружия (без достижений — только пушка). */
  isWeaponUnlocked(id: WeaponId): boolean {
    return this._unlockedWeapons === null || this._unlockedWeapons.has(id);
  }

  /** Открыт ли вид дрона. */
  isDroneUnlocked(id: DroneId): boolean {
    return this._unlockedDrones === null || this._unlockedDrones.has(id);
  }

  /** Применить бонусы Зеркала Ночи к текущему забегу. */
  setMetaBonuses(bonuses: MetaBonuses): void {
    this._metaBonuses = bonuses;
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses);
  }

  get playerUpgrades(): PlayerUpgrades {
    return this._playerUpgrades;
  }

  /** Арсенал забега: купленные виды оружия и их модели. */
  get loadout(): WeaponLoadout {
    return this._loadout;
  }

  /** Ангар дронов забега: купленные дроны и их модели. */
  get droneLoadout(): DroneLoadout {
    return this._droneSystem.loadout;
  }

  /* ======================== Apply to systems ======================== */

  /**
   * Применить прокачку к живым системам.
   * Каждая система сама решает, что с ней делать.
   */
  applyToSystems(targets: {
    /** Задать максимальный корпус игрока. */
    setMaxHp: (v: number) => void;
    /** Передать апгрейды оружию. */
    setWeaponUpgrades: (upgrades: WeaponUpgrades) => void;
    /** Задать постоянный множитель скорости игрока. */
    setSpeedMult: (v: number) => void;
    /** Задать множитель длительности бонуса «темп огня». */
    setRateDurationMult: (v: number) => void;
    /** Задать множитель длительности бонуса «здоровье». */
    setHealDurationMult: (v: number) => void;
    /** Задать множитель скорости восстановления бонуса «здоровье». */
    setHealRateMult: (v: number) => void;
    /** Задать уровень линии «процент щита». */
    setShieldBlockLevel: (v: number) => void;
    /** Задать уровень линии «скорость восстановления щита». */
    setShieldRegenLevel: (v: number) => void;
    /** Задать факт покупки щита. */
    setShieldOwned: (v: boolean) => void;
    /** Восстановить корпус игрока до максимума. */
    resetHp?: () => void;
  }): void {
    const up = this._appliedUpgrades;
    targets.setMaxHp(up.baseHp);
    targets.setWeaponUpgrades(up);
    targets.setSpeedMult(up.speedMult);
    targets.setRateDurationMult(up.rateDurationMult);
    targets.setHealDurationMult(up.healDurationMult);
    targets.setHealRateMult(up.healRateMult);
    targets.setShieldOwned(up.shieldOwned);
    targets.setShieldBlockLevel(up.shieldBlockLevel);
    targets.setShieldRegenLevel(up.shieldRegenLevel);
    if (targets.resetHp) {
      targets.resetHp();
    }
  }

  /* ======================== Refresh ======================== */

  /** Пересчитать применённые значения (после покупки). */
  refresh(): void {
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses);
  }

  /* ======================== Purchase (debug) ======================== */

  /** Debug-only: purchase upgrade without cost (dev only). */
  purchaseNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    if (this._playerUpgrades[key] == null) return false;
    (this._playerUpgrades[key] as number) += 1;
    this.refresh();
    return true;
  }

  /* ======================== Parts management ======================== */

  /** Добавить детали забега. */
  addParts(amount: number): void {
    this._playerUpgrades.parts += amount;
  }

  /* ======================== Weapon loadout management ======================== */

  /** Купить оружие в арсенале забега. Возвращает true при успехе. */
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
    // Закрытое достижением оружие не купить: сначала нужно выполнить условие.
    if (!free && !this.isWeaponUnlocked(id)) return false;
    if (this.getUsedWeaponSlots() >= this.getApplied("weaponSlots")) return false;
    if (!free) {
      const cost = weaponCost(id);
      if (this._playerUpgrades.parts < cost) return false;
      this._playerUpgrades.parts -= cost;
    }
    entry.owned = true;
    this.refresh();
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
    this.refresh();
    return true;
  }

  /* ======================== Accessors ======================== */

  getParts(): number {
    return this._playerUpgrades.parts;
  }

  getApplied<T extends keyof AppliedUpgrades>(key: T): AppliedUpgrades[T] {
    return this._appliedUpgrades[key];
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

  /** Снимок флота купленных дронов для боя. */
  getDroneFleetSpec() {
    return this._droneSystem.getFleetSpec();
  }

  /** Сколько единиц дрона куплено. */
  getDroneCount(id: DroneId): number {
    return this._droneSystem.getCount(id);
  }

  /** Всего занятых слотов флотом. */
  getDroneTotalCount(): number {
    return this._droneSystem.getTotalCount();
  }

  /** Уровень линии дрона (0 — дрон не куплен). */
  getDroneStatLevel(id: DroneId, stat: DroneStatKey): number {
    return this._droneSystem.getStatLevel(id, stat);
  }

  /** Купить единицу дрона (детали уже списаны вызывающим). */
  buyDrone(id: DroneId): boolean {
    const bought = this._droneSystem.buy(id);
    if (bought) this.refresh();
    return bought;
  }

  /** Прокачать линию дрона (детали уже списаны вызывающим). */
  upgradeDroneStat(id: DroneId, stat: DroneStatKey): boolean {
    const upgraded = this._droneSystem.upgradeStat(id, stat);
    if (upgraded) this.refresh();
    return upgraded;
  }
}
