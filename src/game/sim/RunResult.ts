/**
 * RunResult — формат результата прогона и агрегаты по набору seed.
 *
 * Один прогон описывается метриками и хэшами снимков; серия прогонов
 * (sweep) дополнительно агрегируется. Формат стабилен: на него опираются
 * `compare` и закоммиченные baseline-файлы.
 */

import type { SeedSet } from "../core/rng";
import type { PhysicsEngineId } from "../physics/index";
import type { RunMetrics } from "./MetricsSink";

export type { RunMetrics } from "./MetricsSink";

/** Числовая сводка по набору прогонов. */
export interface Aggregate {
  mean: number;
  median: number;
  stddev: number;
  min: number;
  max: number;
  p50: number;
  p90: number;
  p95: number;
  p99: number;
}

/** Метрики одного seed в серии. */
export interface SeedRun {
  seed: number;
  metrics: RunMetrics;
  /** Хэш на каждом контрольном тике. */
  snapshotHashes: string[];
}

/** Результат `run` и `sweep`. */
export interface RunResult {
  scenario: string;
  scenarioHash: string;
  gitSha: string;
  runtime: string;
  physics: PhysicsEngineId;
  tickRate: number;
  /** Длительность в секундах и в тиках. */
  duration: number;
  ticks: number;
  seed: SeedSet;
  /** Сколько прогонов выполнено (для `run --runs N`). */
  runs: number;
  /** Все прогоны дали одинаковые метрики и хэши. */
  identical: boolean;
  firstDivergenceTick: number | null;
  /** Расхождение по какому полю (поток RNG, сущности, счёт). */
  firstDivergenceField?: string | null;
  /** Метрики последнего/первого прогона — для `run`. */
  metrics: RunMetrics;
  /** Агрегаты по всем прогонам (в `run` — по N повторам). */
  aggregate: Record<string, Aggregate>;
  snapshotHashes: string[];
  /** Прогоны по seed (для paired-сравнения). */
  perSeed: SeedRun[];
}

/** Отсортированная копия чисел. */
function sorted(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

/** Квантиль по ближайшему рангу (0..1). */
function quantile(values: readonly number[], q: number): number {
  if (values.length === 0) return 0;
  const index = Math.min(values.length - 1, Math.max(0, Math.round(q * (values.length - 1))));
  return values[index];
}

/** Сводка по набору значений. */
export function aggregateValues(values: readonly number[]): Aggregate {
  if (values.length === 0) {
    return { mean: 0, median: 0, stddev: 0, min: 0, max: 0, p50: 0, p90: 0, p95: 0, p99: 0 };
  }
  const ordered = sorted(values);
  const mean = values.reduce((sum, v) => sum + v, 0) / values.length;
  const variance = values.reduce((sum, v) => sum + (v - mean) ** 2, 0) / values.length;
  return {
    mean,
    median: quantile(ordered, 0.5),
    stddev: Math.sqrt(variance),
    min: ordered[0],
    max: ordered[ordered.length - 1],
    p50: quantile(ordered, 0.5),
    p90: quantile(ordered, 0.9),
    p95: quantile(ordered, 0.95),
    p99: quantile(ordered, 0.99),
  };
}

/** Плоские числовые метрики прогона (без вложенных разбивок). */
export function flatMetrics(metrics: RunMetrics): Record<string, number> {
  return {
    shots: metrics.shots,
    hits: metrics.hits,
    hitRate: metrics.hitRate,
    damageDealt: metrics.damageDealt,
    dps: metrics.dps,
    damageTaken: metrics.damageTaken,
    damageTakenPerSecond: metrics.damageTakenPerSecond,
    survivalTime: metrics.survivalTime,
    kills: metrics.kills,
    killsPerSecond: metrics.killsPerSecond,
    graze: metrics.graze,
    zoneViolations: metrics.zoneViolations,
    abilityUses: metrics.abilityUses,
    finalHp: metrics.finalHp,
    waveReached: metrics.waveReached,
  };
}

/** Агрегаты по всем метрикам серии. */
export function aggregateMetrics(runs: readonly RunMetrics[]): Record<string, Aggregate> {
  const keys = Object.keys(flatMetrics(runs[0] ?? ({} as RunMetrics)));
  const result: Record<string, Aggregate> = {};
  for (const key of keys) {
    result[key] = aggregateValues(
      runs.map((metrics) => (metrics as unknown as Record<string, number>)[key] ?? 0),
    );
  }
  return result;
}

/** Краткая таблица метрик для stdout. */
export function formatMetricsTable(result: RunResult): string {
  const rows: Array<[string, string]> = [
    ["scenario", result.scenario],
    ["runs", String(result.runs)],
    ["identical", String(result.identical)],
    ["seed.master", String(result.seed.master)],
    ["shots", String(result.metrics.shots)],
    ["hits", String(result.metrics.hits)],
    ["hitRate", result.metrics.hitRate.toFixed(3)],
    ["damageDealt", result.metrics.damageDealt.toFixed(1)],
    ["dps", result.metrics.dps.toFixed(2)],
    ["damageTaken", result.metrics.damageTaken.toFixed(1)],
    ["survivalTime", result.metrics.survivalTime.toFixed(2)],
    ["kills", String(result.metrics.kills)],
    ["graze", String(result.metrics.graze)],
    ["zoneViolations", String(result.metrics.zoneViolations)],
    ["finalHp", result.metrics.finalHp.toFixed(0)],
  ];
  const width = Math.max(...rows.map(([key]) => key.length));
  return rows.map(([key, value]) => `${key.padEnd(width)}  ${value}`).join("\n");
}
