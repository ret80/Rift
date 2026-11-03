/**
 * Compare — сравнение двух прогонов одной серии seed.
 *
 * Сравнение всегда paired: для каждого seed берётся разница «стало − было»,
 * а не разница средних. Иначе шум между seed'ами съедает эффект изменения.
 * Доверительный интервал — bootstrap по разницам: без предположений о
 * распределении и с фиксированным seed, чтобы отчёт был воспроизводим.
 */

import { RNG_STREAMS } from "../core/rng";
import type { RunMetrics, RunResult } from "./RunResult";

/** Направление, в котором метрика «лучше». */
export type MetricDirection = "up" | "down";

export interface RegressionRule {
  direction: MetricDirection;
  /** Минимальное относительное изменение, чтобы считать это регрессией, %. */
  thresholdPercent: number;
}

/**
 * Порог регрессии по метрикам. Метрики вне таблицы сравниваются, но не
 * влияют на код выхода: не у каждой есть очевидное «лучше/хуже».
 */
export const REGRESSION_RULES: Record<string, RegressionRule> = {
  dps: { direction: "up", thresholdPercent: 2 },
  hitRate: { direction: "up", thresholdPercent: 2 },
  survivalTime: { direction: "up", thresholdPercent: 2 },
  kills: { direction: "up", thresholdPercent: 2 },
  damageTaken: { direction: "down", thresholdPercent: 2 },
};

/** Метрики, которые попадают в отчёт `compare`. */
export const COMPARED_METRICS = [
  "dps",
  "hitRate",
  "survivalTime",
  "kills",
  "shots",
  "damageDealt",
  "damageTaken",
  "graze",
  "abilityUses",
] as const;

export interface PairedDiff {
  metric: string;
  baselineMean: number;
  currentMean: number;
  meanDelta: number;
  relativePercent: number;
  ciLow: number;
  ciHigh: number;
  wins: number;
  losses: number;
  ties: number;
  /** Нижняя граница CI выше/ниже нуля — разница статистически заметна. */
  significant: boolean;
  regression: boolean;
}

export interface CompareReport {
  baseline: RunSummary;
  current: RunSummary;
  pairedSeeds: number[];
  onlyInBaseline: number[];
  onlyInCurrent: number[];
  diffs: PairedDiff[];
  regressions: string[];
  warnings: string[];
  /** false — наборы seed не совпали, paired-сравнение неполное. */
  paired: boolean;
}

export interface RunSummary {
  scenario: string;
  scenarioHash: string;
  gitSha: string;
  runtime: string;
  tickRate: number;
  physics: string;
  firstDivergenceTick: number | null;
  runs: number;
}

export interface CompareOptions {
  /** Сколько bootstrap-выборок делать (по умолчанию 2000). */
  bootstrapSamples?: number;
  /** Seed bootstrap-генератора: отчёт должен быть воспроизводим. */
  bootstrapSeed?: number;
  /** Переопределить пороги регрессии (для экспериментов). */
  rules?: Record<string, RegressionRule>;
}

const DEFAULT_BOOTSTRAP_SAMPLES = 2000;
const DEFAULT_BOOTSTRAP_SEED = 0x5eed_1234;

/** mulberry32: локальный ГПСЧ только для bootstrap, геймплей его не видит. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Квантиль отсортированного массива. */
function quantile(sortedValues: readonly number[], q: number): number {
  if (sortedValues.length === 0) return 0;
  const index = Math.min(
    sortedValues.length - 1,
    Math.max(0, Math.round(q * (sortedValues.length - 1))),
  );
  return sortedValues[index];
}

function mean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

/** 95% bootstrap-CI среднего. */
export function bootstrapCi(
  values: readonly number[],
  options: CompareOptions = {},
): { low: number; high: number } {
  if (values.length === 0) return { low: 0, high: 0 };
  const samples = Math.max(1, options.bootstrapSamples ?? DEFAULT_BOOTSTRAP_SAMPLES);
  const random = mulberry32(options.bootstrapSeed ?? DEFAULT_BOOTSTRAP_SEED);
  const means: number[] = [];

  for (let i = 0; i < samples; i++) {
    let sum = 0;
    for (let j = 0; j < values.length; j++) {
      sum += values[Math.floor(random() * values.length)];
    }
    means.push(sum / values.length);
  }
  means.sort((a, b) => a - b);
  return { low: quantile(means, 0.025), high: quantile(means, 0.975) };
}

function valueOf(metrics: RunMetrics, metric: string): number {
  const value = (metrics as unknown as Record<string, number>)[metric];
  return Number.isFinite(value) ? value : 0;
}

/** Разница одной метрики по общим seed. */
function pairedDiff(
  metric: string,
  baseline: readonly RunMetrics[],
  current: readonly RunMetrics[],
  options: CompareOptions,
): PairedDiff {
  const deltas: number[] = [];
  let wins = 0;
  let losses = 0;
  let ties = 0;

  for (let i = 0; i < baseline.length; i++) {
    const before = valueOf(baseline[i], metric);
    const after = valueOf(current[i], metric);
    const delta = after - before;
    deltas.push(delta);
    if (delta > 0) wins++;
    else if (delta < 0) losses++;
    else ties++;
  }

  const baselineMean = mean(baseline.map((metrics) => valueOf(metrics, metric)));
  const currentMean = mean(current.map((metrics) => valueOf(metrics, metric)));
  const meanDelta = mean(deltas);
  const { low, high } = bootstrapCi(deltas, options);
  const relativePercent = baselineMean !== 0 ? (meanDelta / Math.abs(baselineMean)) * 100 : 0;
  const significant = low > 0 || high < 0;

  const rule = (options.rules ?? REGRESSION_RULES)[metric];
  const regression = Boolean(
    rule && significant && Math.abs(relativePercent) >= rule.thresholdPercent &&
      (rule.direction === "up" ? meanDelta < 0 : meanDelta > 0),
  );

  return {
    metric,
    baselineMean,
    currentMean,
    meanDelta,
    relativePercent,
    ciLow: low,
    ciHigh: high,
    wins,
    losses,
    ties,
    significant,
    regression,
  };
}

function summary(result: RunResult): RunSummary {
  return {
    scenario: result.scenario,
    scenarioHash: result.scenarioHash,
    gitSha: result.gitSha,
    runtime: result.runtime,
    tickRate: result.tickRate,
    physics: result.physics ?? "custom",
    firstDivergenceTick: result.firstDivergenceTick ?? null,
    runs: result.runs,
  };
}

/** Число бросков по всем потокам — индикатор «траектория разошлась». */
function totalDraws(metrics: RunMetrics): number {
  return RNG_STREAMS.reduce((sum, stream) => sum + (metrics.rngDraws?.[stream] ?? 0), 0);
}

/** Сравнить два результата paired-разницей. */
export function compareResults(
  baseline: RunResult,
  current: RunResult,
  options: CompareOptions = {},
): CompareReport {
  const warnings: string[] = [];

  const baselineBySeed = new Map(baseline.perSeed.map((entry) => [entry.seed, entry.metrics]));
  const currentBySeed = new Map(current.perSeed.map((entry) => [entry.seed, entry.metrics]));
  const pairedSeeds = [...baselineBySeed.keys()]
    .filter((seed) => currentBySeed.has(seed))
    .sort((a, b) => a - b);
  const onlyInBaseline = [...baselineBySeed.keys()].filter((seed) => !currentBySeed.has(seed));
  const onlyInCurrent = [...currentBySeed.keys()].filter((seed) => !baselineBySeed.has(seed));

  if (pairedSeeds.length === 0) {
    throw new Error(
      "compare: у baseline и current нет общих seed — сравнивать нечего. Снимите оба прогона на одном --seed-range.",
    );
  }
  if (onlyInBaseline.length > 0 || onlyInCurrent.length > 0) {
    warnings.push(
      `Наборы seed не совпали: только в baseline ${onlyInBaseline.length}, ` +
        `только в current ${onlyInCurrent.length}. Сравнение по ${pairedSeeds.length} общим seed.`,
    );
  }
  if (pairedSeeds.length < 10) {
    warnings.push(
      `Всего ${pairedSeeds.length} общих seed: CI широкий, для релизного сравнения нужно 100.`,
    );
  }
  if (baseline.runtime !== current.runtime) {
    warnings.push(
      `Разные runtime (${baseline.runtime} → ${current.runtime}): ` +
        "bit-exact не ожидается, сравнение только по метрикам.",
    );
  }
  if (baseline.scenarioHash !== current.scenarioHash) {
    warnings.push("scenarioHash изменился: входные данные прогонов различаются, разница может быть не эффектом кода.");
  }
  if (baseline.tickRate !== current.tickRate || baseline.physics !== current.physics) {
    warnings.push("tickRate/physics различаются: метрики напрямую не сравнимы.");
  }

  const drawsChanged = pairedSeeds.filter((seed) => {
    const before = baselineBySeed.get(seed)!;
    const after = currentBySeed.get(seed)!;
    return totalDraws(before) !== totalDraws(after);
  });
  if (drawsChanged.length > 0) {
    warnings.push(
      `Число бросков RNG изменилось на ${drawsChanged.length}/${pairedSeeds.length} seed — ` +
        "траектория разошлась после изменения количества бросков, " +
        "разница может быть следствием, а не улучшением.",
    );
  }

  const baselineMetrics = pairedSeeds.map((seed) => baselineBySeed.get(seed)!);
  const currentMetrics = pairedSeeds.map((seed) => currentBySeed.get(seed)!);
  const diffs = COMPARED_METRICS.map((metric) =>
    pairedDiff(metric, baselineMetrics, currentMetrics, options),
  );

  return {
    baseline: summary(baseline),
    current: summary(current),
    pairedSeeds,
    onlyInBaseline,
    onlyInCurrent,
    diffs,
    regressions: diffs.filter((diff) => diff.regression).map((diff) => diff.metric),
    warnings,
    paired: onlyInBaseline.length === 0 && onlyInCurrent.length === 0,
  };
}

function formatSigned(value: number, digits: number): string {
  const text = value.toFixed(digits);
  return value > 0 ? `+${text}` : text;
}

/** Короткая markdown-таблица для stdout. */
export function formatCompareTable(report: CompareReport): string {
  const header = ["metric", "baseline", "current", "Δ", "Δ%", "95% CI", "win/loss", "verdict"];
  const rows = report.diffs.map((diff) => [
    diff.metric,
    diff.baselineMean.toFixed(3),
    diff.currentMean.toFixed(3),
    formatSigned(diff.meanDelta, 3),
    `${formatSigned(diff.relativePercent, 1)}%`,
    `[${formatSigned(diff.ciLow, 3)}, ${formatSigned(diff.ciHigh, 3)}]`,
    `${diff.wins}/${diff.losses}`,
    diff.regression ? "REGRESSION" : diff.significant ? "changed" : "—",
  ]);
  const widths = header.map((title, column) =>
    Math.max(title.length, ...rows.map((row) => row[column].length)),
  );
  const line = (cells: string[]) =>
    cells.map((cell, column) => cell.padEnd(widths[column])).join("  ").trimEnd();
  return [line(header), line(widths.map((width) => "-".repeat(width))), ...rows.map(line)].join(
    "\n",
  );
}

/** Полный markdown-отчёт: таблица, предупреждения, итог. */
export function formatCompareReport(report: CompareReport): string {
  const lines: string[] = [];
  lines.push(`# Сравнение прогонов: ${report.baseline.scenario}`);
  lines.push("");
  lines.push(
    `- baseline: ${report.baseline.gitSha} (${report.baseline.runs} прогонов, ${report.baseline.runtime})`,
  );
  lines.push(
    `- current: ${report.current.gitSha} (${report.current.runs} прогонов, ${report.current.runtime})`,
  );
  lines.push(`- общих seed: ${report.pairedSeeds.length}`);
  lines.push(`- scenarioHash: ${report.baseline.scenarioHash} → ${report.current.scenarioHash}`);
  lines.push("");
  lines.push(formatCompareTable(report));

  if (report.warnings.length > 0) {
    lines.push("");
    lines.push("## Предупреждения");
    for (const warning of report.warnings) lines.push(`- ${warning}`);
  }

  lines.push("");
  lines.push(
    report.regressions.length > 0
      ? `## Итог: регрессия в ${report.regressions.join(", ")}`
      : "## Итог: регрессий нет",
  );
  return lines.join("\n");
}
