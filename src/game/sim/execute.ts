/**
 * execute — один прогон сценария целиком.
 *
 * Создаёт чистый мир на каждый вызов (никакого переиспользования состояния
 * между seed), гоняет ровно `scenarioTicks` тиков фиксированного шага и
 * собирает метрики + снимки для проверки детерминизма.
 */

import { defaultUpgrades, defaultWeaponLoadout } from "../upgrades";
import type { WeaponId } from "../weapons/Weapon";
import { STORAGE_KEYS } from "../core/storageKeys";
import type { SeedSet } from "../core/rng";
import { SimulationClock } from "../core/SimulationClock";
import type { GameWorld } from "../core/GameWorld";
import { createHeadlessWorld } from "../../sim/runner";
import { MetricsSink, type RunMetrics } from "./MetricsSink";
import {
  firstDivergence,
  hashSnapshot,
  takeSnapshot,
  type Divergence,
  type Snapshot,
} from "./Snapshot";
import {
  scenarioAgentFactory,
  scenarioComposition,
  scenarioSeedSet,
  scenarioTicks,
  type Scenario,
} from "./Scenario";

/** Как часто снимать контрольный снимок (в тиках). */
export const DEFAULT_SNAPSHOT_INTERVAL = 60;

export interface ExecuteOptions {
  /** Переопределить seed-набор (sweep по seed). */
  seedSet?: SeedSet;
  /** Переопределить число тиков (`--seconds` в CLI). */
  ticks?: number;
  /** Интервал снимков в тиках. */
  snapshotInterval?: number;
}

export interface ExecuteResult {
  metrics: RunMetrics;
  snapshots: Snapshot[];
  snapshotHashes: string[];
  ticks: number;
  /** Мир после последнего тика: для сравнения и отладки. */
  world: GameWorld;
  dispose(): void;
}

/** Хранилище с апгрейдами сценария — их читает мир при создании. */
function scenarioStorage(scenario: Scenario): Record<string, string> {
  const upgrades = { ...defaultUpgrades(), ...(scenario.upgrades ?? {}) };
  const loadout = defaultWeaponLoadout();
  for (const [id, entry] of Object.entries(scenario.weapons ?? {})) {
    const target = loadout[id as WeaponId];
    if (!target) continue;
    target.owned = entry.owned;
    for (const stat of ["reload", "damage", "accuracy"] as const) {
      const value = entry[stat];
      if (value !== undefined) target.model[stat] = value;
    }
  }
  return {
    [STORAGE_KEYS.upgrades]: JSON.stringify(upgrades),
    [STORAGE_KEYS.weaponLoadout]: JSON.stringify(loadout),
  };
}

/** Прогнать сценарий один раз с заданным seed-набором. */
export function executeScenario(scenario: Scenario, options: ExecuteOptions = {}): ExecuteResult {
  const seedSet = options.seedSet ?? scenarioSeedSet(scenario);
  const totalTicks = options.ticks ?? scenarioTicks(scenario);
  const snapshotInterval = Math.max(1, options.snapshotInterval ?? DEFAULT_SNAPSHOT_INTERVAL);

  const world = createHeadlessWorld({
    seedSet,
    physics: scenario.physics,
    startWave: scenario.startWave,
    view: scenario.viewport,
    storage: scenarioStorage(scenario),
    agent: scenarioAgentFactory(scenario),
    waveComposition: scenarioComposition(scenario) ?? undefined,
  });

  const sink = new MetricsSink(world);
  const snapshots: Snapshot[] = [];
  const snapshotHashes: string[] = [];

  const clock = new SimulationClock();
  let tick = 0;
  clock.runTicks(totalTicks, (dt) => {
    world.tick(dt);
    sink.sample();
    tick++;
    if (tick % snapshotInterval === 0 || tick === totalTicks) {
      const snapshot = takeSnapshot(world);
      snapshots.push(snapshot);
      snapshotHashes.push(hashSnapshot(snapshot));
    }
  });

  const metrics = sink.build();
  return {
    metrics,
    snapshots,
    snapshotHashes,
    ticks: totalTicks,
    world,
    dispose: () => sink.dispose(),
  };
}

/** Первое расхождение двух прогонов (null — бит-в-бит одинаковы). */
export function compareSnapshots(a: readonly Snapshot[], b: readonly Snapshot[]): Divergence | null {
  return firstDivergence(a, b);
}
