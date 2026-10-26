/**
 * GameRender — сборка рендер-сцены, отрисовка и отправка HUD.
 * Единая точка построения RenderScene и HudData из состояния
 * контекста. Сюда же делегированы debug-оверлей и меню.
 */

import type { RenderScene } from "../types/render";
import type { GameContext } from "./GameContext";

export class GameRender {
  constructor(private readonly ctx: GameContext) {}

  /** Отрисовать кадр игры/меню по текущему состоянию FSM. */
  renderScene(dt: number): void {
    const ctx = this.ctx;
    const playerState = ctx.playerSystem.getPlayerRef();

    // Smooth camera follow (delegated to CameraSystem)
    ctx.cameraSystem.update(playerState, dt);
    const pos = ctx.cameraSystem.getPosition();
    const zoneState = ctx.waveOrchestrator.zoneState;

    const scene: RenderScene = {
      state: ctx.fsm.state as string,
      time: ctx.loopTime,
      wave: ctx.waveOrchestrator.wave,
      score: ctx.scoringSystem.score,
      player: ctx.getPlayerWorld(),
      aim: ctx.weaponManager.getAimAngle(),
      guns: ctx.weaponManager.getInstanceCount("cannon"),
      bonus: ctx.bonusManager.getRenderSnapshot(),
      shield: ctx.shieldSystem.getSnapshot(),
      enemies: ctx.entityPool.enemyList,
      bullets: ctx.entityPool.bulletList,
      enemyBullets: ctx.entityPool.enemyBulletList,
      pickups: ctx.entityPool.pickupList,
      allyDrones: ctx.entityPool.allyDroneList,
      beams: ctx.entityPool.beamList,
      zone: zoneState.active
        ? {
            active: zoneState.active,
            x: zoneState.x,
            y: zoneState.y,
            radius: zoneState.radius,
            targetRadius: zoneState.targetRadius,
            alpha: zoneState.alpha,
          }
        : null,
      camera: { x: pos.x, y: pos.y, zoom: pos.zoom },
      view: { width: window.innerWidth, height: window.innerHeight },
    };

    ctx.rendererSystem.render(ctx.renderer, scene);
  }

  /** Кадр меню: фон, астероиды, разломы, враги. */
  updateMenu(dt: number): void {
    const ctx = this.ctx;
    ctx.menuScene.update(dt);
    ctx.fx.update(dt, dt); // Обновляем частицы и тряску экрана
    ctx.menuScene.render(ctx.renderer);
  }

  /** Отправить HUD-данные в UI. */
  updateHud(): void {
    const ctx = this.ctx;
    const s = ctx.scoringSystem.getState();
    ctx.hooks.onHud({
      wave: ctx.waveOrchestrator.wave,
      score: s.score,
      best: s.best,
      hp: ctx.playerSystem.getHp(),
      maxHp: ctx.playerSystem.getMaxHp(),
      killed: ctx.scoringSystem.killedWave,
      total: ctx.waveOrchestrator.waveTotal,
      enemies: ctx.entityPool.enemyList.length,
      comboMult: s.comboMult,
      time: s.runTime,
      guns: ctx.weaponManager.getInstanceCount("cannon"),
      rateMult: ctx.bonusManager.getRateMult(),
      rateT: ctx.bonusManager.getRateT(),
      drones: ctx.weaponManager.getInstanceCount("drone"),
      parts: ctx.upgradeSystem.getParts(),
      shield: ctx.shieldSystem.getSnapshot(),
      loadout: ctx.loadoutSystem.getSlots(),
    });
  }

  /** Делегировать debug-оверлей в DebugSystem. */
  renderDebug(): void {
    const ctx = this.ctx;
    ctx.debugSystem.renderDebug({
      canvas: ctx.renderer.canvas,
      fsmState: ctx.fsm.state,
      wave: ctx.waveOrchestrator.wave,
      runTime: ctx.scoringSystem.runTime,
      fps: ctx.fps(),
      zoneActive: ctx.waveOrchestrator.zoneState.active,
      zoneRadius: ctx.waveOrchestrator.zoneState.radius,
      zoneTargetRadius: ctx.waveOrchestrator.zoneState.targetRadius,
      zoneAlpha: ctx.waveOrchestrator.zoneState.alpha,
      countdownActive: ctx.countdownSystem.isCountdownActive(),
      enemyCount: ctx.entityPool.enemyList.length,
      riftCount: ctx.riftField.riftList.length,
      waveTotal: ctx.waveOrchestrator.waveTotal,
      kills: ctx.scoringSystem.getState().killed,
      allocated: ctx.spawnSystem.allocated,
      playerX: ctx.playerSystem.getPosition().x,
      playerY: ctx.playerSystem.getPosition().y,
      playerHp: ctx.playerSystem.getHp(),
      playerMaxHp: ctx.playerSystem.getMaxHp(),
      inputAxisX: ctx.input.axis.x,
      inputAxisY: ctx.input.axis.y,
      mouseX: ctx.inputSystem.mouse.x,
      mouseY: ctx.inputSystem.mouse.y,
    });
  }
}