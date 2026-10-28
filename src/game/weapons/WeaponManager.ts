/**
 * WeaponManager — владелец оружия игрока.
 *
 * Менеджер отвечает за три вещи:
 *   • хранит экземпляры всех видов оружия и обновляет их каждый кадр;
 *   • ведёт наведение (автоцель + ручной прицел) и передаёт его оружию;
 *   • раскладывает персистентные апгрейды по подходящим видам оружия.
 *
 * Менеджер ничего не знает о пулах игры: всё, что нужно оружию,
 * он получает через WeaponWorld — набор провайдеров живых данных.
 */

import { PLAYER_AIM_BASE_CHANCE } from "../balance";
import { weaponDamageMult, weaponReloadMult, weaponHitChance } from "../upgrades";
import type { LoadoutSlotData } from "../loadout/LoadoutTypes";
import type { PlayerBonuses } from "../loadout/bonuses/Bonus";
import type { AllyDrone, Bullet, Enemy, LaserBeam } from "../types";
import { Targeting, DEFAULT_TARGET_RANGE } from "./Targeting";
import type {
  AimState,
  PlayerSnapshot,
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponLoadout,
  WeaponModifiers,
  WeaponUpgrades,
  ZoneSnapshot,
} from "./Weapon";
import type { DroneFleetSpec } from "../drones/Drone";
import { createWeaponRegistry } from "./WeaponRegistry";

/** Провайдеры живых данных игрового мира для оружия. */
export interface WeaponWorld {
  /** Текущее состояние игрока. */
  getPlayer(): PlayerSnapshot;
  /** Враги — цели для наведения. */
  getEnemies(): readonly Enemy[];
  /** Пул снарядов игрока. */
  getBullets(): Bullet[];
  /** Зарегистрировать новый снаряд игрока в ECS-мире. */
  addBullet(bullet: Bullet): void;
  /** Пул дронов-компаньонов. */
  getDrones(): AllyDrone[];
  /** Зарегистрировать новый дрон-компаньон в ECS-мире. */
  addAllyDrone(drone: AllyDrone): void;
  /** Текущие временные бонусы игрока. */
  getBonuses(): PlayerBonuses;
  /** Пул лучей лазера — визуальная трасса выстрела. */
  getBeams?(): LaserBeam[];
  /** Зарегистрировать новый визуальный луч лазера в ECS-мире. */
  addBeam?(beam: LaserBeam): void;
  /** Удалить истёкший визуальный луч лазера из ECS-мира. */
  removeBeam?(beam: LaserBeam): void;
  /** Граница игровой зоны (null — зона не задана). */
  getZone?(): ZoneSnapshot | null;
  /** Убить врага через единый путь (дроп, счёт, волна). */
  killEnemy?(enemy: Enemy): void;
}

export class WeaponManager {
  private weapons: Record<WeaponId, Weapon>;
  private targeting: Targeting;
  private world: WeaponWorld;
  private onWeaponFired: (id: WeaponId) => void;
  /** Шанс попадания орудий игрока (0..1, всегда < 1). */
  private hitChance = PLAYER_AIM_BASE_CHANCE;
  /** Множитель темпа стрельбы из постоянного бонуса «Темп огня». */
  private fireRateMult = 1;
  /** Арсенал: купленные виды оружия и их модели. */
  private loadout: WeaponLoadout | null = null;
  /** Снимок флота купленных дронов (для DroneWeapon). */
  private droneFleet: DroneFleetSpec | undefined = undefined;

  constructor(
    world: WeaponWorld,
    onWeaponFired: (id: WeaponId) => void,
    targetRange: number = DEFAULT_TARGET_RANGE
  ) {
    this.world = world;
    this.onWeaponFired = onWeaponFired;
    this.weapons = createWeaponRegistry();
    this.targeting = new Targeting(targetRange);
  }

  /** Тик оружия: обновить наведение и все виды оружия. */
  update(dt: number): void {
    this.targeting.update(this.world.getPlayer(), this.world.getEnemies());
    const ctx = this.buildContext();
    for (const weapon of Object.values(this.weapons)) {
      weapon.update(dt, ctx);
    }
  }

  /** Активировать оружие — подбор пикапа с оружием. */
  equipWeapon(id: WeaponId): void {
    this.weapons[id]?.activate(this.buildContext());
  }

  /** Сбросить оружие — начало забега. */
  reset(): void {
    this.fireRateMult = 1;
    this.hitChance = PLAYER_AIM_BASE_CHANCE;
    const ctx = this.buildContext();
    for (const weapon of Object.values(this.weapons)) {
      weapon.reset(ctx);
    }
  }

  /** Применить персистентные апгрейды к подходящим видам оружия. */
  applyUpgrades(upgrades: WeaponUpgrades): void {
    this.fireRateMult = upgrades.fireRateMult;
    const ctx = this.buildContext();
    for (const weapon of Object.values(this.weapons)) {
      const mods: WeaponModifiers = {};
      if (weapon.countUpgrade === "drones") mods.count = upgrades.droneSlots;
      const entry = this.loadout?.[weapon.id];
      if (entry) {
        mods.owned = entry.owned;
        mods.model = { ...entry.model };
        mods.reloadMult = weaponReloadMult(entry.model);
        mods.damageMult = weaponDamageMult(entry.model);
        if (weapon.usesPersonalAccuracy) {
          mods.accuracy = weaponHitChance(weapon.id, entry.model);
        }
      }
      if (weapon.id === "drone") {
        mods.droneFleet = this.droneFleet;
      }
      weapon.applyModifiers(mods, ctx);
    }
  }

  /** Установить персистентный арсенал из хранилища. */
  setLoadout(loadout: WeaponLoadout): void {
    this.loadout = loadout;
  }

  /** Установить снимок флота купленных дронов. */
  setDroneFleet(fleet: DroneFleetSpec): void {
    this.droneFleet = fleet;
  }

  /** Оружие куплено игроком. */
  isOwned(id: WeaponId): boolean {
    return this.loadout?.[id]?.owned ?? false;
  }

  /** Слоты оружия для строки снаряжения. */
  getSlots(): LoadoutSlotData[] {
    const ctx = this.buildContext();
    const slots: LoadoutSlotData[] = [];
    for (const weapon of Object.values(this.weapons)) {
      if (!weapon.isAvailable(ctx)) continue;
      const slot = weapon.getSlot(ctx);
      slots.push({
        kind: slot.id,
        meta: slot.meta,
        progress: slot.progress,
        remaining: slot.remaining,
      });
    }
    return slots;
  }

  /** Число экземпляров оружия у игрока (стволы пушки, дроны). */
  getInstanceCount(id: WeaponId): number {
    const weapon = this.weapons[id];
    return weapon ? weapon.getInstanceCount(this.buildContext()) : 0;
  }

  /** Задать ручной прицел (мышь/тач). */
  setManualAim(angle: number | null): void {
    this.targeting.setManualAim(angle);
  }

  /** Сообщить, что игрок держит огонь. */
  setManualFiring(firing: boolean): void {
    this.targeting.setManualFiring(firing);
  }

  /** Текущий угол прицеливания (null — прицел не задан). */
  getAimAngle(): number | null {
    return this.targeting.angle;
  }

  /** Собрать контекст для оружия из живых данных мира. */
  private buildContext(): WeaponContext {
    const aim: AimState = {
      angle: this.targeting.angle,
      firing: this.targeting.firing,
      target: this.targeting.currentTarget,
      hitChance: this.hitChance,
    };
    const bonuses = this.world.getBonuses();

    return {
      player: this.world.getPlayer(),
      bonuses: {
        ...bonuses,
        rateMult: bonuses.rateMult * this.fireRateMult,
      },
      aim,
      enemies: this.world.getEnemies(),
      bullets: this.world.getBullets(),
      addBullet: (bullet) => this.world.addBullet(bullet),
      drones: this.world.getDrones(),
      addAllyDrone: (drone) => this.world.addAllyDrone(drone),
      beams: this.world.getBeams?.() ?? [],
      addBeam: (beam) => this.world.addBeam?.(beam),
      removeBeam: (beam) => this.world.removeBeam?.(beam),
      zone: this.world.getZone?.() ?? null,
      onFired: (id) => this.onWeaponFired(id),
      killEnemy: (enemy) => this.world.killEnemy?.(enemy),
    };
  }
}
