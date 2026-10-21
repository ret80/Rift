/**
 * WaveFlowSystem — координация жизненного цикла волны.
 *
 * Отвечает за:
 *   • проверку завершения волны (checkWaveClear)
 *   • обновление зоны и волн (updateZoneAndWaves)
 *   • добавление времени забега
 *   • применение множителя скорости
 *
 * Все системы остаются независимыми, WaveFlowSystem — только координатор.
 */

import type { EventBus } from "../core/EventBus";
import type { ScoringSystem } from "./ScoringSystem";
import type { SpawnSystem } from "./SpawnSystem";
import type { WaveOrchestrator } from "./WaveOrchestrator";
import type { UpgradeSystem } from "./UpgradeSystem";
import type { CountdownSystem } from "./CountdownSystem";

/** Состояние игрока для проверки зоны. */
export interface PlayerPosition {
  x: number;
  y: number;
}

/** Зависимости для WaveFlowSystem. */
export interface WaveFlowDeps {
  eventBus: EventBus;
  orchestrator: WaveOrchestrator;
  scoringSystem: ScoringSystem;
  spawnSystem: SpawnSystem;
  upgradeSystem: UpgradeSystem;
  countdownSystem: CountdownSystem;
  getEnemyList: () => Array<{ dead?: boolean }>;
  getPlayerPosition: () => PlayerPosition;
}

export class WaveFlowSystem {
  private deps: WaveFlowDeps;

  constructor(deps: WaveFlowDeps) {
    this.deps = deps;
  }

  /**
   * Обновить зону и волны: время, скорость, оркестратор.
   * Вызывается каждый кадр в active/cleared состояниях.
   */
  updateZoneAndWaves(dt: number): void {
    const { orchestrator, scoringSystem, upgradeSystem, countdownSystem } = this.deps;

    // Проверяем что волна активна или завершена
    if (orchestrator.waveState !== "active" && orchestrator.waveState !== "cleared") {
      return;
    }

    // Добавляем время забега
    scoringSystem.addRunTime(dt);

    // Применяем множитель скорости
    orchestrator.setSpeedMult(upgradeSystem.getApplied("speedMult"));

    // Обновляем оркестратор
    const playerPos = this.deps.getPlayerPosition();
    const countdownActive = countdownSystem.isCountdownActive();
    orchestrator.update(dt, playerPos, countdownActive);
  }

  /**
   * Проверить завершение волны.
   * Вызывается при каждом убийстве врага.
   */
  checkWaveClear(): void {
    const { orchestrator, spawnSystem, scoringSystem, getEnemyList } = this.deps;

    // Не проверяем если волна не активна
    if (orchestrator.waveState !== "active") return;

    // Проверяем что все враги убиты
    const alive = getEnemyList().filter((e) => !e.dead).length;
    if (alive > 0) return;

    // Проверяем что все враги спавнятся и убиты
    const allSpawned = spawnSystem.allocated >= orchestrator.waveTotal;
    const allKilled = scoringSystem.killedWave >= orchestrator.waveTotal;

    orchestrator.tryCheckWaveClear(allSpawned, allKilled);
  }
}
