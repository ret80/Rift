/**
 * Реализация CLI симулятора.
 *
 * Команды:
 *   run     — один сценарий на одном seed-наборе (можно N повторов);
 *   sweep   — серия прогонов по диапазону мастер-seed и агрегаты;
 *   compare — сравнение двух результатов (шаг 8).
 *
 * CLI ничего не знает о внутренностях мира: только сценарии, seed и отчёты.
 */

import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import type { SeedSet } from "../game/core/rng";
import {
  SCENARIO_TICK_RATE,
  ScenarioError,
  parseScenario,
  scenarioHash,
  scenarioSeedSet,
  scenarioTicks,
  type Scenario,
} from "../game/sim/Scenario";
import {
  aggregateMetrics,
  flatMetrics,
  formatMetricsTable,
  type Aggregate,
  type RunMetrics,
  type RunResult,
  type SeedRun,
} from "../game/sim/RunResult";
import { compareResults, formatCompareReport } from "../game/sim/Compare";
import { compareSnapshots, executeScenario, type ExecuteResult } from "../game/sim/execute";
import type { Divergence } from "../game/sim/Snapshot";

export const CLI_USAGE = `Rift simulation harness

Usage:
  npm run sim -- <command> [options]

Commands:
  run <scenario> --seed <n> [--runs <n>] [--expect-identical] [--out <file>]
        Прогнать сценарий на одном seed-наборе и напечатать метрики.
  sweep <scenario> --seed-range <a..b> [--out <file>]
        Прогнать сценарий на диапазоне мастер-seed и сохранить baseline.
  compare <baseline.json> <current.json> [--fail-on-regression]
        Сравнить два результата paired-разницей и вернуть код 1 при регрессии.

Options:
  --help    Показать эту справку.

Scenarios live in scenarios/*.json. Local results go to sim-results/,
committed baselines to sim/baselines/.`;

/** Разобранные аргументы: позиционные + ключ→значение. */
interface ParsedArgs {
  positional: string[];
  flags: Set<string>;
  values: Map<string, string>;
}

const VALUE_FLAGS = new Set(["--seed", "--runs", "--out", "--seed-range", "--seconds"]);

function parseArgs(argv: readonly string[]): ParsedArgs {
  const positional: string[] = [];
  const flags = new Set<string>();
  const values = new Map<string, string>();

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith("--")) {
      if (VALUE_FLAGS.has(arg)) {
        const value = argv[i + 1];
        if (value === undefined || value.startsWith("--")) {
          throw new Error(`Флаг ${arg} требует значения`);
        }
        values.set(arg, value);
        i++;
      } else {
        flags.add(arg);
      }
    } else {
      positional.push(arg);
    }
  }

  return { positional, flags, values };
}

function readInteger(values: Map<string, string>, flag: string): number | undefined {
  const raw = values.get(flag);
  if (raw === undefined) return undefined;
  const value = Number(raw);
  if (!Number.isInteger(value)) throw new Error(`${flag}: ожидается целое, получено "${raw}"`);
  return value;
}

function readScenario(path: string): Scenario {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Не удалось прочитать сценарий: ${path}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Сценарий не является валидным JSON (${path}): ${(error as Error).message}`);
  }

  return parseScenario(json);
}

/**
 * Seed-набор с переопределённым мастер-seed.
 *
 * Потоки выводятся из нового master — иначе `--seed` менял бы только
 * счётчик, а боевые броски оставались бы прежними. Явные `seed.streams`
 * из сценария сохраняются: это осознанный выбор автора сценария.
 */
function withMasterSeed(scenario: Scenario, master: number): SeedSet {
  return scenarioSeedSet({
    ...scenario,
    seed: { master, ...(scenario.seed.streams ? { streams: scenario.seed.streams } : {}) },
  });
}

function gitSha(): string {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"],
    }).trim();
  } catch {
    return "unknown";
  }
}

function runtimeInfo(): string {
  return `node ${process.version} ${process.platform}/${process.arch}`;
}

/** Сравнить метрики двух прогонов (без хэшей). */
function sameMetrics(a: RunMetrics, b: RunMetrics): boolean {
  return JSON.stringify(flatMetrics(a)) === JSON.stringify(flatMetrics(b));
}

interface SeriesRun {
  seed: number;
  result: ExecuteResult;
}

/** Прогнать набор seed-наборов и собрать результат. */
function buildRunResult(
  scenario: Scenario,
  scenarioHashValue: string,
  runs: SeriesRun[],
  ticks: number,
  divergence: Divergence | null,
): RunResult {
  const first = runs[0];
  const perSeed: SeedRun[] = runs.map((run) => ({
    seed: run.seed,
    metrics: run.result.metrics,
    snapshotHashes: run.result.snapshotHashes,
  }));
  const identical =
    divergence === null && runs.every((run) => sameMetrics(first.result.metrics, run.result.metrics));

  const seedTotals = runs.reduce(
    (acc, run) => {
      acc[run.seed] = (acc[run.seed] ?? 0) + 1;
      return acc;
    },
    {} as Record<number, number>,
  );
  const uniqueSeeds = Object.keys(seedTotals).length;

  // Для `run --runs N` агрегат считается по повторам одного seed;
  // для `sweep` — по разным seed. Формат один и тот же.
  const aggregate: Record<string, Aggregate> = aggregateMetrics(
    perSeed.map((entry) => entry.metrics),
  );
  void uniqueSeeds;

  return {
    scenario: scenario.name,
    scenarioHash: scenarioHashValue,
    gitSha: gitSha(),
    runtime: runtimeInfo(),
    physics: scenario.physics ?? "custom",
    tickRate: SCENARIO_TICK_RATE,
    duration: ticks / SCENARIO_TICK_RATE,
    ticks,
    seed: scenarioSeedSet(scenario),
    runs: runs.length,
    identical,
    firstDivergenceTick: divergence ? divergence.tick : null,
    firstDivergenceField: divergence ? divergence.field : null,
    metrics: first.result.metrics,
    aggregate,
    snapshotHashes: first.result.snapshotHashes,
    perSeed,
  };
}

function writeResult(result: RunResult, out: string | undefined): void {
  if (!out) return;
  const path = resolve(process.cwd(), out);
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(`\nJSON: ${path}`);
}

async function commandRun(args: ParsedArgs): Promise<number> {
  const scenarioPath = args.positional[0];
  if (!scenarioPath) throw new Error("run: укажите путь к сценарию");

  const scenario = readScenario(scenarioPath);
  const seedValue = readInteger(args.values, "--seed");
  if (seedValue === undefined) throw new Error("run: обязателен --seed <n>");
  if (seedValue < 0 || seedValue > 0xffffffff) {
    throw new Error("run: --seed должен быть в диапазоне 0..4294967295");
  }

  const repeats = readInteger(args.values, "--runs") ?? 1;
  if (repeats < 1) throw new Error("run: --runs должно быть >= 1");

  const ticksOverride = args.values.get("--seconds")
    ? Math.round(Number(args.values.get("--seconds")) / (1 / SCENARIO_TICK_RATE))
    : undefined;
  const ticks = ticksOverride && ticksOverride > 0 ? ticksOverride : scenarioTicks(scenario);

  const seedSet = withMasterSeed(scenario, seedValue);
  const hash = await scenarioHash(scenario);

  const series: SeriesRun[] = [];
  let divergence: Divergence | null = null;
  let reference: ExecuteResult | null = null;

  for (let i = 0; i < repeats; i++) {
    const result = executeScenario(scenario, { seedSet, ticks });
    if (!reference) {
      reference = result;
    } else {
      // Повтор с тем же seed обязан дать те же снимки и метрики.
      const diff = compareSnapshots(reference.snapshots, result.snapshots);
      if (diff && !divergence) divergence = diff;
      result.dispose();
    }
    series.push({ seed: seedValue, result });
  }

  const runResult = buildRunResult(scenario, hash, series, ticks, divergence);
  reference?.dispose();
  reference = null;

  console.log(formatMetricsTable(runResult));
  console.log(`scenarioHash  ${hash}`);
  if (repeats > 1) {
    console.log(
      runResult.identical
        ? `\n${repeats} повторов: состояния совпали на каждом контрольном тике.`
        : `\nРАСХОЖДЕНИЕ на тике ${divergence?.tick ?? "?"} (${divergence?.field ?? "metrics"}).`,
    );
  }
  writeResult(runResult, args.values.get("--out"));

  if (args.flags.has("--expect-identical") && !runResult.identical) {
    console.error("Ожидалась побитовая идентичность повторов, но состояния разошлись.");
    return 1;
  }
  return 0;
}

async function commandSweep(args: ParsedArgs): Promise<number> {
  const scenarioPath = args.positional[0];
  if (!scenarioPath) throw new Error("sweep: укажите путь к сценарию");

  const range = args.values.get("--seed-range");
  if (!range) throw new Error("sweep: обязателен --seed-range <a..b>");
  const match = /^(\d+)\.\.(\d+)$/.exec(range);
  if (!match) throw new Error(`sweep: --seed-range ожидается в формате a..b, получено "${range}"`);
  const from = Number(match[1]);
  const to = Number(match[2]);
  if (from > to) throw new Error("sweep: начало диапазона больше конца");
  if (to > 0xffffffff) throw new Error("sweep: seed должен быть 32-битным беззнаковым");
  if (to - from + 1 > 1000) throw new Error("sweep: максимум 1000 прогонов за раз");

  const scenario = readScenario(scenarioPath);
  const ticks = scenarioTicks(scenario);
  const hash = await scenarioHash(scenario);

  const series: SeriesRun[] = [];
  for (let seed = from; seed <= to; seed++) {
    const result = executeScenario(scenario, { seedSet: withMasterSeed(scenario, seed), ticks });
    series.push({ seed, result });
    series[series.length - 1].result.dispose();
  }

  const runResult = buildRunResult(scenario, hash, series, ticks, null);
  console.log(`sweep ${scenario.name}: seed ${from}..${to} (${series.length} прогонов)\n`);
  console.log(formatAggregateTable(runResult.aggregate));
  writeResult(runResult, args.values.get("--out"));
  return 0;
}

/** Прочитать результат прогона из JSON и проверить форму. */
function readRunResult(path: string): RunResult {
  let raw: string;
  try {
    raw = readFileSync(path, "utf8");
  } catch {
    throw new Error(`Не удалось прочитать результат: ${path}`);
  }

  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch (error) {
    throw new Error(`Результат не является валидным JSON (${path}): ${(error as Error).message}`);
  }

  const data = json as Partial<RunResult>;
  if (
    typeof data !== "object" ||
    data === null ||
    typeof data.scenario !== "string" ||
    !Array.isArray(data.perSeed) ||
    typeof data.scenarioHash !== "string"
  ) {
    throw new Error(
      `${path}: не похоже на результат симулятора (нужны scenario, scenarioHash, perSeed).`,
    );
  }
  return data as RunResult;
}

async function commandCompare(args: ParsedArgs): Promise<number> {
  const [baselinePath, currentPath] = args.positional;
  if (!baselinePath || !currentPath) {
    throw new Error("compare: нужны два файла — baseline и current");
  }

  const report = compareResults(readRunResult(baselinePath), readRunResult(currentPath));
  console.log(formatCompareReport(report));

  const out = args.values.get("--out");
  if (out) {
    const path = resolve(process.cwd(), out);
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    console.log(`\nJSON: ${path}`);
  }

  if (args.flags.has("--fail-on-regression")) {
    if (report.regressions.length > 0) {
      console.error(`\nРегрессия: ${report.regressions.join(", ")}`);
      return 1;
    }
    if (!report.paired) {
      console.error("\nНаборы seed не совпали — чистого сравнения не получилось.");
      return 1;
    }
  }
  return 0;
}

function formatAggregateTable(aggregate: Record<string, Aggregate>): string {
  const header = ["metric", "mean", "p50", "p90", "stddev", "min", "max"];
  const rows = Object.entries(aggregate).map(([key, value]) => [
    key,
    value.mean.toFixed(2),
    value.p50.toFixed(2),
    value.p90.toFixed(2),
    value.stddev.toFixed(2),
    value.min.toFixed(2),
    value.max.toFixed(2),
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

/** Выполнить команду CLI; возвращает код выхода. */
export async function main(argv: string[]): Promise<number> {
  const [command] = argv;

  if (!command || command === "--help" || command === "-h" || command === "help") {
    console.log(CLI_USAGE);
    return 0;
  }

  try {
    const args = parseArgs(argv.slice(1));
    switch (command) {
      case "run":
        return await commandRun(args);
      case "sweep":
        return await commandSweep(args);
      case "compare":
        return await commandCompare(args);
      default:
        console.error(`Unknown command: ${command}`);
        console.error(CLI_USAGE);
        return 1;
    }
  } catch (error) {
    if (error instanceof ScenarioError) {
      console.error(error.message);
      return 2;
    }
    console.error((error as Error).message);
    return 2;
  }
}
