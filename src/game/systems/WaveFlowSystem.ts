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
 * Зависимости описаны узкими портами: системе не нужны целые классы.
 */

import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
import type { AppliedUpgrades } from "../upgrades";
import type { WaveOrchestrator } from "./WaveOrchestrator";

/** Состояние игрока для проверки зоны. */
export interface PlayerPosition {
  x: number;
  y: number;
}

/** Порт подсчёта времени/убийств. */
export interface ScoringPort {
  addRunTime(dt: number): void;
  readonly killedWave: number;
}

/** Порт счётчика заспавненных врагов. */
export interface SpawnPort {
  readonly allocated: number;
}

/** Порт применённых улучшений. */
export interface UpgradePort {
  getApplied<T extends keyof AppliedUpgrades>(key: T): AppliedUpgrades[T];
}

/** Порт отсчёта перед волной. */
export interface CountdownPort {
  isCountdownActive(): boolean;
}

/** Зависимости для WaveFlowSystem. */
export interface WaveFlowDeps {
  orchestrator: WaveOrchestrator;
  scoringSystem: ScoringPort;
  spawnSystem: SpawnPort;
  upgradeSystem: UpgradePort;
  countdownSystem: CountdownPort;
  getEnemyList: () => Array<{ marker: { dead: boolean } }>;
  getPlayerPosition: () => PlayerPosition;
}

export class WaveFlowSystem extends PhasedSystem {
  private deps: WaveFlowDeps;

  constructor(deps: WaveFlowDeps) {
    super(Phase.Wave);
    this.deps = deps;
  }

  /** Обновление зоны и волн внутри engine.run(dt). */
  process(dt: number): void {
    this.updateZoneAndWaves(dt);
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
    const alive = getEnemyList().filter((e) => !e.marker.dead).length;
    if (alive > 0) return;

    // Проверяем что все враги спавнятся и убиты
    const allSpawned = spawnSystem.allocated >= orchestrator.waveTotal;
    const allKilled = scoringSystem.killedWave >= orchestrator.waveTotal;

    orchestrator.tryCheckWaveClear(allSpawned, allKilled);
  }
}
