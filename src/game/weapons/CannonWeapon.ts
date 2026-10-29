/**
 * CannonWeapon — основная пушка игрока.
 *
 * Пушка доступна всегда. Если есть автоцель, орудие берёт упреждение:
 * снаряд летит не в текущую позицию врага, а в точку, где враг будет
 * к моменту подлёта. Точность задаётся апгрейдом арсенала и никогда
 * не бывает стопроцентной — промах остаётся разбросом угла.
 *
 * Число стволов складывается из постоянного слотового апгрейда
 * и временного бонуса «доп. стволы».
 */

import { aimAtTarget } from "../aiming/AimSolver";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponModifiers,
  WeaponSlotState,
} from "./Weapon";

/** Скорость снаряда пушки. */
const CANNON_BULLET_SPEED = 560;
/** Время жизни снаряда пушки. */
const CANNON_BULLET_LIFE = 0.85;
/** Базовый урон снаряда пушки. */
const CANNON_BULLET_DMG = 14;
/** Интервал между выстрелами в секундах. */
const CANNON_FIRE_CD = 0.455;
/** Максимальное число стволов пушки. */
export const CANNON_MAX_BARRELS = 5;
/** Смещения стволов относительно центра корабля. */
export const CANNON_BARREL_OFFSETS = [0, 9, -9, 17, -17];
/** Разброс ручного прицела — цели нет, упреждение применить не к чему. */
const CANNON_MANUAL_SPREAD = 0.02;
/** Дистанция автонаведения пушки. */
const CANNON_TARGET_RANGE = 420;

export class CannonWeapon implements Weapon {
  readonly id: WeaponId = "cannon";
  readonly meta: WeaponMeta = {
    icon: "weapon-cannon",
    color: "#5ef2ff",
    labelKey: "hud.loadout.cannon",
    order: 0,
  };
  readonly countUpgrade = null;
  readonly usesPersonalAccuracy = true;
  readonly baseDamage = CANNON_BULLET_DMG;

  /** Пушка куплена в арсенале (всегда true). */
  private owned = true;
  /** Остаток перезарядки. */
  private fireCd = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;
  /** Персональная точность из арсенала. */
  private personalAccuracy: number | null = null;

  reset(): void {
    this.owned = true;
    this.fireCd = 0;
    this.reloadMult = 1;
    this.damageMult = 1;
    this.personalAccuracy = null;
  }

  isAvailable(): boolean {
    return this.owned;
  }

  activate(): void {
    // Пушка доступна всегда — отдельного подбора не требуется.
  }

  update(dt: number, ctx: WeaponContext): void {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (!ctx.aim.firing || ctx.aim.angle === null) return;
    if (this.fireCd > 0) return;
    this.fireCd = this.getReloadTime(ctx);
    this.fire(ctx);
  }

  getSlot(ctx: WeaponContext): WeaponSlotState {
    const max = this.getReloadTime(ctx);
    return {
      id: this.id,
      meta: this.meta,
      progress: max > 0 ? 1 - Math.min(1, Math.max(0, this.fireCd) / max) : 1,
      remaining: Math.max(0, this.fireCd),
    };
  }

  getInstanceCount(ctx: WeaponContext): number {
    return Math.min(CANNON_MAX_BARRELS, 1 + ctx.bonuses.extraBarrels);
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.owned != null) this.owned = mods.owned;
    if (mods.damageMult != null) this.damageMult = mods.damageMult;
    if (mods.reloadMult != null) this.reloadMult = mods.reloadMult;
    if (mods.accuracy != null) this.personalAccuracy = mods.accuracy;
  }

  /** Полная перезарядка пушки при текущем темпе стрельбы. */
  private getReloadTime(ctx: WeaponContext): number {
    return (CANNON_FIRE_CD * this.reloadMult) / ctx.bonuses.rateMult;
  }

  /** Точность пушки: персональная из арсенала или общий апгрейд. */
  private getHitChance(ctx: WeaponContext): number {
    return this.personalAccuracy ?? ctx.aim.hitChance;
  }

  /**
   * Направление стволов: с автоцелью — упреждающий угол с рассеиванием,
   * без цели — ручной прицел с минимальным разбросом.
   */
  private turretAngle(ctx: WeaponContext): number {
    const target = ctx.aim.target;
    if (!target) return ctx.aim.angle ?? 0;

    return aimAtTarget(
      {
        sx: ctx.player.x,
        sy: ctx.player.y,
        target: {
          x: target.position.x,
          y: target.position.y,
          vx: target.velocity.vx,
          vy: target.velocity.vy,
          r: target.radius.r,
        },
        bulletSpeed: CANNON_BULLET_SPEED,
        maxFlightTime: CANNON_BULLET_LIFE,
      },
      this.getHitChance(ctx),
      target.radius.r
    );
  }

  /** Выстрел: по одному снаряду из каждого ствола, у каждого свой разброс. */
  private fire(ctx: WeaponContext): void {
    const barrels = this.getInstanceCount(ctx);
    const turret = this.turretAngle(ctx);
    // Разброс стволов: при автонаведении он уже внесён упреждающим расчётом.
    const spread = ctx.aim.target ? 0 : CANNON_MANUAL_SPREAD;

    for (let i = 0; i < barrels; i++) {
      const barrelAngle = turret + (Math.random() - 0.5) * 2 * spread;
      const offset = CANNON_BARREL_OFFSETS[i] ?? 0;
      ctx.addBullet({
        x: ctx.player.x + Math.cos(turret) * 14 - Math.sin(turret) * offset,
        y: ctx.player.y + Math.sin(turret) * 14 + Math.cos(turret) * offset,
        vx: Math.cos(barrelAngle) * CANNON_BULLET_SPEED,
        vy: Math.sin(barrelAngle) * CANNON_BULLET_SPEED,
        life: CANNON_BULLET_LIFE,
        dmg: CANNON_BULLET_DMG * this.damageMult,
      });
    }

    ctx.onFired(this.id);
  }
}
