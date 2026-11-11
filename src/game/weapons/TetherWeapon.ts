/**
 * TetherWeapon — оружие сцепления игрока.
 *
 * Пока игрок держит огонь, корабль цепляет ближайшего врага и тянет
 * цепь дальше: каждый следующий враг цепляется к предыдущему, если
 * находится рядом с ним. Импульсом раз в четверть секунды цепь
 * наносит урон всем звеньям, ослабевая к концу.
 *
 * Альтернативный огонь — разрыв цепи: импульс по всем врагам вокруг
 * корабля, который сбрасывает сцепление и бьёт заметно сильнее.
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

/** Дальность первого звена цепи. */
const TETHER_RANGE = 380;
/** Дальность, на которой цепляется следующее звено. */
const TETHER_CHAIN_RANGE = 210;
/** Максимальное число звеньев цепи. */
const TETHER_MAX_LINKS = 3;
/** Период импульса цепи, секунды. */
const TETHER_PULSE = 0.25;
/** Урон импульса первому звену. */
const TETHER_PULSE_DAMAGE = 11;
/** Ослабление урона каждым следующим звеном. */
const TETHER_CHAIN_FALLOFF = 0.65;
/** Время жизни визуальной дуги цепи. */
const TETHER_BEAM_LIFE = 0.3;
/** Радиус разрыва цепи. */
const TETHER_ALT_RADIUS = 250;
/** Урон разрыва цепи. */
const TETHER_ALT_DAMAGE = 55;
/** Перезарядка разрыва, секунды. */
const TETHER_ALT_COOLDOWN = 3.5;

export class TetherWeapon implements Weapon {
  readonly id: WeaponId = "tether";
  readonly meta: WeaponMeta = WEAPON_CATALOG.tether;
  readonly countUpgrade = null;
  /** Цепь всегда держится за цель: персональной точности у неё нет. */
  readonly usesPersonalAccuracy = false;
  readonly baseDamage = TETHER_PULSE_DAMAGE;

  /** Оружие куплено в арсенале. */
  private owned = false;
  /** Текущие звенья цепи (пересобираются каждый тик). */
  private links: EnemyRef[] = [];
  /** Остаток до следующего импульса цепи. */
  private pulseT = 0;
  /** Остаток перезарядки разрыва. */
  private altCd = 0;
  /** Персональный множитель урона (арсенал). */
  private damageMult = 1;

  reset(): void {
    this.owned = false;
    this.links = [];
    this.pulseT = 0;
    this.altCd = 0;
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

    this.pulseT = Math.max(0, this.pulseT - dt);
    this.altCd = Math.max(0, this.altCd - dt);

    if (ctx.aim.altFiring) {
      this.links = [];
      if (this.altCd > 0) return;
      this.altCd = TETHER_ALT_COOLDOWN;
      this.rupture(ctx);
      return;
    }

    if (!ctx.aim.firing || ctx.aim.angle === null) {
      this.links = [];
      return;
    }

    this.links = this.buildChain(ctx);
    if (this.links.length === 0 || this.pulseT > 0) return;

    this.pulseT = TETHER_PULSE;
    this.pulse(ctx);
  }

  getSlot(): WeaponSlotState {
    return {
      id: this.id,
      meta: this.meta,
      progress: 1,
      remaining: 0,
    };
  }

  getInstanceCount(): number {
    return this.owned ? 1 : 0;
  }

  applyModifiers(mods: WeaponModifiers): void {
    if (mods.owned != null) this.owned = mods.owned;
    if (mods.damageMult != null) this.damageMult = mods.damageMult;
  }

  /** Собрать цепь: ближайший враг, затем ближайший к нему и так далее. */
  private buildChain(ctx: WeaponContext): EnemyRef[] {
    const chain: EnemyRef[] = [];
    let fromX = ctx.player.x;
    let fromY = ctx.player.y;
    let range = TETHER_RANGE;

    while (chain.length < TETHER_MAX_LINKS) {
      let nearest: EnemyRef | null = null;
      let nearestDist = range;

      for (const e of ctx.enemies) {
        if (e.marker.dead || chain.includes(e)) continue;
        const dist = Math.hypot(e.position.x - fromX, e.position.y - fromY);
        if (dist < nearestDist) {
          nearestDist = dist;
          nearest = e;
        }
      }

      if (!nearest) break;
      chain.push(nearest);
      fromX = nearest.position.x;
      fromY = nearest.position.y;
      range = TETHER_CHAIN_RANGE;
    }

    return chain;
  }

  /** Импульс цепи: урон по звеньям с ослаблением и дуги между ними. */
  private pulse(ctx: WeaponContext): void {
    let fromX = ctx.player.x;
    let fromY = ctx.player.y;
    let dmg = TETHER_PULSE_DAMAGE * this.damageMult;

    for (const enemy of this.links) {
      ctx.damageEnemy(enemy, dmg);
      ctx.addBeam({
        x1: fromX,
        y1: fromY,
        x2: enemy.position.x,
        y2: enemy.position.y,
        life: TETHER_BEAM_LIFE,
        maxLife: TETHER_BEAM_LIFE,
        seed: ctx.rngFx.next() * 100,
        targetId: enemy.marker.ecsId ?? null,
      });
      fromX = enemy.position.x;
      fromY = enemy.position.y;
      dmg *= TETHER_CHAIN_FALLOFF;
    }

    ctx.onFired(this.id);
  }

  /** Разрыв цепи: импульс по всем врагам вокруг корабля. */
  private rupture(ctx: WeaponContext): void {
    const dmg = TETHER_ALT_DAMAGE * this.damageMult;
    let hit = false;

    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - ctx.player.x, e.position.y - ctx.player.y);
      if (dist > TETHER_ALT_RADIUS) continue;
      ctx.damageEnemy(e, dmg);
      hit = true;
      ctx.addBeam({
        x1: ctx.player.x,
        y1: ctx.player.y,
        x2: e.position.x,
        y2: e.position.y,
        life: TETHER_BEAM_LIFE,
        maxLife: TETHER_BEAM_LIFE,
        seed: ctx.rngFx.next() * 100,
        targetId: e.marker.ecsId ?? null,
      });
    }

    if (hit) ctx.onFired(this.id);
  }
}
