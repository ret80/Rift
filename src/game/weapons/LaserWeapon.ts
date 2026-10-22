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
import type { Enemy } from "../types";
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
/** Протяжённость луча при промахе (до края экрана). */
const LASER_BEAM_LENGTH = 1200;
/** Время работы лазера после подбора, секунды. */
const LASER_DURATION = 30;

/**
 * Пройдёт ли луч (луч из точки с направлением) по кругу цели.
 * Так же, как снаряд пушки, лазер попадает по хитбоксу цели.
 */
function rayHitsCircle(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  hx: number,
  hy: number,
  r: number
): boolean {
  const tx = hx - ox;
  const ty = hy - oy;
  const proj = tx * dx + ty * dy;
  if (proj < 0) return false;
  const perp = Math.abs(tx * dy - ty * dx);
  return perp <= r;
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
  readonly usesDamageUpgrade = false;
  readonly usesSolidUpgrade = false;

  /** Лазер активен. */
  private active = false;
  /** Остаток времени работы лазера, секунды. */
  private timeLeft = 0;
  /** Остаток перезарядки. */
  private fireCd = 0;

  reset(): void {
    this.active = false;
    this.timeLeft = 0;
    this.fireCd = 0;
  }

  isAvailable(): boolean {
    return this.active;
  }

  activate(): void {
    this.active = true;
    this.timeLeft = LASER_DURATION;
    this.fireCd = 0;
  }

  update(dt: number, ctx: WeaponContext): void {
    this.ageBeams(dt, ctx);
    if (!this.active) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.active = false;
      return;
    }

    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.fireCd > 0) return;
    if (!ctx.aim.firing || ctx.aim.angle === null) return;

    const target = this.findFreeTarget(ctx);
    if (!target) return;

    this.fire(ctx, target);
    this.fireCd = LASER_FIRE_CD;
  }

  getSlot(): WeaponSlotState {
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

  applyModifiers(_mods: import("./Weapon").WeaponModifiers): void {
    // Лазер не масштабируется персистентными апгрейдами.
  }

  /** Убрать истёкшие лучи из пула. */
  private ageBeams(dt: number, ctx: WeaponContext): void {
    for (let i = ctx.beams.length - 1; i >= 0; i--) {
      ctx.beams[i].life -= dt;
      if (ctx.beams[i].life <= 0) ctx.beams.splice(i, 1);
    }
  }

  /** Ближайший живой враг, не занятый другим лучом. */
  private findFreeTarget(ctx: WeaponContext): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = LASER_TARGET_RANGE;

    for (const e of ctx.enemies) {
      if (e.dead) continue;
      if (ctx.beams.some((b) => b.target === e)) continue;
      const dist = Math.hypot(e.x - ctx.player.x, e.y - ctx.player.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    return nearest;
  }

  /** Выстрел: упреждающий угол с тем же рассеиванием, что у пушки. */
  private fire(ctx: WeaponContext, target: Enemy): void {
    // Точность как у обычного орудия: упреждение + конус рассеивания.
    const angle = aimAtTarget(
      {
        sx: ctx.player.x,
        sy: ctx.player.y,
        target,
        bulletSpeed: 560,
        maxFlightTime: 0.85,
      },
      ctx.aim.hitChance,
      target.r
    );

    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    const muzzleX = ctx.player.x + dx * LASER_MUZZLE_OFFSET;
    const muzzleY = ctx.player.y + dy * LASER_MUZZLE_OFFSET;

    // Луч мгновенный: как снаряд пушки, он попадает, если линия выстрела
    // прошла по хитбоксу цели. Рассеивание уже внесено в угол.
    const hit = rayHitsCircle(muzzleX, muzzleY, dx, dy, target.x, target.y, target.r);
    if (hit) this.damageEnemy(ctx, target, LASER_DMG);

    const hitDistance = Math.hypot(target.x - muzzleX, target.y - muzzleY);
    const endDist = hit ? Math.min(hitDistance, LASER_BEAM_LENGTH) : LASER_BEAM_LENGTH;

    ctx.beams.push({
      x1: muzzleX,
      y1: muzzleY,
      x2: muzzleX + dx * endDist,
      y2: muzzleY + dy * endDist,
      life: LASER_BEAM_LIFE,
      maxLife: LASER_BEAM_LIFE,
      seed: Math.random() * 100,
      // Не занята ли цель, видно по живым лучам: своя цель — «занята».
      target,
    });

    ctx.onFired(this.id);
  }

  /** Нанести урон цели через единый путь гибели (дроп, счёт, волна). */
  private damageEnemy(ctx: WeaponContext, enemy: Enemy, dmg: number): void {
    enemy.hp -= dmg;
    enemy.flash = 1;
    enemy.hitCd = 0.15;
    if (enemy.hp <= 0) ctx.killEnemy?.(enemy);
  }
}