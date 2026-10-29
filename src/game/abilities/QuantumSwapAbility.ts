/**
 * QuantumSwapAbility — телепорт-подмена.
 *
 * Игрок мгновенно меняется местами с ближайшим врагом в радиусе
 * действия: сам оказывается там, где был враг, а враг — на месте
 * корабля. В точке выхода корабля вспыхивает разрыв, который бьёт
 * по всем врагам рядом.
 *
 * Способность работает без физики: она просто переносит тела, поэтому
 * её контракт — точка выхода и колбэки перемещения/убийства.
 */

import {
  QUANTUM_SWAP_BLAST_DAMAGE,
  QUANTUM_SWAP_BLAST_RADIUS,
  QUANTUM_SWAP_COOLDOWN,
  QUANTUM_SWAP_RANGE,
} from "../balance/player";
import type { EnemyRef } from "../ecs";
import type { Ability, AbilityContext, AbilityId, AbilityMeta, AbilitySlotState } from "./Ability";

/** Цвет вспышки подмены. */
const SWAP_COLOR = "#7cf3ff";

export class QuantumSwapAbility implements Ability {
  readonly id: AbilityId = "quantum_swap";
  readonly meta: AbilityMeta = {
    icon: "ability-quantum-swap",
    color: "#7cf3ff",
    labelKey: "hud.loadout.quantum_swap",
    order: 6,
  };

  /** Способность выдана игроку. */
  private owned = false;
  /** Остаток перезарядки, секунды. */
  private cd = 0;

  reset(): void {
    this.owned = false;
    this.cd = 0;
  }

  grant(): void {
    this.owned = true;
  }

  isAvailable(): boolean {
    return this.owned;
  }

  update(dt: number): void {
    if (this.cd > 0) this.cd = Math.max(0, this.cd - dt);
  }

  activate(ctx: AbilityContext): boolean {
    if (!this.owned || this.cd > 0) return false;

    const target = this.nearestEnemy(ctx);
    if (!target) return false;

    // Куда переносимся мы и куда — враг.
    const targetPos = target.position;
    const targetVel = target.velocity;
    const targetX = targetPos.x;
    const targetY = targetPos.y;
    const playerX = ctx.playerX;
    const playerY = ctx.playerY;

    targetPos.x = playerX;
    targetPos.y = playerY;
    targetVel.vx = 0;
    targetVel.vy = 0;
    ctx.movePlayerTo(targetX, targetY);

    // Разрыв в точке выхода корабля бьёт по врагам рядом.
    ctx.fx.ring(targetX, targetY, 8, 320, 0.35, SWAP_COLOR);
    ctx.fx.burst(targetX, targetY, 18, SWAP_COLOR, 260, 0.4);
    for (const e of ctx.enemies) {
      if (e.marker.dead || e === target) continue;
      const dist = Math.hypot(e.position.x - targetX, e.position.y - targetY);
      if (dist > QUANTUM_SWAP_BLAST_RADIUS + e.radius.r) continue;
      ctx.damageEnemy(e, QUANTUM_SWAP_BLAST_DAMAGE);
    }

    this.cd = QUANTUM_SWAP_COOLDOWN;
    return true;
  }

  getSlot(): AbilitySlotState {
    const ready = this.cd <= 0;
    return {
      id: this.id,
      meta: this.meta,
      progress: ready ? 1 : 1 - this.cd / QUANTUM_SWAP_COOLDOWN,
      remaining: this.cd,
    };
  }

  /** Ближайший живой враг в радиусе действия. */
  private nearestEnemy(ctx: AbilityContext): EnemyRef | null {
    let best: EnemyRef | null = null;
    let bestDist = QUANTUM_SWAP_RANGE;
    for (const e of ctx.enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - ctx.playerX, e.position.y - ctx.playerY);
      if (dist <= bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }
}
