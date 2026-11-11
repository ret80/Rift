/**
 * LaserWeapon — лазер игрока.
 *
 * Лазер бьёт мгновенным лучом из точки корабля в ближайшую свободную
 * цель. Точность стрельбы та же, что у обычного орудия: луч использует
 * тот же упреждающий расчёт с конусом рассеивания (aimAtTarget), что
 * и пушка. Промах остаётся физичным — луч реально уходит в сторону.
 *
 * Луч живёт визуально (ctx.beams), урон наносится в момент зажигания:
 * если луч с рассеянным углом прошёл по цели — цель получает урон.
 */
import { aimAtTarget } from "../aiming/AimSolver";
import { rayCircleEntryDistance } from "./raycast";
import type { EnemyRef } from "../ecs";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponSlotState,
} from "./Weapon";
import { WEAPON_CATALOG } from "./WeaponCatalog";

/** Базовый урон лазера. */
const LASER_DMG = 20;
/** Интервал между выстрелами в секундах. */
const LASER_FIRE_CD = 0.7;
/** Время жизни визуального луча, секунды. */
const LASER_BEAM_LIFE = 0.12;
/** Дистанция наведения лазера — как у пушки. */
const LASER_TARGET_RANGE = 420;
/** Отступ ствола от центра корабля в сторону выстрела. */
const LASER_MUZZLE_OFFSET = 14;
/** Протяжённость луча при промахе (запас, если зона не задана). */
const LASER_BEAM_LENGTH = 1200;
/** Время работы лазера после подбора, секунды. */
const LASER_DURATION = 30;
/** Полуугол широкого луча альтернативного огня, радианы. */
const LASER_ALT_SPREAD = 0.22;
/** Дальность широкого луча альтернативного огня. */
const LASER_ALT_RANGE = 520;
/** Множитель урона широкого луча. */
const LASER_ALT_DAMAGE = 0.7;
/** Перезарядка широкого луча, секунды. */
const LASER_ALT_CD = 1.3;

export class LaserWeapon implements Weapon {
  readonly id: WeaponId = "laser";
  readonly meta: WeaponMeta = WEAPON_CATALOG.laser;
  readonly countUpgrade = null;
  readonly usesPersonalAccuracy = true;
  readonly baseDamage = LASER_DMG;

  /** Лазер куплен в арсенале (постоянно доступен). */
  private owned = false;
  /** Лазер активен. */
  private active = false;
  /** Остаток времени работы лазера, секунды. */
  private timeLeft = 0;
  /** Остаток перезарядки. */
  private fireCd = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;
  /** Персональная точность из арсенала (null — общий апгрейд). */
  private personalAccuracy: number | null = null;

  reset(): void {
    this.owned = false;
    this.active = false;
    this.timeLeft = 0;
    this.fireCd = 0;
    this.reloadMult = 1;
    this.damageMult = 1;
    this.personalAccuracy = null;
  }

  isAvailable(): boolean {
    return this.owned || this.active;
  }

  activate(): void {
    this.active = true;
    this.timeLeft = LASER_DURATION;
    this.fireCd = 0;
  }

  update(dt: number, ctx: WeaponContext): void {
    if (!this.active && !this.owned) return;

    // Забег по времени: лазер из пикапа ограничен, купленный — постоянный.
    if (this.active && !this.owned) {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        this.active = false;
        return;
      }
    } else {
      this.timeLeft = LASER_DURATION;
    }

    this.fireCd = Math.max(0, this.fireCd - dt);

    // Альтернативный огонь: широкий луч по конусу, а не по одной цели.
    if (ctx.aim.altFiring) {
      if (this.fireCd > 0 || ctx.aim.angle === null) return;
      this.fireSweep(ctx);
      this.fireCd = (LASER_ALT_CD * this.reloadMult) / ctx.bonuses.rateMult;
      return;
    }

    if (this.fireCd > 0) return;
    if (!ctx.aim.firing || ctx.aim.angle === null) return;

    const target = this.findFreeTarget(ctx);
    if (!target) return;

    this.fire(ctx, target);
    this.fireCd = (LASER_FIRE_CD * this.reloadMult) / ctx.bonuses.rateMult;
  }

  getSlot(ctx: WeaponContext): WeaponSlotState {
    // Купленный лазер бессрочный: кольцо показывает перезарядку, как у пушки.
    if (this.owned) {
      const max = (LASER_FIRE_CD * this.reloadMult) / ctx.bonuses.rateMult;
      return {
        id: this.id,
        meta: this.meta,
        progress: max > 0 ? 1 - Math.min(1, Math.max(0, this.fireCd) / max) : 1,
        remaining: Math.max(0, this.fireCd),
      };
    }
    return {
      id: this.id,
      meta: this.meta,
      progress:
        LASER_DURATION > 0
          ? Math.max(0, Math.min(1, this.timeLeft / LASER_DURATION))
          : 0,
      remaining: Math.max(0, this.timeLeft),
    };
  }

  getInstanceCount(): number {
    return this.active ? 1 : 0;
  }

  applyModifiers(mods: import("./Weapon").WeaponModifiers): void {
    if (mods.owned != null) this.owned = mods.owned;
    if (mods.reloadMult != null) this.reloadMult = mods.reloadMult;
    if (mods.damageMult != null) this.damageMult = mods.damageMult;
    if (mods.accuracy != null) this.personalAccuracy = mods.accuracy;
  }

  /** Ближайший живой враг, не занятый другим лучом. */
  private findFreeTarget(ctx: WeaponContext): EnemyRef | null {
    let nearest: EnemyRef | null = null;
    let nearestDist = LASER_TARGET_RANGE;

    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      if (e.marker.ecsId !== null && ctx.beams.some((b) => b.beam.targetId === e.marker.ecsId)) continue;
      const dist = Math.hypot(e.position.x - ctx.player.x, e.position.y - ctx.player.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    return nearest;
  }

  /** Точность лазера: персональная из арсенала или общий апгрейд. */
  private getHitChance(ctx: WeaponContext): number {
    return this.personalAccuracy ?? ctx.aim.hitChance;
  }

  /** Выстрел: упреждающий угол, луч обрывается на первой преграде. */
  private fire(ctx: WeaponContext, target: EnemyRef): void {
    // Точность как у обычного орудия: упреждение + конус рассеивания.
    const aimTarget = {
      x: target.position.x,
      y: target.position.y,
      vx: target.velocity.vx,
      vy: target.velocity.vy,
      r: target.radius.r,
    };
    const angle = aimAtTarget(
      {
        sx: ctx.player.x,
        sy: ctx.player.y,
        target: aimTarget,
        bulletSpeed: 560,
        maxFlightTime: 0.85,
      },
      this.getHitChance(ctx),
      target.radius.r,
      ctx.rng,
    );

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const muzzleX = ctx.player.x + dx * LASER_MUZZLE_OFFSET;
    const muzzleY = ctx.player.y + dy * LASER_MUZZLE_OFFSET;

    // Луч останавливается на ближайшем враге, через которого проходит,
    // либо на максимальном запасе длины (зона его больше не обрезает).
    const maxDist = LASER_BEAM_LENGTH;
    let hitEnemy: EnemyRef | null = null;
    let hitDist = maxDist;
    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = rayCircleEntryDistance(muzzleX, muzzleY, dx, dy, e.position.x, e.position.y, e.radius.r);
      if (dist == null || dist > hitDist) continue;
      hitDist = dist;
      hitEnemy = e;
    }

    if (hitEnemy) ctx.damageEnemy(hitEnemy, LASER_DMG * this.damageMult);

    ctx.addBeam({
      x1: muzzleX,
      y1: muzzleY,
      x2: muzzleX + dx * hitDist,
      y2: muzzleY + dy * hitDist,
      life: LASER_BEAM_LIFE,
      maxLife: LASER_BEAM_LIFE,
      seed: ctx.rngFx.next() * 100,
      // Не занята ли цель, видно по живым лучам: своя цель — «занята».
      targetId: target.marker.ecsId ?? null,
    });

    ctx.onFired(this.id);
  }

  /** Альтернативный огонь: широкий луч бьёт всех врагов в конусе. */
  private fireSweep(ctx: WeaponContext): void {
    const angle = ctx.aim.angle ?? 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const muzzleX = ctx.player.x + dx * LASER_MUZZLE_OFFSET;
    const muzzleY = ctx.player.y + dy * LASER_MUZZLE_OFFSET;
    const dmg = LASER_DMG * LASER_ALT_DAMAGE * this.damageMult;

    let end = 0;
    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - muzzleX, e.position.y - muzzleY);
      if (dist > LASER_ALT_RANGE) continue;
      const toEnemy = Math.atan2(e.position.y - muzzleY, e.position.x - muzzleX);
      const diff = Math.atan2(Math.sin(toEnemy - angle), Math.cos(toEnemy - angle));
      if (Math.abs(diff) > LASER_ALT_SPREAD) continue;
      ctx.damageEnemy(e, dmg);
      if (dist > end) end = dist;
    }

    const length = end > 0 ? end : LASER_BEAM_LENGTH;
    ctx.addBeam({
      x1: muzzleX,
      y1: muzzleY,
      x2: muzzleX + dx * length,
      y2: muzzleY + dy * length,
      life: LASER_BEAM_LIFE,
      maxLife: LASER_BEAM_LIFE,
      seed: ctx.rngFx.next() * 100,
      targetId: null,
    });

    ctx.onFired(this.id);
  }
}