/**
 * MissileWeapon — ракетомёт игрока.
 *
 * Активируется подбором пикапа и работает ограниченное время.
 * Ракеты самонаводящиеся: цель хранится живой ссылкой, поэтому ракета
 * ведёт цель, а не застывшую точку.
 */

import type { Enemy } from "../types";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponSlotState,
} from "./Weapon";

/** Скорость ракеты. */
const MISSILE_SPEED = 280;
/** Время жизни ракеты. */
const MISSILE_LIFE = 3.5;
/** Урон ракеты. */
const MISSILE_DMG = 55;
/** Скорость поворота ракеты, рад/сек. */
const MISSILE_TURN_RATE = 3.0;
/** Интервал между пусками ракет, секунды. */
const MISSILE_LAUNCH_INTERVAL = 0.6;
/** Время работы ракетомёта, секунды. */
const MISSILE_DURATION = 30;
/** Отступ бортового пускового устройства от центра корабля. */
const MISSILE_PORT_OFFSET = 12;
/** Максимальная дистанция наведения ракеты. */
const MISSILE_LOCK_RANGE = 600;

export class MissileWeapon implements Weapon {
  readonly id: WeaponId = "missile";
  readonly meta: WeaponMeta = {
    icon: "weapon-missile",
    color: "#9dffe8",
    labelKey: "hud.loadout.missile",
    order: 1,
  };
  readonly countUpgrade = null;
  readonly usesDamageUpgrade = false;
  readonly usesSolidUpgrade = true;

  /** Ракетомёт активен. */
  private active = false;
  /** Остаток времени работы ракетомёта. */
  private timeLeft = 0;
  /** Остаток до следующего пуска. */
  private cooldown = 0;
  /** Борт, из которого вылетает следующая ракета (0 — левый, 1 — правый). */
  private port: 0 | 1 = 0;
  /** Радиус твёрдого снаряда (0 — снаряды бестелесные). */
  private solidRadius = 0;

  reset(): void {
    this.active = false;
    this.timeLeft = 0;
    this.cooldown = 0;
    this.port = 0;
    this.solidRadius = 0;
  }

  isAvailable(): boolean {
    return this.active;
  }

  activate(): void {
    this.active = true;
    this.timeLeft = MISSILE_DURATION;
    this.cooldown = 0;
    this.port = 0;
  }

  update(dt: number, ctx: WeaponContext): void {
    if (!this.active) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.active = false;
      return;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0) return;

    const target = this.findTarget(ctx.enemies, ctx.player.x, ctx.player.y);
    if (!target) return;

    this.fire(ctx, target);
    this.port = this.port === 0 ? 1 : 0;
    this.cooldown = MISSILE_LAUNCH_INTERVAL;
  }

  getSlot(): WeaponSlotState {
    return {
      id: this.id,
      meta: this.meta,
      progress: Math.min(1, this.timeLeft / MISSILE_DURATION),
      remaining: this.timeLeft,
    };
  }

  getInstanceCount(): number {
    return this.active ? 1 : 0;
  }

  applyModifiers(mods: import("./Weapon").WeaponModifiers): void {
    if (mods.solidRadius != null) this.solidRadius = mods.solidRadius;
  }

  /** Ближайший живой враг в пределах дистанции наведения. */
  private findTarget(
    enemies: readonly Enemy[],
    fromX: number,
    fromY: number
  ): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;

    for (const e of enemies) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - fromX, e.y - fromY);
      // Ограничим дистанцию наведения — ракета не должна锁定 на слишком далёких целях
      if (dist > MISSILE_LOCK_RANGE) continue;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    return nearest;
  }

  /** Пул самонаводящейся ракеты. */
  private fire(ctx: WeaponContext, target: Enemy): void {
    // Борт пуска: смещение перпендикулярно вектору скорости корабля.
    const speed = Math.hypot(ctx.player.vx, ctx.player.vy) || 1;
    const vnx = ctx.player.vx / speed;
    const vny = ctx.player.vy / speed;
    const side = this.port === 0 ? -1 : 1;
    const mx = ctx.player.x + -vny * side * MISSILE_PORT_OFFSET;
    const my = ctx.player.y + vnx * side * MISSILE_PORT_OFFSET;

    // Стартовое направление — на цель, плюс инерция корабля.
    const dx = target.x - mx;
    const dy = target.y - my;
    const dist = Math.hypot(dx, dy) || 1;

    ctx.bullets.push({
      x: mx,
      y: my,
      vx: (dx / dist) * MISSILE_SPEED + ctx.player.vx * 0.25,
      vy: (dy / dist) * MISSILE_SPEED + ctx.player.vy * 0.25,
      life: MISSILE_LIFE,
      dmg: MISSILE_DMG,
      homing: { target, turnRate: MISSILE_TURN_RATE },
      r: this.solidRadius || undefined,
    });

    ctx.onFired(this.id);
  }
}
