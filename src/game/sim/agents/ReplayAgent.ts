/**
 * ReplayAgent — воспроизведение записанных намерений.
 *
 * Нужен, чтобы повторить человеческий забег: `PlayerIntent` пишется по тикам,
 * а затем скармливается миру как есть. Запись можно снять с
 * `GameContext.controls` (HumanControls) на каждом тике.
 */

import { emptyPlayerIntent } from "../../core/PlayerControls";
import type { PlayerAgent, PlayerIntent, PlayerView } from "./PlayerAgent";

export class ReplayAgent implements PlayerAgent {
  private index = 0;

  /**
   * @param intents — намерения по тикам; тик `n` берёт `intents[n]`.
   *                  Если запись кончилась, агент стоит на месте.
   */
  constructor(private readonly intents: readonly PlayerIntent[]) {}

  update(_view: PlayerView, _dt: number): PlayerIntent {
    const intent = this.intents[this.index];
    this.index++;
    return intent ? { ...intent } : emptyPlayerIntent();
  }

  reset(): void {
    this.index = 0;
  }

  /** Сколько тиков уже воспроизведено. */
  get tick(): number {
    return this.index;
  }
}
