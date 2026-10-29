/**
 * GameFrame — кадровый цикл: порядок обновления систем.
 * Здесь же строится единое мировое сечение (WorldFrame), которое
 * читают системы, рендер и HUD. Порядок вызовов зафиксирован и
 * определяет поведение (зона, волна, коллизии, HUD).
 */

import type { WorldFrame } from "./WorldFrame";
import type { GameContext } from "./GameContext";
import type { GameRender } from "./GameRender";

export class GameFrame {
  constructor(
    private readonly ctx: GameContext,
    private readonly render: GameRender,
  ) {}

  /** Полный кадр: меню или игровой цикл. Вызывается из GameLoop. */
  step(dt: number): void {
    const ctx = this.ctx;
    const fsm = ctx.fsm;

    ctx.handleDebugKeys(dt);

    if (fsm.is("menu")) {
      this.render.updateMenu(dt);
      return;
    }

    if (ctx.paused) {
      this.render.renderScene(dt);
      return;
    }

    /* Update all systems in order */
    // Весь игровой апдейт идёт внутри engine.run(dt) (ctx.ecs.update(dt)) по возрастанию
    // priority: scoring(-20) → bonus(-15) → shield(-12) → countdown(-10) → ability(-8) →
    // player(-1) → entities(0..4) → weapons(5) → physics(6) → collisions(7) → spawn(8) →
    // waveFlow(9) → zone(10) → zoneClamp(11) → loadout(12). Ниже — только презентация.

    // Handle dying → over transition
    if (fsm.is("dying")) {
      if (ctx.deathSystem.update(dt)) {
        fsm.fire("death_anim_done");
      }
    }

    // Stop enemies and bullets during dying/over (prevent orphan bullets)
    const isDead = fsm.is("dying", "over");
    if (!isDead) {
      ctx.ecs.update(dt);
    }

    // Спавн/волна/зона — ECS-системы (priority 8..11) внутри engine.run(dt) выше;
    // здесь вручную не вызываются.
    ctx.fx.update(dt, dt); // Обновляем частицы и тряску экрана

    // Астероиды — презентация поверх ECS (вне engine.run, путь B).
    const cp = ctx.cameraSystem.getPosition();
    ctx.asteroidField.update(dt, {
      camX: cp.x,
      camY: cp.y,
      viewW: window.innerWidth,
      viewH: window.innerHeight,
      zone: ctx.waveOrchestrator.zoneState.active
        ? {
            x: ctx.waveOrchestrator.zoneState.x,
            y: ctx.waveOrchestrator.zoneState.y,
            r: ctx.waveOrchestrator.zoneState.radius,
          }
        : null,
      physicsIntegrates: !ctx.physics.integratesPositions,
      physicsResolves: ctx.physics.resolvesVelocity,
    } as import("../asteroids").AsteroidEnv);

    this.render.renderScene(dt);
    this.render.renderDebug();
    // Loadout — ECS-система (priority 12) внутри engine.run(dt) выше; HUD-слоты
    // уже пересобраны к моменту updateHud(). Вручную не вызывается.
    this.render.updateHud();
  }

  /** Единое мировое сечение для систем и рендера (делегировано в GameContext). */
  buildWorld(): WorldFrame {
    return this.ctx.buildWorld();
  }
}