/**
 * DroneWeapon — дроны-компаньоны игрока.
 *
 * Дроны кружат по орбите вокруг корабля, сами выбирают цель
 * и стреляют по ней настоящими снарядами с упреждением — так же,
 * как пушка игрока.
 *
 * Состав роя собирается из флота, купленного во вкладке «ДРОНЫ»:
 * каждая единица дрона занимает один слот корабля и участвует в бою.
 * Характеристики орудия (урон, перезарядка, скорость снаряда) берутся
 * из вида дрона и его персональной прокачки. Бонусный пикап «дрон»
 * добавляет временную единицу разведчика, которая гибнет безвозвратно.
 */

import type { DroneCombatSpec, DroneFleetSpec, DroneId } from "../drones/Drone";
import type { AllyDroneSpawn } from "../ecs";
import {
  DRONE_CATALOG,
  buildDroneCombatSpec,
} from "../drones/Drone";
import type {
    Weapon,
    WeaponContext,
    WeaponId,
    WeaponMeta,
    WeaponModifiers,
    WeaponSlotState,
} from "./Weapon";
import { WEAPON_CATALOG } from "./WeaponCatalog";

/** Радиус орбиты дронов вокруг корабля. */
export const DRONE_ORBIT_RADIUS = 58;
/** Максимальное число дронов в рое (и слотов корабля). */
export const MAX_ALLY_DRONES = 8;

export class DroneWeapon implements Weapon {
  readonly id: WeaponId = "drone";
  readonly meta: WeaponMeta = WEAPON_CATALOG.drone;
  readonly countUpgrade = "drones" as const;
  readonly usesPersonalAccuracy = false;
  readonly baseDamage = 8;

  /** Снимок флота купленных дронов. */
  private fleet: DroneFleetSpec | null = null;

  /** Временные дроны из пикапов — гибнут безвозвратно. */
  private bonusDrones = 0;

  reset(): void {
    this.bonusDrones = 0;
  }

  isAvailable(ctx: WeaponContext): boolean {
    return ctx.drones.length > 0;
  }

  activate(ctx: WeaponContext): void {
    // Бонусный дрон появляется сразу и больше не восстанавливается.
    if (ctx.drones.length >= MAX_ALLY_DRONES) return;
    const scout = this.fleet?.specs.scout ?? null;
    ctx.addAllyDrone(this.createUnit(ctx, scout ?? this.defaultScoutSpec(), false));
    this.bonusDrones++;
  }

  update(dt: number, ctx: WeaponContext): void {
    this.syncDrones(ctx);
    // Орбита/цель/стрельба/гибель дронов ведётся ECS-системой AllyDroneSystem.
  }

  getSlot(): WeaponSlotState {
    return {
      id: this.id,
      meta: this.meta,
      progress: 1,
      remaining: 0,
    };
  }

  getInstanceCount(ctx: WeaponContext): number {
    return ctx.drones.length;
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.droneFleet) {
      this.fleet = mods.droneFleet;
    }
  }

  /**
   * Синхронизировать состав роя с флотом и бонусной единицей:
   * единицы флота возвращаются на место после гибели, бонусные — нет.
   */
  private syncDrones(ctx: WeaponContext): void {
    let alivePermanent = 0;
    let aliveBonus = 0;
    for (const drone of ctx.drones) {
      if (drone.marker.permanent) alivePermanent++;
      else aliveBonus++;
    }

    // Бонусный дрон погиб и не восстанавливается — уменьшаем запас.
    if (aliveBonus < this.bonusDrones) this.bonusDrones = aliveBonus;

    const fleet = this.fleet;
    let wantPermanent = 0;
    if (fleet) {
      for (const spec of DRONE_CATALOG) {
        wantPermanent += fleet.counts[spec.id] ?? 0;
      }
    }
    wantPermanent = Math.min(wantPermanent, MAX_ALLY_DRONES);

    // Недостающие единицы флота добавляются по порядку каталога.
    let index = alivePermanent;
    for (const spec of DRONE_CATALOG) {
      const count = Math.min(fleet?.counts[spec.id] ?? 0, MAX_ALLY_DRONES);
      const combat = fleet?.specs[spec.id] ?? this.defaultScoutSpec();
      for (let i = 0; i < count && index < wantPermanent; i++) {
        if (ctx.drones.length >= MAX_ALLY_DRONES) break;
        ctx.addAllyDrone(this.createUnit(ctx, combat, true, spec.id));
        index++;
      }
    }
  }

  /**
   * Создать единицу дрона с указанным видом и поместить её на орбиту.
   * Физическое поведение (орбита/цель/стрельба/гибель) ведёт
   * ECS-система AllyDroneSystem, здесь задаются только характеристики.
   */
  private createUnit(
    ctx: WeaponContext,
    combat: DroneCombatSpec,
    permanent: boolean,
    kind: DroneId = "scout"
  ): AllyDroneSpawn {
    const phase = (ctx.drones.length / MAX_ALLY_DRONES) * Math.PI * 2;
    const hp = Math.max(1, Math.round(ctx.player.maxHp * combat.hpRatio));

    return {
      x: ctx.player.x + Math.cos(phase) * DRONE_ORBIT_RADIUS,
      y: ctx.player.y + Math.sin(phase) * DRONE_ORBIT_RADIUS,
      r: combat.radius,
      angle: phase,
      fireCd: 0,
      phase,
      hp,
      maxHp: hp,
      targetId: null,
      retargetT: 0,
      flash: 0,
      permanent,
      kind,
      combat,
    };
  }

  /** Характеристики разведчика по умолчанию (если флот не задан). */
  private defaultScoutSpec(): DroneCombatSpec {
    return buildDroneCombatSpec("scout", { reload: 0, damage: 0 });
  }
}
