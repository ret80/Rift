/**
 * GameStart — жизненный цикл забега на стороне хоста.
 *
 * Вся игровая работа (сброс мира, апгрейды, отсчёт) — в `GameWorld.startRun()`.
 * Здесь остаётся только презентационный хвост: время цикла, меню-сцена,
 * музыка и физическое состояние хоста.
 */

import type { GameContext } from "./GameContext";

export class GameStart {
  constructor(private readonly ctx: GameContext) {}

  /** Начать новый забег (переход FSM выполняется до вызова). */
  startRun(): void {
    const ctx = this.ctx;
    ctx.loopResetTime();
    ctx.clock.reset();
    ctx.world.startRun();
  }

  /** Вернуться в меню: очистить забег и показать меню-сцену. */
  toMenu(): void {
    const ctx = this.ctx;
    if (ctx.fsm.is("menu")) return;
    ctx.fsm.fire("to_menu");
    ctx.setPaused(false);
    ctx.audio.setCombat(false);
    ctx.hooks.onPause(false);
    ctx.menuScene.reset();
    ctx.world.reset();
  }
}
