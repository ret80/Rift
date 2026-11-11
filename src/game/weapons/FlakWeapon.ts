/**
 * FlakWeapon — картечница игрока.
 *
 * Стреляет конусом мелкой картечи: каждый осколок — настоящий снаряд
 * с ограниченной дальностью. Конус шире к краям, поэтому картечь
 * сильна вблизи и почти бесполезна на дистанции.
 *
 * Альтернативный огонь — одиночная тяжёлая пуля: узкий, но дальний
 * выстрел по выбранной цели, который добивает то, что прошло сквозь
 * облако картечи.
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
import { WEAPON_CATALOG } from "./WeaponCatalog";

/** Число осколков в конусе. */
const FLAK_PELLETS = 7;
/** Полуугол конуса картечи, радианы. */
const FLAK_CONE = 0.30;
/** Скорость осколка. */
const FLAK_SPEED = 420;
/** Время жизни осколка: небольшая дальность. */
const FLAK_LIFE = 0.45;
/** Урон одного осколка. */
const FLAK_DAMAGE = 9;
/** Перезарядка картечи, секунды. */
const FLAK_COOLDOWN = 0.8;
/** Разброс осколков внутри конуса (ловкость ручного прицела). */
const FLAK_JITTER = 0.03;
/** Урон тяжёлой пули альтернативного огня. */
const FLAK_ALT_DAMAGE = 34;
/** Скорость тяжёлой пули. */
const FLAK_ALT_SPEED = 640;
/** Время жизни тяжёлой пули. */
const FLAK_ALT_LIFE = 0.75;
/** Перезарядка альтернативного огня, секунды. */
const FLAK_ALT_COOLDOWN = 1.0;
/** Отступ ствола от центра корабля. */
const FLAK_MUZZLE_OFFSET = 12;
/** Скорость для расчёта упреждения. */
const FLAK_LEAD_SPEED = 560;
/** Горизонт упреждения, секунды. */
const FLAK_LEAD_TIME = 0.5;

export class FlakWeapon implements Weapon {
  readonly id: WeaponId = "flak";
  readonly meta: WeaponMeta = WEAPON_CATALOG.flak;
  readonly countUpgrade = null;
  readonly usesPersonalAccuracy = true;
  readonly baseDamage = FLAK_DAMAGE * FLAK_PELLETS;

  /** Картечница куплена в арсенале. */
  private owned = false;
  /** Остаток перезарядки картечи. */
  private fireCd = 0;
  /** Остаток перезарядки тяжёлой пули. */
  private altCd = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;
  /** Персональная точность из арсенала (null — общий апгрейд). */
  private personalAccuracy: number | null = null;

  reset(): void {
    this.owned = false;
    this.fireCd = 0;
    this.altCd = 0;
    this.reloadMult = 1;
    this.damageMult = 1;
    this.personalAccuracy = null;
  }

  isAvailable(): boolean {
    return this.owned;
  }

  activate(): void {
    // Арсенальное оружие: пикапом не выдаётся.
  }

  update(dt: number, ctx: WeaponContext): void {
    if (!this.owned) return;

    this.fireCd = Math.max(0, this.fireCd - dt);
    this.altCd = Math.max(0, this.altCd - dt);

    if (!ctx.aim.firing || ctx.aim.angle === null) return;

    if (ctx.aim.altFiring) {
      if (this.altCd > 0) return;
      this.altCd = FLAK_ALT_COOLDOWN;
      this.fireSlug(ctx);
      return;
    }

    if (this.fireCd > 0) return;
    this.fireCd = (FLAK_COOLDOWN * this.reloadMult) / ctx.bonuses.rateMult;
    this.fireCone(ctx);
  }

  getSlot(ctx: WeaponContext): WeaponSlotState {
    const max = (FLAK_COOLDOWN * this.reloadMult) / ctx.bonuses.rateMult;
    return {
      id: this.id,
      meta: this.meta,
      progress: max > 0 ? 1 - Math.min(1, this.fireCd / max) : 1,
      remaining: this.fireCd,
    };
  }

  getInstanceCount(): number {
    return this.owned ? 1 : 0;
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.owned != null) this.owned = mods.owned;
    if (mods.reloadMult != null) this.reloadMult = mods.reloadMult;
    if (mods.damageMult != null) this.damageMult = mods.damageMult;
    if (mods.accuracy != null) this.personalAccuracy = mods.accuracy;
  }

  /** Точность картечи: персональная из арсенала или общий апгрейд. */
  private getHitChance(ctx: WeaponContext): number {
    return this.personalAccuracy ?? ctx.aim.hitChance;
  }

  /** Угол выстрела: с автоцелью — упреждение, иначе ручной прицел. */
  private aimAngle(ctx: WeaponContext): number {
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
        bulletSpeed: FLAK_LEAD_SPEED,
        maxFlightTime: FLAK_LEAD_TIME,
      },
      this.getHitChance(ctx),
      target.radius.r,
      ctx.rng,
    );
  }

  /** Конус картечи: осколки расходятся веером, у каждого — своя судьба. */
  private fireCone(ctx: WeaponContext): void {
    const base = this.aimAngle(ctx);
    const dmg = FLAK_DAMAGE * this.damageMult;
    const step = FLAK_PELLETS > 1 ? (FLAK_CONE * 2) / (FLAK_PELLETS - 1) : 0;

    for (let i = 0; i < FLAK_PELLETS; i++) {
      const coneAngle = base + (i - (FLAK_PELLETS - 1) / 2) * step;
      const angle = coneAngle + (ctx.rng.next() - 0.5) * 2 * FLAK_JITTER;
      const dx = Math.cos(angle);
      const dy = Math.sin(angle);
      ctx.addBullet({
        x: ctx.player.x + dx * FLAK_MUZZLE_OFFSET,
        y: ctx.player.y + dy * FLAK_MUZZLE_OFFSET,
        vx: dx * FLAK_SPEED,
        vy: dy * FLAK_SPEED,
        life: FLAK_LIFE,
        dmg,
      });
    }

    ctx.onFired(this.id);
  }

  /** Альтернативный огонь: одна тяжёлая пуля по выбранной цели. */
  private fireSlug(ctx: WeaponContext): void {
    const angle = this.aimAngle(ctx);
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.addBullet({
      x: ctx.player.x + dx * FLAK_MUZZLE_OFFSET,
      y: ctx.player.y + dy * FLAK_MUZZLE_OFFSET,
      vx: dx * FLAK_ALT_SPEED,
      vy: dy * FLAK_ALT_SPEED,
      life: FLAK_ALT_LIFE,
      dmg: FLAK_ALT_DAMAGE * this.damageMult,
    });
    ctx.onFired(this.id);
  }
}
