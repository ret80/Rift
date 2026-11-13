/**
 * UpgradeSystem — прокачка забега игрока.
 *
 * Держит линии корабля, арсенал и ангар дронов текущего забега и
 * пересчитывает боевые значения (`AppliedUpgrades`) после каждой покупки.
 * Ничего из этого не сохраняется: смерть/новый забег начинаются с
 * базового корабля. Постоянный слой — кредиты и таланты Эха Разлома,
 * их бонусы применяются поверх прокачки забега.
 */

import {
  applyUpgrades as applyUpgradesRaw,
  defaultUpgrades,
  defaultWeaponLoadout,
  upgradeCost,
  weaponCost,
  weaponUpgradeCost,
  UPGRADE_TIERS,
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type AppliedUpgrades,
  type UpgradeKey,
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
import { DRONE_STAT_MAX_LEVEL, droneCost, droneUpgradeCost } from "../drones/Drone";
import { Wallet } from "../economy/Wallet";
import { copyDroneLoadout, copyWeaponLoadout } from "../loadout/snapshots";

/** Начальное состояние забега: используется симуляцией и реплеем. */
export interface RunSeed {
  upgrades?: Partial<PlayerUpgrades>;
  weaponLoadout?: WeaponLoadout;
  droneLoadout?: DroneLoadout;
}
import type { MetaBonuses } from "../meta/types";
import { noMetaBonuses } from "../meta/types";
import { DEFAULT_PARAMS, type PlayerParams } from "../balance/params/GameParams";

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
  /** Параметры корабля: базовый корпус задаётся профилем мира. */
  private _playerParams: PlayerParams = DEFAULT_PARAMS.player;
  /** Детали забега: покупки идут только через кошелёк. */
  private readonly _parts = new Wallet();

  private constructor() {
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses, this._playerParams);
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
    this._parts.set(0);
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses, this._playerParams);
  }

  /**
   * Применить сохранённый набор покупок (тестовый профиль).
   * Кошелёк не трогается: тестовая волна отдельно выдаёт запас деталей.
   */
  applyProfile(seed: RunSeed): void {
    this._playerUpgrades = { ...defaultUpgrades(), ...(seed.upgrades ?? {}) };
    this._loadout = seed.weaponLoadout
      ? copyWeaponLoadout(seed.weaponLoadout)
      : defaultWeaponLoadout();
    this._droneSystem.setLoadout(
      seed.droneLoadout ? copyDroneLoadout(seed.droneLoadout) : defaultDroneLoadout(),
    );
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses, this._playerParams);
  }

  /** Снимок текущих покупок для тестового профиля (без деталей). */
  captureProfile(): Required<RunSeed> {
    return {
      upgrades: { ...this._playerUpgrades },
      weaponLoadout: copyWeaponLoadout(this._loadout),
      droneLoadout: copyDroneLoadout(this._droneSystem.loadout),
    };
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

  /** Задать параметры корабля из профиля мира. */
  setPlayerParams(params: PlayerParams): void {
    this._playerParams = params;
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses, this._playerParams);
  }

  /** Применить бонусы Эха Разлома к текущему забегу. */
  setMetaBonuses(bonuses: MetaBonuses): void {
    this._metaBonuses = bonuses;
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses, this._playerParams);
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
    this._appliedUpgrades = applyUpgradesRaw(this._playerUpgrades, this._metaBonuses, this._playerParams);
  }

  /* ======================== Purchase ======================== */

  /** Симуляция и самопроверка: купить уровень без списания (dev only). */
  purchaseNoCost(key: UpgradeKey): boolean {
    if (this._playerUpgrades[key] == null) return false;
    (this._playerUpgrades[key] as number) += 1;
    this.refresh();
    return true;
  }

  /** Купить уровень линии корабля/бонуса за детали. */
  purchaseUpgrade(key: UpgradeKey): boolean {
    const level = this._playerUpgrades[key];
    if (level >= UPGRADE_TIERS[key].maxLevel) return false;
    if (!this._parts.spend(upgradeCost(key, level))) return false;
    (this._playerUpgrades[key] as number) = level + 1;
    this.refresh();
    return true;
  }

  /* ======================== Parts management ======================== */

  /** Кошелёк деталей: единственный источник правды о балансе. */
  get partsWallet(): Wallet {
    return this._parts;
  }

  /** Добавить детали забега (в бесконечном режиме баланс не растёт). */
  addParts(amount: number): void {
    this._parts.add(amount);
  }

  /* ======================== Weapon loadout management ======================== */

  /** Купить оружие в арсенале забега. Возвращает true при успехе. */
  purchaseWeapon(id: WeaponId): boolean {
    const entry = this._loadout[id];
    if (!entry || entry.owned) return false;
    // Закрытое достижением оружие не купить: сначала нужно выполнить условие.
    if (!this.isWeaponUnlocked(id)) return false;
    if (this.getUsedWeaponSlots() >= this.getApplied("weaponSlots")) return false;
    if (!this._parts.spend(weaponCost(id))) return false;
    entry.owned = true;
    this.refresh();
    return true;
  }

  /** Купить уровень линии оружия в арсенале. Возвращает true при успехе. */
  upgradeWeaponStat(id: WeaponId, stat: WeaponStatKey): boolean {
    const entry = this._loadout[id];
    if (!entry || !entry.owned) return false;
    const level = entry.model[stat];
    if (level >= WEAPON_STAT_MAX_LEVEL) return false;
    if (!this._parts.spend(weaponUpgradeCost(level))) return false;
    entry.model[stat] = level + 1;
    this.refresh();
    return true;
  }

  /* ======================== Accessors ======================== */

  getParts(): number {
    return this._parts.amount;
  }

  /** Включён ли бесконечный запас деталей. */
  isPartsInfinite(): boolean {
    return this._parts.infinite;
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

  /** Купить единицу дрона: слоты, достижение и детали проверяются здесь. */
  purchaseDrone(id: DroneId): boolean {
    if (!this.isDroneUnlocked(id)) return false;
    if (this.getDroneTotalCount() >= this.getApplied("droneSlots")) return false;
    if (!this._parts.spend(droneCost(id))) return false;
    const bought = this._droneSystem.buy(id);
    if (bought) this.refresh();
    return bought;
  }

  /** Прокачать линию дрона за детали. */
  upgradeDroneStat(id: DroneId, stat: DroneStatKey): boolean {
    if (this.getDroneCount(id) <= 0) return false;
    const level = this._droneSystem.getStatLevel(id, stat);
    if (level >= DRONE_STAT_MAX_LEVEL) return false;
    if (!this._parts.spend(droneUpgradeCost(level))) return false;
    const upgraded = this._droneSystem.upgradeStat(id, stat);
    if (upgraded) this.refresh();
    return upgraded;
  }
}
