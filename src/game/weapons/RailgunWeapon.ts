/**
 * RailgunWeapon — рельсотрон игрока.
 *
 * Оружие заряжается 0.8с, пока игрок держит огонь, и выпускает
 * мгновенный пробивающий луч: он проходит сквозь все цели на линии
 * и наносит полный урон каждой из них. Пробитие — главное отличие
 * рельсы от лазера, который останавливается на первой преграде.
 *
 * Альтернативный огонь — веер из трёх коротких лучей: без зарядки,
 * каждый луч пробивает цели, но урон ниже, а перезарядка длиннее.
 */

import { aimAtTarget } from "../aiming/AimSolver";
import { rayCircleEntryDistance } from "./raycast";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponModifiers,
  WeaponSlotState,
} from "./Weapon";
import { WEAPON_CATALOG } from "./WeaponCatalog";

/** Время зарядки выстрела, секунды. */
const RAIL_CHARGE_TIME = 0.8;
/** Урон пробивающего луча. */
const RAIL_DAMAGE = 46;
/** Перезарядка после выстрела, секунды. */
const RAIL_COOLDOWN = 1.05;
/** Дальность луча (запас, если ни одна цель не попала на линию). */
const RAIL_BEAM_RANGE = 1400;
/** Время жизни визуального луча, секунды. */
const RAIL_BEAM_LIFE = 0.22;
/** Отступ ствола от центра корабля. */
const RAIL_MUZZLE_OFFSET = 16;
/** Скорость луча для расчёта упреждения: мгновенный выстрел. */
const RAIL_SHOT_SPEED = 2000;
/** Горизонт упреждения, секунды. */
const RAIL_LEAD_TIME = 0.2;
/** Множитель урона альтернативного веера. */
const RAIL_ALT_DAMAGE = 0.55;
/** Полуугол веера альтернативного огня, радианы. */
const RAIL_ALT_SPREAD = 0.075;
/** Перезарядка альтернативного огня, секунды. */
const RAIL_ALT_COOLDOWN = 2.2;
/** Число лучей в веере альтернативного огня. */
const RAIL_ALT_RAILS = 3;

export class RailgunWeapon implements Weapon {
  readonly id: WeaponId = "railgun";
  readonly meta: WeaponMeta = WEAPON_CATALOG.railgun;
  readonly countUpgrade = null;
  readonly usesPersonalAccuracy = true;
  readonly baseDamage = RAIL_DAMAGE;

  /** Рельсотрон куплен в арсенале. */
  private owned = false;
  /** Накопленный заряд выстрела, секунды. */
  private charge = 0;
  /** Остаток перезарядки основного огня. */
  private cooldown = 0;
  /** Остаток перезарядки альтернативного огня. */
  private altCooldown = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;
  /** Персональная точность из арсенала (null — общий апгрейд). */
  private personalAccuracy: number | null = null;

  reset(): void {
    this.owned = false;
    this.charge = 0;
    this.cooldown = 0;
    this.altCooldown = 0;
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

    this.cooldown = Math.max(0, this.cooldown - dt);
    this.altCooldown = Math.max(0, this.altCooldown - dt);

    // Без огня заряд сбрасывается: рельса не «держит» энергию.
    if (!ctx.aim.firing || ctx.aim.angle === null) {
      this.charge = 0;
      return;
    }

    if (ctx.aim.altFiring) {
      this.charge = 0;
      if (this.altCooldown > 0) return;
      this.altCooldown = RAIL_ALT_COOLDOWN;
      this.fireFan(ctx);
      return;
    }

    if (this.cooldown > 0) {
      this.charge = 0;
      return;
    }

    this.charge = Math.min(RAIL_CHARGE_TIME, this.charge + dt);
    if (this.charge < RAIL_CHARGE_TIME) return;

    this.charge = 0;
    this.cooldown = (RAIL_COOLDOWN * this.reloadMult) / ctx.bonuses.rateMult;
    this.firePiercing(ctx, this.aimAngle(ctx), RAIL_DAMAGE * this.damageMult);
    ctx.onFired(this.id);
  }

  getSlot(ctx: WeaponContext): WeaponSlotState {
    const max = (RAIL_COOLDOWN * this.reloadMult) / ctx.bonuses.rateMult;
    if (this.cooldown > 0) {
      return {
        id: this.id,
        meta: this.meta,
        progress: max > 0 ? 1 - Math.min(1, this.cooldown / max) : 1,
        remaining: this.cooldown,
      };
    }
    return {
      id: this.id,
      meta: this.meta,
      progress: Math.max(0, Math.min(1, this.charge / RAIL_CHARGE_TIME)),
      remaining: Math.max(0, RAIL_CHARGE_TIME - this.charge),
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

  /** Точность рельсы: персональная из арсенала или общий апгрейд. */
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
        bulletSpeed: RAIL_SHOT_SPEED,
        maxFlightTime: RAIL_LEAD_TIME,
      },
      this.getHitChance(ctx),
      target.radius.r,
      ctx.rng,
    );
  }

  /** Пробивающий луч: урон всем целям на линии до самой дальней из них. */
  private firePiercing(ctx: WeaponContext, angle: number, dmg: number): void {
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const muzzleX = ctx.player.x + dx * RAIL_MUZZLE_OFFSET;
    const muzzleY = ctx.player.y + dy * RAIL_MUZZLE_OFFSET;

    let end = 0;
    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = rayCircleEntryDistance(
        muzzleX,
        muzzleY,
        dx,
        dy,
        e.position.x,
        e.position.y,
        e.radius.r,
      );
      if (dist == null) continue;
      // Пробитие: цель не останавливает луч и получает полный урон.
      ctx.damageEnemy(e, dmg);
      if (dist > end) end = dist;
    }

    const length = end > 0 ? end : RAIL_BEAM_RANGE;
    ctx.addBeam({
      x1: muzzleX,
      y1: muzzleY,
      x2: muzzleX + dx * length,
      y2: muzzleY + dy * length,
      life: RAIL_BEAM_LIFE,
      maxLife: RAIL_BEAM_LIFE,
      seed: ctx.rngFx.next() * 100,
      targetId: null,
    });
  }

  /** Альтернативный огонь: веер пробивающих лучей без зарядки. */
  private fireFan(ctx: WeaponContext): void {
    const base = this.aimAngle(ctx);
    const dmg = RAIL_DAMAGE * RAIL_ALT_DAMAGE * this.damageMult;
    for (let i = 0; i < RAIL_ALT_RAILS; i++) {
      const offset = (i - (RAIL_ALT_RAILS - 1) / 2) * RAIL_ALT_SPREAD;
      this.firePiercing(ctx, base + offset, dmg);
    }
    ctx.onFired(this.id);
  }
}

