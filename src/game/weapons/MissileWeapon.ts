/**
 * MissileWeapon — ракетница игрока.
 *
 * Ракетницу можно купить в «АРСЕНАЛЕ» (постоянная) или подобрать
 * пикапом (работает ограниченное время). Ракеты вылетают поочерёдно
 * с левого и правого борта корабля, самонаводятся на ближайшего
 * живого врага и наносят урон при попадании.
 *
 * Если цель погибла до подлёта, ракета перенаводится на ближайшего
 * живого врага; когда время жизни ракеты истекает, она исчезает
 * независимо от того, попала она в цель или нет.
 */

import type { Enemy } from "../types";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponModifiers,
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
/** Время работы ракетомёта после подбора, секунды. */
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
  readonly usesPersonalAccuracy = false;
  readonly baseDamage = MISSILE_DMG;

  /** Ракетница куплена в арсенале (постоянно доступна). */
  private owned = false;
  /** Ракетница активна после подбора пикапа. */
  private active = false;
  /** Остаток времени работы ракетницы, секунды. */
  private timeLeft = 0;
  /** Остаток перезарядки до следующего пуска. */
  private cooldown = 0;
  /** Борт, из которого вылетает следующая ракета (0 — левый, 1 — правый). */
  private port: 0 | 1 = 0;
  /** Радиус твёрдого снаряда (0 — снаряды бестелесные). */
  private solidRadius = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;

  reset(): void {
    this.owned = false;
    this.active = false;
    this.timeLeft = 0;
    this.cooldown = 0;
    this.port = 0;
    this.solidRadius = 0;
    this.reloadMult = 1;
    this.damageMult = 1;
  }

  isAvailable(): boolean {
    return this.owned || this.active;
  }

  activate(): void {
    this.active = true;
    this.timeLeft = MISSILE_DURATION;
    this.cooldown = 0;
    this.port = 0;
  }

  update(dt: number, ctx: WeaponContext): void {
    if (!this.active && !this.owned) return;

    // Забег по времени: ракетница из пикапа ограничена, купленная — постоянная.
    if (this.active && !this.owned) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.active = false;
        return;
      }
    } else {
      this.timeLeft = MISSILE_DURATION;
    }

    this.cooldown = Math.max(0, this.cooldown - dt);
    if (this.cooldown > 0) return;

    const target = this.findTarget(ctx.enemies, ctx.player.x, ctx.player.y);
    if (!target) return;

    this.fire(ctx, target);
    this.port = this.port === 0 ? 1 : 0;
    this.cooldown = MISSILE_LAUNCH_INTERVAL * this.reloadMult;
  }

  getSlot(): WeaponSlotState {
    // Купленная ракетница бессрочная: кольцо показывает перезарядку.
    if (this.owned) {
      const max = MISSILE_LAUNCH_INTERVAL * this.reloadMult;
      return {
        id: this.id,
        meta: this.meta,
        progress: max > 0 ? 1 - Math.min(1, Math.max(0, this.cooldown) / max) : 1,
        remaining: Math.max(0, this.cooldown),
      };
    }
    return {
      id: this.id,
      meta: this.meta,
      progress:
        MISSILE_DURATION > 0
          ? Math.max(0, Math.min(1, this.timeLeft / MISSILE_DURATION))
          : 0,
      remaining: Math.max(0, this.timeLeft),
    };
  }

  getInstanceCount(): number {
    return this.owned || this.active ? 1 : 0;
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.owned != null) this.owned = mods.owned;
    if (mods.reloadMult != null) this.reloadMult = mods.reloadMult;
    if (mods.damageMult != null) this.damageMult = mods.damageMult;
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
    // Борт пуска: перпендикулярно направлению на цель, поэтому ракеты
    // вылетают то с левого, то с правого борта корабля.
    const dx = target.x - ctx.player.x;
    const dy = target.y - ctx.player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const side = this.port === 0 ? -1 : 1;
    const mx = ctx.player.x - (dy / dist) * side * MISSILE_PORT_OFFSET;
    const my = ctx.player.y + (dx / dist) * side * MISSILE_PORT_OFFSET;

    // Стартовое направление — на цель, плюс инерция корабля.
    ctx.bullets.push({
      x: mx,
      y: my,
      vx: (dx / dist) * MISSILE_SPEED + ctx.player.vx * 0.25,
      vy: (dy / dist) * MISSILE_SPEED + ctx.player.vy * 0.25,
      life: MISSILE_LIFE,
      dmg: MISSILE_DMG * this.damageMult,
      homing: { target, turnRate: MISSILE_TURN_RATE, lockRange: MISSILE_LOCK_RANGE },
      r: this.solidRadius || undefined,
    });

    ctx.onFired(this.id);
  }
}