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

import { aimAtTarget } from "../aiming/AimSolver";
import type { AllyDrone, Enemy } from "../types";
import type { DroneCombatSpec, DroneFleetSpec, DroneId } from "../drones/Drone";
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

/** Радиус орбиты дронов вокруг корабля. */
export const DRONE_ORBIT_RADIUS = 58;
/** Скорость вращения роя вокруг корабля. */
const DRONE_ORBIT_SPEED = 0.5;
/** Дальность захвата цели дроном. */
const DRONE_TARGET_RANGE = 430;
/** Максимальное число дронов в рое (и слотов корабля). */
export const MAX_ALLY_DRONES = 8;
/** Период смены цели дроном, секунды. */
const DRONE_RETARGET_INTERVAL = 1;
/** Длительность вспышки ствола после выстрела, секунды. */
const DRONE_FLASH_TIME = 0.15;

export class DroneWeapon implements Weapon {
  readonly id: WeaponId = "drone";
  readonly meta: WeaponMeta = {
    icon: "pickup-drone",
    color: "#ff9de0",
    labelKey: "hud.loadout.drone",
    order: 2,
  };
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
    ctx.drones.push(this.createUnit(ctx, scout ?? this.defaultScoutSpec(), false));
    this.bonusDrones++;
  }

  update(dt: number, ctx: WeaponContext): void {
    this.syncDrones(ctx);

    let fired = false;
    for (const drone of ctx.drones) {
      if (this.updateDrone(dt, drone, ctx)) fired = true;
    }
    if (fired) ctx.onFired(this.id);
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
      if (drone.permanent) alivePermanent++;
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
        ctx.drones.push(this.createUnit(ctx, combat, true, spec.id));
        index++;
      }
    }
  }

  /**
   * Тик одного дрона: орбита, выбор цели, выстрел.
   * Возвращает true, если дрон выстрелил.
   */
  private updateDrone(dt: number, drone: AllyDrone, ctx: WeaponContext): boolean {
    const combat = drone.combat;
    if (!combat) return false;

    // Орбита вокруг корабля.
    drone.phase += dt * DRONE_ORBIT_SPEED;
    drone.x = ctx.player.x + Math.cos(drone.phase) * DRONE_ORBIT_RADIUS;
    drone.y = ctx.player.y + Math.sin(drone.phase) * DRONE_ORBIT_RADIUS;
    drone.angle = drone.phase + Math.PI / 2;

    if (drone.flash > 0) drone.flash = Math.max(0, drone.flash - dt);
    if (drone.fireCd > 0) drone.fireCd = Math.max(0, drone.fireCd - dt);

    // Выбор цели.
    drone.retargetT -= dt;
    if (!drone.target || drone.retargetT <= 0 || drone.target.dead) {
      drone.target = this.findTarget(drone.x, drone.y, ctx.enemies);
      drone.retargetT = DRONE_RETARGET_INTERVAL;
    }

    const target = drone.target;
    if (!target) return false;

    const dx = target.x - drone.x;
    const dy = target.y - drone.y;
    if (Math.hypot(dx, dy) > DRONE_TARGET_RANGE) return false;
    if (drone.fireCd > 0) return false;

    // Выстрел с упреждением: снаряд летит в точку, куда цель придёт к подлёту.
    const angle = aimAtTarget(
      {
        sx: drone.x,
        sy: drone.y,
        target,
        bulletSpeed: combat.bulletSpeed,
        maxFlightTime: combat.bulletLife,
      },
      ctx.aim.hitChance,
      target.r
    );

    drone.fireCd = combat.reloadTime;
    drone.flash = DRONE_FLASH_TIME;
    drone.angle = angle;
    ctx.bullets.push({
      x: drone.x,
      y: drone.y,
      vx: Math.cos(angle) * combat.bulletSpeed,
      vy: Math.sin(angle) * combat.bulletSpeed,
      life: combat.bulletLife,
      dmg: combat.damage,
    });

    return true;
  }

  /** Ближайший живой враг в зоне захвата дрона. */
  private findTarget(x: number, y: number, enemies: readonly Enemy[]): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = DRONE_TARGET_RANGE;

    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }

  /** Создать единицу дрона с указанным видом и поместить её на орбиту. */
  private createUnit(
    ctx: WeaponContext,
    combat: DroneCombatSpec,
    permanent: boolean,
    kind: DroneId = "scout"
  ): AllyDrone {
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
      target: null,
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
