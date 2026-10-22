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

import type { LoadoutSlotData } from "../loadout/LoadoutTypes";
import type { PlayerBonuses } from "../loadout/bonuses/Bonus";
import type { AllyDrone, Bullet, Enemy } from "../types";
import type { WeaveThread } from "../types";
import { CANNON_TARGET_RANGE } from "./CannonWeapon";
import { Targeting } from "./Targeting";
import type {
  AimState,
  PlayerSnapshot,
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponModifiers,
  WeaponUpgrades,
} from "./Weapon";
import { createWeaponRegistry } from "./WeaponRegistry";

/** Провайдеры живых данных игрового мира для оружия. */
export interface WeaponWorld {
  /** Текущее состояние игрока. */
  getPlayer(): PlayerSnapshot;
  /** Враги — цели для наведения. */
  getEnemies(): readonly Enemy[];
  /** Пул снарядов игрока. */
  getBullets(): Bullet[];
  /** Пул дронов-компаньонов. */
  getDrones(): AllyDrone[];
  /** Текущие временные бонусы игрока. */
  getBonuses(): PlayerBonuses;
  /** Нити ткани пространства. */
  getWeaves?(): WeaveThread[];
}

export class WeaponManager {
  private weapons: Record<WeaponId, Weapon>;
  private targeting: Targeting;
  private world: WeaponWorld;
  private onWeaponFired: (id: WeaponId) => void;
  /** Множитель темпа стрельбы из персистентного апгрейда. */
  private fireRateMult = 1;

  constructor(world: WeaponWorld, onWeaponFired: (id: WeaponId) => void) {
    this.world = world;
    this.onWeaponFired = onWeaponFired;
    this.weapons = createWeaponRegistry();
    this.targeting = new Targeting(CANNON_TARGET_RANGE);
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
      if (weapon.usesDamageUpgrade) mods.damage = upgrades.damageBonus;
      if (weapon.countUpgrade === "guns") mods.count = upgrades.guns;
      else if (weapon.countUpgrade === "drones") mods.count = upgrades.drones;
      if (weapon.usesSolidUpgrade) mods.solidRadius = upgrades.solidBulletRadius;
      weapon.applyModifiers(mods, ctx);
    }
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
      drones: this.world.getDrones(),
      weaves: this.world.getWeaves?.() ?? [],
      onFired: (id) => this.onWeaponFired(id),
    };
  }
}
