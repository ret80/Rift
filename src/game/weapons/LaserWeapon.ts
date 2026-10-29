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
import type { EnemyRef } from "../ecs";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponSlotState,
} from "./Weapon";

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

/** Расстояние до точки входа луча в круг (null — луч не попадает в круг). */
function rayCircleEntryDistance(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  hx: number,
  hy: number,
  r: number
): number | null {
  const fx = ox - hx;
  const fy = oy - hy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  // Круг цели впереди, но источник уже внутри него — стартуем сразу.
  return c <= 0 ? 0 : null;
}

/** Расстояние до пересечения луча с окружностью (null — не пересекает). */
function rayCircleEntryDistanceZone(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  cx: number,
  cy: number,
  r: number
): number | null {
  const fx = ox - cx;
  const fy = oy - cy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : -b + Math.sqrt(disc);
}

export class LaserWeapon implements Weapon {
  readonly id: WeaponId = "laser";
  readonly meta: WeaponMeta = {
    icon: "weapon-laser",
    color: "#ff4d6d",
    labelKey: "hud.loadout.laser",
    order: 4,
  };
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
      if (e.marker.ecsId !== null && ctx.beams.some((b) => b.targetId === e.marker.ecsId)) continue;
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
      target.radius.r
    );

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const muzzleX = ctx.player.x + dx * LASER_MUZZLE_OFFSET;
    const muzzleY = ctx.player.y + dy * LASER_MUZZLE_OFFSET;

    // Ограничитель длины луча: край игровой зоны, иначе максимальный запас.
    let maxDist = LASER_BEAM_LENGTH;
    const zone = ctx.zone;
    if (zone) {
      const zoneDist = rayCircleEntryDistanceZone(
        muzzleX, muzzleY, dx, dy, zone.x, zone.y, zone.radius
      );
      if (zoneDist != null) maxDist = Math.min(maxDist, zoneDist);
    }

    // Луч останавливается на ближайшем враге, через которого проходит.
    let hitEnemy: EnemyRef | null = null;
    let hitDist = maxDist;
    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = rayCircleEntryDistance(muzzleX, muzzleY, dx, dy, e.position.x, e.position.y, e.radius.r);
      if (dist == null || dist > hitDist) continue;
      hitDist = dist;
      hitEnemy = e;
    }

    if (hitEnemy) this.damageEnemy(ctx, hitEnemy, LASER_DMG * this.damageMult);

    ctx.addBeam({
      x1: muzzleX,
      y1: muzzleY,
      x2: muzzleX + dx * hitDist,
      y2: muzzleY + dy * hitDist,
      life: LASER_BEAM_LIFE,
      maxLife: LASER_BEAM_LIFE,
      seed: Math.random() * 100,
      // Не занята ли цель, видно по живым лучам: своя цель — «занята».
      targetId: target.marker.ecsId ?? null,
    });

    ctx.onFired(this.id);
  }

  /** Нанести урон цели через единый путь гибели (дроп, счёт, волна). */
  private damageEnemy(ctx: WeaponContext, enemy: EnemyRef, dmg: number): void {
    ctx.damageEnemy?.(enemy, dmg);
  }
}