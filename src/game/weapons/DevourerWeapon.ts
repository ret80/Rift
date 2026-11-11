/**
 * DevourerWeapon — пожиратель игрока.
 *
 * Пасть корабля съедает вражеские снаряды вблизи корпуса и копит из них
 * заряд. Заряд уходит на самонаводящиеся сгустки: чем больше пуль
 * поглощено, тем больнее выстрел. Без заряда оружие всё равно стреляет,
 * но слабо — пожиратель не бывает бесполезным.
 *
 * Альтернативный огонь — выброс: весь накопленный заряд превращается
 * в кольцевой импульс вокруг корабля.
 */

import type { EnemyBulletRef } from "../ecs";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponModifiers,
  WeaponSlotState,
} from "./Weapon";
import { WEAPON_CATALOG } from "./WeaponCatalog";

/** Радиус пасти: снаряды ближе этого поглощаются. */
const EAT_RADIUS = 130;
/** Предел накопленного заряда. */
const MAX_CHARGE = 12;
/** Урон сгустка без заряда. */
const ORB_BASE_DAMAGE = 10;
/** Прибавка к урону сгустка за каждую потраченную единицу заряда. */
const ORB_CHARGE_DAMAGE = 6;
/** Сколько единиц заряда сгусток может потратить. */
const ORB_MAX_SPENT = 6;
/** Скорость сгустка. */
const ORB_SPEED = 330;
/** Время жизни сгустка. */
const ORB_LIFE = 3;
/** Перезарядка сгустка, секунды. */
const ORB_COOLDOWN = 0.55;
/** Скорость поворота сгустка, рад/с. */
const ORB_TURN_RATE = 2.6;
/** Дистанция захвата цели сгустком. */
const ORB_LOCK_RANGE = 520;
/** Радиус выброса. */
const NOVA_RADIUS = 260;
/** Базовый урон выброса. */
const NOVA_BASE_DAMAGE = 14;
/** Урон выброса за каждую единицу заряда. */
const NOVA_CHARGE_DAMAGE = 7;
/** Минимальный заряд для выброса. */
const NOVA_MIN_CHARGE = 3;
/** Перезарядка выброса, секунды. */
const NOVA_COOLDOWN = 4;
/** Отступ ствола от центра корабля. */
const ORB_MUZZLE_OFFSET = 14;

export class DevourerWeapon implements Weapon {
  readonly id: WeaponId = "devourer";
  readonly meta: WeaponMeta = WEAPON_CATALOG.devourer;
  readonly countUpgrade = null;
  readonly usesPersonalAccuracy = false;
  readonly baseDamage = ORB_BASE_DAMAGE;

  /** Оружие куплено в арсенале. */
  private owned = false;
  /** Накопленный заряд от съеденных снарядов. */
  private charge = 0;
  /** Остаток перезарядки сгустка. */
  private fireCd = 0;
  /** Остаток перезарядки выброса. */
  private altCd = 0;
  /** Персональный множитель перезарядки (арсенал). */
  private reloadMult = 1;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;

  reset(): void {
    this.owned = false;
    this.charge = 0;
    this.fireCd = 0;
    this.altCd = 0;
    this.reloadMult = 1;
    this.damageMult = 1;
  }

  isAvailable(): boolean {
    return this.owned;
  }

  activate(): void {
    // Арсенальное оружие: пикапом не выдаётся.
  }

  update(dt: number, ctx: WeaponContext): void {
    if (!this.owned) return;

    this.absorb(ctx);
    this.fireCd = Math.max(0, this.fireCd - dt);
    this.altCd = Math.max(0, this.altCd - dt);

    if (ctx.aim.altFiring) {
      if (this.altCd > 0 || this.charge < NOVA_MIN_CHARGE) return;
      this.altCd = NOVA_COOLDOWN;
      this.nova(ctx);
      return;
    }

    if (!ctx.aim.firing || ctx.aim.angle === null || this.fireCd > 0) return;

    this.fireCd = (ORB_COOLDOWN * this.reloadMult) / ctx.bonuses.rateMult;
    this.fireOrb(ctx);
  }

  getSlot(): WeaponSlotState {
    return {
      id: this.id,
      meta: this.meta,
      progress: Math.max(0, Math.min(1, this.charge / MAX_CHARGE)),
      remaining: 0,
    };
  }

  getInstanceCount(): number {
    return this.owned ? 1 : 0;
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.owned != null) this.owned = mods.owned;
    if (mods.reloadMult != null) this.reloadMult = mods.reloadMult;
    if (mods.damageMult != null) this.damageMult = mods.damageMult;
  }

  /** Съесть вражеские снаряды вблизи корпуса. */
  private absorb(ctx: WeaponContext): void {
    if (this.charge >= MAX_CHARGE) return;

    const eaten: EnemyBulletRef[] = [];
    for (const bullet of ctx.enemyBullets) {
      const dist = Math.hypot(
        bullet.position.x - ctx.player.x,
        bullet.position.y - ctx.player.y,
      );
      if (dist > EAT_RADIUS) continue;
      eaten.push(bullet);
      if (this.charge + eaten.length >= MAX_CHARGE) break;
    }

    for (const bullet of eaten) ctx.removeEnemyBullet(bullet);
    this.charge = Math.min(MAX_CHARGE, this.charge + eaten.length);
  }

  /** Сгусток: тратит до шести единиц заряда, урон растёт с зарядом. */
  private fireOrb(ctx: WeaponContext): void {
    const spent = Math.min(this.charge, ORB_MAX_SPENT);
    this.charge -= spent;

    const angle = ctx.aim.angle ?? 0;
    const dx = Math.cos(angle);
    const dy = Math.sin(angle);
    ctx.addBullet({
      x: ctx.player.x + dx * ORB_MUZZLE_OFFSET,
      y: ctx.player.y + dy * ORB_MUZZLE_OFFSET,
      vx: dx * ORB_SPEED,
      vy: dy * ORB_SPEED,
      life: ORB_LIFE,
      dmg: (ORB_BASE_DAMAGE + spent * ORB_CHARGE_DAMAGE) * this.damageMult,
      homing: {
        target: ctx.aim.target,
        turnRate: ORB_TURN_RATE,
        lockRange: ORB_LOCK_RANGE,
      },
    });
    ctx.onFired(this.id);
  }

  /** Выброс: кольцевой импульс за весь накопленный заряд. */
  private nova(ctx: WeaponContext): void {
    const spent = this.charge;
    this.charge = 0;
    const dmg = (NOVA_BASE_DAMAGE + spent * NOVA_CHARGE_DAMAGE) * this.damageMult;

    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - ctx.player.x, e.position.y - ctx.player.y);
      if (dist > NOVA_RADIUS) continue;
      ctx.damageEnemy(e, dmg);
    }

    ctx.onFired(this.id);
  }
}
