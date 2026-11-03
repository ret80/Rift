/**
 * PresentationFrame — презентационная часть кадра.
 *
 * Отделяет эффекты, меню-сцену и отрисовку от игровых систем. Пояс
 * астероидов обновляется в `GameWorld.tick`, поэтому здесь остаются только
 * частицы/тряска, камера и рендер. Размеры вьюпорта берутся из GameContext.
 */

import type { GameContext } from "./GameContext";

export class PresentationFrame {
  constructor(private readonly ctx: GameContext) {}

  /** Кадр меню: анимация сцены без игровых систем. */
  updateMenu(dt: number): void {
    const ctx = this.ctx;
    ctx.menuScene.update(dt);
    ctx.fx.update(dt, dt);
    ctx.menuScene.render();
  }

  /** Пауза: отрисовать последнее состояние без обновления мира. */
  renderPaused(dt: number): void {
    this.ctx.render.renderScene(dt, this.ctx.buildWorld());
  }

  /** Таймер смерти до тиков мира: переход dying → over. */
  updateDeath(dt: number): void {
    const ctx = this.ctx;
    if (ctx.fsm.is("dying") && ctx.deathSystem.update(dt)) {
      ctx.fsm.fire("death_anim_done");
    }
  }

  /** Эффекты после тиков мира. Пояс астероидов живёт в мире. */
  update(dt: number): void {
    this.ctx.fx.update(dt, dt);
  }

  /** Отрисовка сцены, debug-слоя и отправка HUD. */
  render(dt: number): void {
    const ctx = this.ctx;
    ctx.render.renderScene(dt, ctx.buildWorld());
    ctx.render.renderDebug();
    ctx.render.updateHud();
  }
}
