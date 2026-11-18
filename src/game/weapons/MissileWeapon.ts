/**
 * MissileWeapon — ракетница игрока.
 *
 * Ракетницу можно купить в «АРСЕНАЛЕ» (постоянная) или подобрать
 * пикапом (работает ограниченное время). Ракеты вылетают поочерёдно
 * с левого и правого борта корабля и наносят урон при попадании.
 *
 * Ракета отцепляется от корабля и первые доли секунды летит строго по
 * направлению движения игрока — увернуться от собственного пуска она не
 * может. Только после этой задержки включается самонаведение.
 *
 * Если цель погибла до подлёта, ракета перенаводится на ближайшего
 * живого врага; когда время жизни ракеты истекает, она исчезает
 * независимо от того, попала она в цель или нет.
 */

import type { EnemyRef } from "../ecs";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponModifiers,
  WeaponSlotState,
} from "./Weapon";
import { WEAPON_CATALOG } from "./WeaponCatalog";

/**
 * Скорость ракеты относительно текущего предела скорости игрока:
 * ракета всегда на 20 % быстрее корабля.
 */
const MISSILE_SPEED_MULT = 1.2;
/**
 * Свободный полёт до включения самонаведения, секунды. Всё это время
 * ракета летит строго по курсу игрока и не доворачивает.
 */
const MISSILE_HOMING_DELAY = 0.25;
/** Минимальная скорость игрока, при которой у него есть «направление». */
const MISSILE_LAUNCH_MIN_SPEED = 20;
/** Время жизни ракеты: 3.5с минус 15% запаса хода. */
const MISSILE_LIFE = 3.5 * 0.85;
/** Урон ракеты. */
const MISSILE_DMG = 55;
/** Скорость поворота ракеты, рад/сек. */
const MISSILE_TURN_RATE = 3.0;
/** Интервал между пусками ракет, секунды. */
const MISSILE_LAUNCH_INTERVAL = 1.05;
/** Время работы ракетомёта после подбора, секунды. */
const MISSILE_DURATION = 30;
/** Отступ бортового пускового устройства от центра корабля. */
const MISSILE_PORT_OFFSET = 12;
/** Максимальная дистанция наведения ракеты. */
const MISSILE_LOCK_RANGE = 600;
/** Число ракет в альтернативном залпе. */
const MISSILE_ALT_SALVO = 3;
/** Множитель урона ракеты в залпе. */
const MISSILE_ALT_DAMAGE = 0.6;
/** Перезарядка залпа, секунды. */
const MISSILE_ALT_CD = 1.6;

export class MissileWeapon implements Weapon {
  readonly id: WeaponId = "missile";
  readonly meta: WeaponMeta = WEAPON_CATALOG.missile;
  readonly countUpgrade = null;
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
  /** Остаток перезарядки альтернативного залпа. */
  private altCd = 0;
  /** Борт, из которого вылетает следующая ракета (0 — левый, 1 — правый). */
  private port: 0 | 1 = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;
  /** Шанс критического попадания (арсенал). */
  private critChance = 0;
  /** Множитель критического попадания. */
  private critMult = 1;

  reset(): void {
    this.owned = false;
    this.active = false;
    this.timeLeft = 0;
    this.cooldown = 0;
    this.altCd = 0;
    this.port = 0;
    this.reloadMult = 1;
    this.damageMult = 1;
    this.critChance = 0;
    this.critMult = 1;
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
    this.altCd = Math.max(0, this.altCd - dt);

    // Альтернативный огонь: залп из трёх ракет по одной цели.
    if (ctx.aim.altFiring) {
      if (this.altCd > 0) return;
      const salvoTarget = this.findTarget(ctx.enemies, ctx.player.x, ctx.player.y, ctx.aim.locked);
      // Врагов в радиусе нет — залп уходит в якорь-разлом.
      const salvoAnchor = salvoTarget ? null : this.anchorInRange(ctx);
      if (!salvoTarget && !salvoAnchor) return;
      this.altCd = MISSILE_ALT_CD;
      for (let i = 0; i < MISSILE_ALT_SALVO; i++) {
        this.fire(ctx, salvoTarget, salvoAnchor, MISSILE_ALT_DAMAGE, false);
        this.port = this.port === 0 ? 1 : 0;
      }
      ctx.onFired(this.id);
      return;
    }

    if (this.cooldown > 0) return;

    const target = this.findTarget(ctx.enemies, ctx.player.x, ctx.player.y, ctx.aim.locked);
    // Цель волны — якорь: ракета летит по курсу и наводится на его точку.
    const anchor = target ? null : this.anchorInRange(ctx);
    if (!target && !anchor) return;

    this.fire(ctx, target, anchor);
    this.port = this.port === 0 ? 1 : 0;
    this.cooldown = (MISSILE_LAUNCH_INTERVAL * this.reloadMult) / ctx.bonuses.rateMult;
  }

  getSlot(ctx: WeaponContext): WeaponSlotState {
    // Купленная ракетница бессрочная: кольцо показывает перезарядку.
    if (this.owned) {
      const max = (MISSILE_LAUNCH_INTERVAL * this.reloadMult) / ctx.bonuses.rateMult;
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
    if (mods.critChance != null) this.critChance = mods.critChance;
    if (mods.critMult != null) this.critMult = mods.critMult;
  }

  /** Якорь-разлом в пределах дистанции наведения (иначе ракета не долетит). */
  private anchorInRange(ctx: WeaponContext): { x: number; y: number } | null {
    const anchor = ctx.aim.anchor;
    if (!anchor) return null;
    const dist = Math.hypot(anchor.x - ctx.player.x, anchor.y - ctx.player.y);
    return dist <= MISSILE_LOCK_RANGE ? anchor : null;
  }

  /** Ближайший живой враг в пределах дистанции наведения. */
  private findTarget(
    enemies: readonly EnemyRef[],
    fromX: number,
    fromY: number,
    locked: EnemyRef | null = null,
  ): EnemyRef | null {
    // Взятая в лок цель важнее ближайшей: игрок уже выбрал, куда бить.
    if (
      locked &&
      !locked.marker.dead &&
      Math.hypot(locked.position.x - fromX, locked.position.y - fromY) <= MISSILE_LOCK_RANGE
    ) {
      return locked;
    }

    let nearest: EnemyRef | null = null;
    let nearestDist = Infinity;

    for (const e of enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - fromX, e.position.y - fromY);
      // Ограничим дистанцию наведения — ракета не должна брать слишком далёкие цели
      if (dist > MISSILE_LOCK_RANGE) continue;
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    return nearest;
  }

  /** Пул самонаводящейся ракеты. */
  private fire(
    ctx: WeaponContext,
    target: EnemyRef | null,
    anchor: { x: number; y: number } | null,
    damageMult = 1,
    notify = true,
  ): void {
    // Ракета отцепляется от корабля и первый отрезок идёт по его курсу:
    // доворачивать она начнёт только после задержки самонаведения.
    const angle = this.launchAngle(ctx);
    const speed = Math.max(1, ctx.player.maxSpeed) * MISSILE_SPEED_MULT;

    // Борт пуска: поперёк курса, поэтому ракеты вылетают то слева, то справа.
    const side = this.port === 0 ? -1 : 1;
    const mx = ctx.player.x - Math.sin(angle) * side * MISSILE_PORT_OFFSET;
    const my = ctx.player.y + Math.cos(angle) * side * MISSILE_PORT_OFFSET;

    ctx.addBullet({
      x: mx,
      y: my,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life: MISSILE_LIFE,
      dmg: MISSILE_DMG * this.damageMult * damageMult,
      crit: { chance: this.critChance, mult: this.critMult },
      homing: target
        ? {
            target,
            turnRate: MISSILE_TURN_RATE,
            lockRange: MISSILE_LOCK_RANGE,
            delay: MISSILE_HOMING_DELAY,
          }
        : {
            target: null,
            turnRate: MISSILE_TURN_RATE,
            lockRange: 0,
            delay: MISSILE_HOMING_DELAY,
            anchor: anchor ?? undefined,
          },
    });

    if (notify) ctx.onFired(this.id);
  }

  /**
   * Направление пуска — строго курс корабля.
   *
   * Направление есть всегда: при движении это вектор скорости, на месте —
   * куда повёрнут нос. Поэтому даже неподвижный игрок выпускает ракету по
   * курсу, а не сразу в сторону цели; наведение включается после задержки.
   */
  private launchAngle(ctx: WeaponContext): number {
    const speed = Math.hypot(ctx.player.vx, ctx.player.vy);
    if (speed > MISSILE_LAUNCH_MIN_SPEED) {
      return Math.atan2(ctx.player.vy, ctx.player.vx);
    }
    return ctx.player.angle;
  }
}