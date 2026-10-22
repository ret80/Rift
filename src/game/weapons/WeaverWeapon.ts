/**
 * WeaverWeapon — ткань пространства.
 *
 * Корабль оставляет за собой нити. Враг, пересекающий нить, получает
 * урон по времени и замедляется. Нити — это прямой способ управлять
 * ареной: игрок «рисует» ловушки и заставляет врагов идти по ним.
 *
 * Нити живут в общем пуле (ctx.weaves): их заводит это оружие,
 * а урон и замедление применяет CollisionSystem.
 */

import {
  WEAVER_DURATION,
  WEAVER_MAX_THREADS,
  WEAVER_SEGMENT_LENGTH,
  WEAVER_THREAD_LIFE,
} from "../balance/player";
import type {
  Weapon,
  WeaponContext,
  WeaponId,
  WeaponMeta,
  WeaponModifiers,
  WeaponSlotState,
} from "./Weapon";

export class WeaverWeapon implements Weapon {
  readonly id: WeaponId = "weaver";
  readonly meta: WeaponMeta = {
    icon: "weapon-weaver",
    color: "#c06bff",
    labelKey: "hud.loadout.weaver",
    order: 3,
  };
  readonly countUpgrade = null;
  readonly usesDamageUpgrade = false;
  readonly usesSolidUpgrade = false;

  /** Ткацкое оружие активно. */
  private active = false;
  /** Остаток времени работы, секунды. */
  private timeLeft = 0;
  /** Конец последней выложенной нити — от него тянется следующая. */
  private anchorX = 0;
  private anchorY = 0;

  reset(): void {
    this.active = false;
    this.timeLeft = 0;
    this.anchorX = 0;
    this.anchorY = 0;
  }

  isAvailable(): boolean {
    return this.active;
  }

  activate(ctx: WeaponContext): void {
    this.active = true;
    this.timeLeft = WEAVER_DURATION;
    this.anchorX = ctx.player.x;
    this.anchorY = ctx.player.y;
  }

  update(dt: number, ctx: WeaponContext): void {
    this.ageThreads(dt, ctx);
    if (!this.active) return;

    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.active = false;
      return;
    }

    this.layThreads(ctx);
  }

  getSlot(): WeaponSlotState {
    return {
      id: this.id,
      meta: this.meta,
      progress: WEAVER_DURATION > 0 ? this.timeLeft / WEAVER_DURATION : 0,
      remaining: this.timeLeft,
    };
  }

  getInstanceCount(): number {
    return this.active ? 1 : 0;
  }

  applyModifiers(_mods: WeaponModifiers): void {
    // Ткань пространства не масштабируется персистентными апгрейдами.
  }

  /** Состарить нити и убрать истёкшие. */
  private ageThreads(dt: number, ctx: WeaponContext): void {
    for (let i = ctx.weaves.length - 1; i >= 0; i--) {
      const w = ctx.weaves[i];
      w.life -= dt;
      if (w.life <= 0) ctx.weaves.splice(i, 1);
    }
  }

  /** Выложить нити по пути корабля. */
  private layThreads(ctx: WeaponContext): void {
    let dx = ctx.player.x - this.anchorX;
    let dy = ctx.player.y - this.anchorY;
    let dist = Math.hypot(dx, dy);

    while (dist >= WEAVER_SEGMENT_LENGTH) {
      const ux = dx / dist;
      const uy = dy / dist;
      const nx = this.anchorX + ux * WEAVER_SEGMENT_LENGTH;
      const ny = this.anchorY + uy * WEAVER_SEGMENT_LENGTH;
      this.pushThread(ctx, this.anchorX, this.anchorY, nx, ny);
      this.anchorX = nx;
      this.anchorY = ny;
      dx = ctx.player.x - this.anchorX;
      dy = ctx.player.y - this.anchorY;
      dist = Math.hypot(dx, dy);
    }
  }

  /** Добавить нить в пул, вытеснив самую старую при переполнении. */
  private pushThread(
    ctx: WeaponContext,
    x1: number,
    y1: number,
    x2: number,
    y2: number
  ): void {
    while (ctx.weaves.length >= WEAVER_MAX_THREADS) {
      ctx.weaves.shift();
    }
    ctx.weaves.push({
      x1, y1, x2, y2,
      life: WEAVER_THREAD_LIFE,
      maxLife: WEAVER_THREAD_LIFE,
    });
  }
}
