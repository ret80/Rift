/**
 * GameRender — сборка рендер-сцены, отрисовка и отправка HUD.
 * Единая точка построения RenderScene и HudData из состояния
 * контекста. Сюда же делегированы debug-оверлей и меню.
 */

import type { GameStateId } from "./GameFSM";
import type { RenderScene } from "../types/render";
import type { GameContext } from "./GameContext";
import type { WorldFrame } from "./WorldFrame";

export class GameRender {
  constructor(private readonly ctx: GameContext) {}

  /** Отрисовать кадр игры/меню по текущему состоянию FSM. */
  renderScene(dt: number, world: WorldFrame): void {
    const ctx = this.ctx;
    const playerState = ctx.playerSystem.getPosition();

    // Smooth camera follow (delegated to CameraSystem)
    ctx.cameraSystem.update(playerState, dt);
    const pos = ctx.cameraSystem.getPosition();

    const scene: RenderScene = {
      renderer: ctx.renderer,
      state: ctx.fsm.state as GameStateId,
      time: ctx.loopTime,
      wave: ctx.waveOrchestrator.wave,
      score: ctx.scoringSystem.score,
      player: world.player,
      aim: ctx.weaponManager.getAimAngle(),
      guns: ctx.weaponManager.getInstanceCount("cannon"),
      shield: ctx.shieldSystem.getSnapshot(),
      enemies: world.enemies,
      bullets: world.bullets,
      enemyBullets: world.enemyBullets,
      pickups: world.pickups,
      allyDrones: world.allyDrones,
      beams: world.beams,
      zone: world.zone,
      camera: { x: pos.x, y: pos.y, zoom: pos.zoom },
      view: ctx.viewport,
    };

    ctx.rendererSystem.render(scene);
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
      enemies: ctx.ecs.enemies().length,
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
      enemyCount: ctx.ecs.enemies().length,
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