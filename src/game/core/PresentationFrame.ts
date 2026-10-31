/**
 * PresentationFrame — презентационная часть кадра.
 *
 * Отделяет обновление эффектов, астероидного пояса и отрисовку от
 * игровых систем. GameFrame вызывает engine.run(dt) и этот слой; здесь
 * нет `window` — размеры вьюпорта берутся из GameContext.viewport.
 */

import type { AsteroidEnv } from "../asteroids";
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

  /** Таймер смерти до engine.run: переход dying → over. */
  updateDeath(dt: number): void {
    const ctx = this.ctx;
    if (ctx.fsm.is("dying") && ctx.deathSystem.update(dt)) {
      ctx.fsm.fire("death_anim_done");
    }
  }

  /** Эффекты и астероидный пояс после engine.run. */
  update(dt: number): void {
    const ctx = this.ctx;
    ctx.fx.update(dt, dt);
    ctx.asteroidField.update(dt, this.asteroidEnv());
  }

  /** Отрисовка сцены, debug-слоя и отправка HUD. */
  render(dt: number): void {
    const ctx = this.ctx;
    ctx.render.renderScene(dt, ctx.buildWorld());
    ctx.render.renderDebug();
    ctx.render.updateHud();
  }

  /** Окружение пояса астероидов из состояния кадра. */
  private asteroidEnv(): AsteroidEnv {
    const ctx = this.ctx;
    const camera = ctx.cameraSystem.getPosition();
    const zone = ctx.waveOrchestrator.zoneState;
    return {
      camX: camera.x,
      camY: camera.y,
      viewW: ctx.viewport.width,
      viewH: ctx.viewport.height,
      zone: zone.active ? { x: zone.x, y: zone.y, r: zone.radius } : null,
      physicsIntegrates: !ctx.physics.integratesPositions,
      physicsResolves: ctx.physics.resolvesVelocity,
    };
  }
}
