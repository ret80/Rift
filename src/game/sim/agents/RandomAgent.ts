/**
 * RandomAgent — seeded случайный пилот.
 *
 * Baseline для сравнения «умных» агентов: если EvadeAgent не выживает лучше
 * случайного, значит тактика не работает. Использует только `rngAgent`,
 * поэтому решения не сдвигают боевые броски.
 */

import {
  AbstractPlayerAgent,
  arenaCenter,
  normalize,
  type AgentParams,
  type PlayerView,
  type Vec2,
} from "./PlayerAgent";
import type { Rng } from "../../core/rng";

export interface RandomAgentOptions extends Partial<AgentParams> {
  /** Шанс сменить направление на каждом решении. */
  changeChance?: number;
}

export class RandomAgent extends AbstractPlayerAgent {
  private readonly changeChance: number;
  private dirX = 0;
  private dirY = 0;

  constructor(options: RandomAgentOptions, rng: Rng) {
    super(options, rng);
    this.changeChance = options.changeChance ?? 0.35;
  }

  protected onReset(): void {
    this.dirX = 0;
    this.dirY = 0;
  }

  protected desiredMove(view: PlayerView): Vec2 {
    const noDirection = Math.hypot(this.dirX, this.dirY) < 1e-3;
    if (noDirection || this.rng.next() < this.changeChance) {
      const angle = this.rng.range(0, Math.PI * 2);
      this.dirX = Math.cos(angle);
      this.dirY = Math.sin(angle);
    }

    // Мягкая тяга к центру, чтобы агент не улетал из зоны навсегда.
    const arena = arenaCenter(view);
    const toCenter = normalize(arena.x - view.player.x, arena.y - view.player.y);
    return normalize(this.dirX + toCenter.x * 0.35, this.dirY + toCenter.y * 0.35);
  }
}
