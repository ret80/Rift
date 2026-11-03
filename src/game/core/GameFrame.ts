/**
 * GameFrame — кадровый цикл браузера: меню/пауза, смерть, мир и презентация.
 *
 * Здесь остаётся только последовательность фаз: debug-ввод, меню, пауза,
 * таймер смерти, фиксированные тики мира через `SimulationClock`, обновление
 * и отрисовка презентации. Мир (`GameWorld`) не знает о кадре и rAF.
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

    // Смерть и анимация обрабатываются до тиков мира: в dying/over игровые
    // системы не тикают, чтобы не оставлять «сиротские» пули.
    this.presentation.updateDeath(dt);

    ctx.updateWorldView();
    ctx.clock.advance(dt, (fixedDt) => ctx.world.tick(fixedDt));

    this.presentation.update(dt);
    this.presentation.render(dt);
  }
}
