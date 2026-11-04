/**
 * Headless runner — запуск игрового мира без DOM.
 *
 * Мир создаётся из `GameWorldConfig`, стартует забег без обратного отсчёта
 * (`skipCountdown`) и крутится ровно `ticks` тиков фиксированного шага.
 * Никакой `GameContext`, `requestAnimationFrame` и `performance.now`.
 */

import type { WaveCompositionOverride } from "../game/balance/waves";
import { GameWorld, createGameWorld, type GameWorldConfig } from "../game/core/GameWorld";
import type { PersistencePort } from "../game/core/PersistencePort";
import type { PlayerControls } from "../game/core/PlayerControls";
import { createSeedSet, type Rng, type SeedSet } from "../game/core/rng";
import { FIXED_DT, SimulationClock } from "../game/core/SimulationClock";
import { nullPorts, type WorldView } from "../game/core/WorldPorts";
import type { PhysicsEngineId } from "../game/physics";
import type { PlayerAgent } from "../game/sim/agents/PlayerAgent";

/** Хранилище в памяти: симуляция не пишет в localStorage. */
export function createMemoryStorage(initial: Record<string, string> = {}): PersistencePort {
  const data = new Map<string, string>(Object.entries(initial));
  return {
    get: (key) => data.get(key) ?? null,
    set: (key, value) => {
      data.set(key, value);
    },
    remove: (key) => {
      data.delete(key);
    },
  };
}

/** Параметры headless-прогона. */
export interface HeadlessRunConfig {
  /** Мастер-seed; если передан `seedSet`, он используется как есть. */
  seed?: number;
  seedSet?: SeedSet;
  /** Сколько тиков прогнать. */
  ticks: number;
  physics?: PhysicsEngineId;
  startWave?: number;
  view?: Partial<WorldView>;
  testMode?: boolean;
  /** Фабрика агента игрока (получает seeded-поток `agent`). */
  agent?: (rng: Rng) => PlayerAgent;
  /**
   * Внешний порт управления (эмуляция человеческих контроллов).
   * По умолчанию мир создаёт `AgentControls`; с агентом передавать нельзя.
   */
  controls?: PlayerControls;
  /** Точный состав волны вместо случайных весов (тестовый режим). */
  waveComposition?: WaveCompositionOverride;
  /** Колбэк на каждом тике (снапшоты, метрики). */
  onTick?: (world: GameWorld, tick: number) => void;
  /** Начальное содержимое хранилища (апгрейды, loadout). */
  storage?: Record<string, string>;
}

/** Создать мир без презентации, готовый к headless-прогону. */
export function createHeadlessWorld(
  config: Omit<HeadlessRunConfig, "ticks" | "onTick">,
): GameWorld {
  const worldConfig: GameWorldConfig = {
    seed: config.seedSet ?? createSeedSet(config.seed ?? 1),
    startWave: config.startWave ?? 1,
    physics: config.physics ?? "custom",
    ports: nullPorts(createMemoryStorage(config.storage)),
    view: config.view,
    skipCountdown: true,
    testMode: config.testMode ?? true,
    agent: config.agent,
    controls: config.controls,
  };
  const world = createGameWorld(worldConfig);
  world.startRun();
  // Состав волны задаётся после старта: первый тик ещё не успел инициализировать волну.
  if (config.waveComposition) world.setWaveOverride(config.waveComposition);
  return world;
}

/** Прогнать сценарий headless целиком и вернуть мир после последнего тика. */
export function runHeadless(config: HeadlessRunConfig): GameWorld {
  const world = createHeadlessWorld(config);
  const clock = new SimulationClock();
  clock.runTicks(config.ticks, (dt) => {
    world.tick(dt);
    config.onTick?.(world, world.tickIndex);
  });
  return world;
}

/** Число тиков в секундах при фиксированном шаге. */
export function ticksForSeconds(seconds: number): number {
  return Math.round(seconds / FIXED_DT);
}
