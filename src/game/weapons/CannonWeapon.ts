/**
 * CannonWeapon — основная пушка игрока.
 *
 * Пушка доступна всегда, стреляет по текущему прицелу (автонаведение
 * или ручной прицел). Число стволов складывается из персистентного
 * апгрейда и временного бонуса «доп. стволы».
 */

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
/** Точность стрельбы: 1 — без разброса. */
const CANNON_ACCURACY = 0.98;
/** Дистанция автонаведения пушки. */
export const CANNON_TARGET_RANGE = 420;

export class CannonWeapon implements Weapon {
  readonly id: WeaponId = "cannon";
  readonly meta: WeaponMeta = {
    icon: "weapon-cannon",
    color: "#5ef2ff",
    labelKey: "hud.loadout.cannon",
    order: 0,
  };
  readonly countUpgrade = "guns" as const;
  readonly usesDamageUpgrade = true;
  readonly usesSolidUpgrade = true;

  /** Базовое число стволов (персистентный апгрейд). */
  private baseBarrels = 1;
  /** Урон снаряда (персистентный апгрейд). */
  private damage = CANNON_BULLET_DMG;
  /** Радиус твёрдого снаряда (0 — снаряды бестелесные). */
  private solidRadius = 0;
  /** Остаток перезарядки. */
  private fireCd = 0;

  reset(): void {
    this.baseBarrels = 1;
    this.damage = CANNON_BULLET_DMG;
    this.solidRadius = 0;
    this.fireCd = 0;
  }

  isAvailable(): boolean {
    return true;
  }

  activate(): void {
    // Пушка доступна всегда — отдельного подбора не требуется.
  }

  update(dt: number, ctx: WeaponContext): void {
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (!ctx.aim.firing || ctx.aim.angle === null) return;
    if (this.fireCd > 0) return;
    this.fireCd = this.getReloadTime(ctx);
    this.fire(ctx, ctx.aim.angle);
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
    return Math.min(CANNON_MAX_BARRELS, this.baseBarrels + ctx.bonuses.extraBarrels);
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.damage != null) this.damage = CANNON_BULLET_DMG + mods.damage;
    if (mods.count != null) {
      this.baseBarrels = Math.min(CANNON_MAX_BARRELS, Math.max(1, mods.count));
    }
    if (mods.solidRadius != null) this.solidRadius = mods.solidRadius;
  }

  /** Полная перезарядка пушки при текущем темпе стрельбы. */
  private getReloadTime(ctx: WeaponContext): number {
    return CANNON_FIRE_CD / ctx.bonuses.rateMult;
  }

  /** Выстрел: по одному снаряду из каждого ствола. */
  private fire(ctx: WeaponContext, angle: number): void {
    const barrels = this.getInstanceCount(ctx);
    // Разброс: как у врагов — случайное отклонение угла.
    const spread = (1 - CANNON_ACCURACY) * 0.3;
    const bulletAngle = angle + (Math.random() - 0.5) * 2 * spread;

    for (let i = 0; i < barrels; i++) {
      const offset = CANNON_BARREL_OFFSETS[i] ?? 0;
      ctx.bullets.push({
        x: ctx.player.x + Math.cos(angle) * 14 - Math.sin(angle) * offset,
        y: ctx.player.y + Math.sin(angle) * 14 + Math.cos(angle) * offset,
        vx: Math.cos(bulletAngle) * CANNON_BULLET_SPEED,
        vy: Math.sin(bulletAngle) * CANNON_BULLET_SPEED,
        life: CANNON_BULLET_LIFE,
        dmg: this.damage,
        r: this.solidRadius || undefined,
      });
    }

    ctx.onFired(this.id);
  }
}
