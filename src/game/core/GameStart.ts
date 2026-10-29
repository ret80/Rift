/**
 * GameStart — жизненный цикл забега: старт, возврат в меню, смерть.
 * Инициализирует DeathSystem, чистит пулы, применяет апгрейды
 * и сохраняет лучшую волну. Вызывается фасадом Game.
 */

import { DeathSystem } from "../systems/DeathSystem";
import type { GameContext } from "./GameContext";
import { loadBestWave, saveBestWave } from "../upgrades";

export class GameStart {
  constructor(private readonly ctx: GameContext) {}

  /** Начать новый забег (переход FSM выполняется до вызова). */
  startRun(): void {
    const ctx = this.ctx;

    ctx.loopResetTime();
    ctx.scoringSystem.reset();
    // Начинаем с лучшей достигнутой волны (или стартовой для отладки)
    ctx.scoringSystem.setKilledWave(0);

    // Spawn player at center of screen (not from rift)
    ctx.playerSystem.reset();

    // Clear entity pools before applying upgrades:
    // the weapon manager rebuilds the drone swarm from the applied upgrades.
    ctx.ecs.clearEnemies();
    ctx.ecs.clearBullets();
    ctx.ecs.clearEnemyBullets();
    ctx.ecs.clearPickups();
    ctx.ecs.clearAllyDrones();
    ctx.loadoutSystem.reset();
    ctx.weaponManager.reset();
    ctx.bonusManager.reset();
    ctx.shieldSystem.reset();
    ctx.grazeSystem.reset();
    ctx.abilitySystem.reset();
    ctx.ecs.clearBeams();

    // Apply persistent upgrades to the player and the weapons
    ctx.applyUpgrades(true);

    // Reset spawn and enemy system state for new game
    ctx.spawnSystem.clearAnnounced();
    ctx.ecs.resetEnemyWave();
    const resetWaveStart = Math.max(ctx.startWave, loadBestWave(ctx.storage));
    ctx.ecs.setEnemyWave(resetWaveStart);

    // Reset zone state via orchestrator
    ctx.waveOrchestrator.reset(resetWaveStart);

    ctx.riftField.reset();
    ctx.asteroidField.hardReset();
    ctx.physics.reset();
    ctx.fx.reset();
    ctx.deathSystem = new DeathSystem(
      () => ctx.getPlayerPosition(),
      ctx.fx,
      ctx.audio,
      ctx.ecs,
      ctx.scoringSystem,
      {
        onGameOver: () => {
          saveBestWave(ctx.waveOrchestrator.wave, ctx.storage);
          ctx.hooks.onGameOver();
        },
        onStats: (score, best, isBest, _wave, kills, time) => {
          ctx.hooks.onStats({ score, best, isBest, wave: ctx.waveOrchestrator.wave, kills, time });
        },
      },
    );
    // Пояс уже очищен в hardReset() выше; дубликат не нужен.

    ctx.hooks.onBanner(null);
    ctx.hooks.onCountdown(null);
    ctx.hooks.onToast(null);

    // Start countdown immediately
    ctx.countdownSystem.startWave(ctx.waveOrchestrator.wave);
  }

  /** Вернуться в меню: очистить забег и показать меню-сцену. */
  toMenu(): void {
    const ctx = this.ctx;
    if (ctx.fsm.is("menu")) return;
    ctx.fsm.fire("to_menu");
    ctx.setPaused(false);
    ctx.audio.setCombat(false);
    ctx.hooks.onPause(false);
    // Reset menu state
    ctx.menuScene.reset();
    ctx.asteroidField.reset();
    ctx.physics.reset();
  }
}