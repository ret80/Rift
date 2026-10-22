/**
 * DroneWeapon — дроны-компаньоны игрока.
 *
 * Дроны кружат по орбите вокруг корабля, сами выбирают цель
 * и стреляют по ней настоящими снарядами.
 *
 * Состав роя складывается из двух источников:
 *   • постоянные дроны — апгрейд «дроны», восстанавливаются после гибели;
 *   • бонусные дроны — пикап «дрон», гибнут безвозвратно.
 */

import type { AllyDrone, Enemy } from "../types";
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
/** Урон снаряда дрона. */
const DRONE_BULLET_DMG = 8;
/** Интервал между выстрелами дрона, секунды. */
const DRONE_FIRE_CD = 0.5;
/** Скорость снаряда дрона. */
const DRONE_BULLET_SPEED = 500;
/** Время жизни снаряда дрона. */
const DRONE_BULLET_LIFE = 0.7;
/** Максимальное число дронов в рое. */
export const MAX_ALLY_DRONES = 8;
/** Радиус дрона. */
const DRONE_RADIUS = 10;
/** Доля корпуса игрока, получаемая одним дроном. */
const DRONE_HP_RATIO = 0.25;
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
  readonly usesDamageUpgrade = false;
  readonly usesSolidUpgrade = false;

  /** Постоянные дроны из апгрейда — восстанавливаются после гибели. */
  private permanentDrones = 0;
  /** Бонусные дроны из пикапов — гибнут безвозвратно. */
  private bonusDrones = 0;

  reset(): void {
    this.permanentDrones = 0;
    this.bonusDrones = 0;
  }

  isAvailable(ctx: WeaponContext): boolean {
    return ctx.drones.length > 0;
  }

  activate(ctx: WeaponContext): void {
    // Бонусный дрон появляется сразу и больше не восстанавливается.
    if (ctx.drones.length >= MAX_ALLY_DRONES) return;
    ctx.drones.push(this.createDrone(ctx, false));
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
    if (mods.count == null) return;
    this.permanentDrones = Math.min(MAX_ALLY_DRONES, Math.max(0, mods.count));
  }

  /**
   * Синхронизировать состав роя с источниками дронов.
   * Постоянные дроны возвращаются на место, бонусные — нет.
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

    const wantPermanent = Math.min(this.permanentDrones, MAX_ALLY_DRONES);
    for (let i = alivePermanent; i < wantPermanent; i++) {
      if (ctx.drones.length >= MAX_ALLY_DRONES) break;
      ctx.drones.push(this.createDrone(ctx, true));
    }
  }

  /**
   * Тик одного дрона: орбита, выбор цели, выстрел.
   * Возвращает true, если дрон выстрелил.
   */
  private updateDrone(dt: number, drone: AllyDrone, ctx: WeaponContext): boolean {
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
    const dist = Math.hypot(dx, dy);
    if (dist > DRONE_TARGET_RANGE) return false;
    if (drone.fireCd > 0) return false;

    // Выстрел.
    drone.fireCd = DRONE_FIRE_CD;
    drone.flash = DRONE_FLASH_TIME;
    drone.angle = Math.atan2(dy, dx);
    ctx.bullets.push({
      x: drone.x,
      y: drone.y,
      vx: (dx / dist) * DRONE_BULLET_SPEED,
      vy: (dy / dist) * DRONE_BULLET_SPEED,
      life: DRONE_BULLET_LIFE,
      dmg: DRONE_BULLET_DMG,
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

  /** Создать дрона и поместить его на орбиту. */
  private createDrone(ctx: WeaponContext, permanent: boolean): AllyDrone {
    const phase = (ctx.drones.length / MAX_ALLY_DRONES) * Math.PI * 2;
    const hp = Math.max(1, Math.round(ctx.player.maxHp * DRONE_HP_RATIO));

    return {
      x: ctx.player.x + Math.cos(phase) * DRONE_ORBIT_RADIUS,
      y: ctx.player.y + Math.sin(phase) * DRONE_ORBIT_RADIUS,
      r: DRONE_RADIUS,
      angle: phase,
      fireCd: 0,
      phase,
      hp,
      maxHp: hp,
      target: null,
      retargetT: 0,
      flash: 0,
      permanent,
    };
  }
}
