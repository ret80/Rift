/**
 * PresentationFrame — презентационная часть кадра.
 *
 * Отделяет эффекты, меню-сцену и отрисовку от игровых систем. Пояс
 * астероидов обновляется в `GameWorld.tick`, поэтому здесь остаются только
 * частицы/тряска, камера и рендер. Размеры вьюпорта берутся из GameContext.
 */

import type { GameContext } from "./GameContext";

/** Период отправки HUD-снимка, секунды: тот же, что у публикации HudStore. */
const HUD_PERIOD = 1 / 15;

export class PresentationFrame {
  /** Накопитель времени до следующего HUD-снимка. */
  private hudAccum = 0;

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

  /**
   * Отрисовка сцены, debug-слоя и отправка HUD.
   *
   * HUD-снимок собирается с частотой публикации HudStore: строить его на
   * каждом кадре значило бы выделять объекты, которые никто не отрисует.
   */
  render(dt: number): void {
    const ctx = this.ctx;
    ctx.render.renderScene(dt, ctx.buildWorld());
    ctx.render.renderDebug();
    this.hudAccum += dt;
    if (this.hudAccum >= HUD_PERIOD) {
      this.hudAccum = 0;
      ctx.render.updateHud();
    }
  }
}
