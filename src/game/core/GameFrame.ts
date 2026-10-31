/**
 * GameFrame — кадровый цикл: игровые системы и презентация.
 *
 * Здесь остаётся только последовательность фаз: debug-ввод, меню/пауза,
 * таймер смерти, engine.run(dt), обновление и отрисовка презентации.
 * Порядок систем задан SystemSchedule, размеры вьюпорта — GameContext.
 */

import type { GameContext } from "./GameContext";
import type { PresentationFrame } from "./PresentationFrame";

export class GameFrame {
  constructor(
    private readonly ctx: GameContext,
    private readonly presentation: PresentationFrame,
  ) {}

  /** Полный кадр: меню или игровой цикл. Вызывается из GameLoop. */
  step(dt: number): void {
    const ctx = this.ctx;

    ctx.handleDebugKeys(dt);

    if (ctx.fsm.is("menu")) {
      this.presentation.updateMenu(dt);
      return;
    }

    if (ctx.paused) {
      this.presentation.renderPaused(dt);
      return;
    }

    // Смерть и анимация обрабатываются до engine.run: в dying/over
    // игровые системы не тикают, чтобы не оставлять «сиротские» пули.
    this.presentation.updateDeath(dt);
    if (!ctx.fsm.is("dying", "over")) {
      ctx.ecs.update(dt);
    }

    this.presentation.update(dt);
    this.presentation.render(dt);
  }
}
