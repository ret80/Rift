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
import { hashSnapshot, type Divergence } from "../game/sim/Snapshot";
import {
  describeSession,
  listSessions,
  readSessionFile,
  scenarioFromSession,
} from "../game/sim/SessionStore";
import type { SessionRecordV1 } from "../game/core/SessionRecord";
import {
  extractProfile,
  type BehaviorProfile,
  type DistributionFeature,
  type RateFeature,
} from "../game/sim/BehaviorProfile";
import { calibrate, type CalibrationResult } from "../game/sim/Calibrate";
import { profileDistance } from "../game/sim/ProfileDistance";
import {
  formatBalance,
  validateBalanceOverrides,
  type BalanceOverrides,
} from "../game/balance/BalanceOverrides";

export const CLI_USAGE = `Rift simulation harness

Usage:
  npm run sim -- <command> [options]

Commands:
  run <scenario> --seed <n> [--runs <n>] [--expect-identical] [--out <file>]
        Прогнать сценарий на одном seed-наборе и напечатать метрики.
  run --from-session <file> [--agent default|calibrated|replay]
      [--calibration <file>] [--seed <n>] [--balance <spec>] [--seconds <n>] [--out <file>]
        Прогнать мир из стартового контекста записи.
  sweep <scenario> --seed-range <a..b> [--out <file>]
        Прогнать сценарий на диапазоне мастер-seed и сохранить baseline.
  compare <baseline.json> <current.json> [--fail-on-regression]
        Сравнить два результата paired-разницей и вернуть код 1 при регрессии.
  sessions list [--dir <path>]
  sessions validate <file>
  sessions show <file>
        Список, проверка и сводка JSONL-записей.
  profile <file> [--json]
        Извлечь поведенческий профиль записи (измеренные значения).
  replay <file> [--balance <spec>] [--out <file>]
        Повторить запись и найти первое расхождение с checkpoint-ами.
  calibrate <file> [--balance <spec>] [--dry-run] [--out <file>]
        Профиль → параметры EvadeAgent → матрица calibrated/default → отчёт.

Balance spec: "enemyHpMult=1.0,1.05,1.1,1.2" или с ; для нескольких ключей:
  "enemyHpMult=1.0,1.1;enemyDamageMult=1.0,1.1".

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

const VALUE_FLAGS = new Set([
  "--seed",
  "--runs",
  "--out",
  "--seed-range",
  "--seconds",
  "--dir",
  "--from-session",
  "--agent",
  "--calibration",
  "--balance",
]);

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
  const fromSession = args.values.get("--from-session");
  if (fromSession) return commandRunFromSession(args, fromSession);

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

/* ============================== Sessions / profile ============================== */

/** Разобрать спеку множителей в матрицу прогонов. */
function parseBalanceMatrix(
  raw: string | undefined,
  fallback: BalanceOverrides[] = [{}],
): BalanceOverrides[] {
  if (!raw) return fallback;
  let matrix: BalanceOverrides[] = [{}];
  for (const part of raw.split(";").map((value) => value.trim()).filter(Boolean)) {
    const [key, values] = part.split("=");
    if (!key || !values) {
      throw new Error(`--balance: ожидается ключ=значение, получено "${part}"`);
    }
    if (key !== "enemyHpMult" && key !== "enemyDamageMult") {
      throw new Error(`--balance: неизвестный множитель "${key}"`);
    }
    const numbers = values.split(",").map((value) => Number(value.trim()));
    if (numbers.some((value) => !Number.isFinite(value))) {
      throw new Error(`--balance: "${values}" содержит не число`);
    }
    matrix = matrix.flatMap((base) =>
      numbers.map((value) => ({ ...base, [key]: value })),
    );
  }
  for (const entry of matrix) {
    const issues = validateBalanceOverrides(entry);
    if (issues.length > 0) throw new Error(issues.join("\n"));
  }
  return matrix;
}

function formatDistribution(name: string, feature: DistributionFeature): string {
  return [
    name.padEnd(16),
    feature.p25.toFixed(3).padStart(8),
    feature.p50.toFixed(3).padStart(8),
    feature.p75.toFixed(3).padStart(8),
    feature.p90.toFixed(3).padStart(8),
    String(feature.n).padStart(6),
    feature.confidence.padStart(8),
  ].join("  ");
}

function formatRate(name: string, feature: RateFeature): string {
  return [
    name.padEnd(16),
    feature.value.toFixed(3).padStart(8),
    "".padStart(8),
    "".padStart(8),
    "".padStart(8),
    String(feature.n).padStart(6),
    feature.confidence.padStart(8),
  ].join("  ");
}

/** Таблица профиля: у распределений перцентили, у ставок — значение. */
function formatProfileTable(profile: BehaviorProfile): string {
  const header = [
    "feature".padEnd(16),
    "value/p25".padStart(8),
    "p50".padStart(8),
    "p75".padStart(8),
    "p90".padStart(8),
    "n".padStart(6),
    "confidence".padStart(8),
  ].join("  ");
  return [
    header,
    "-".repeat(header.length),
    formatDistribution("reactionTime", profile.reactionTime),
    formatDistribution("aimError", profile.aimError),
    formatDistribution("preferredRange", profile.preferredRange),
    formatRate("fireRatio", profile.fireRatio),
    formatRate("zoneEdgeRatio", profile.zoneEdgeRatio),
    formatRate("abilityPerMinute", profile.abilityPerMinute),
    formatRate("moveIntensity", profile.moveIntensity),
  ].join("\n");
}

function readCalibrationFile(path: string): CalibrationResult {
  let json: unknown;
  try {
    json = JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(`Не удалось прочитать калибровку ${path}: ${(error as Error).message}`);
  }
  // Принимаем и чистый CalibrationResult, и отчёт `calibrate`, где он лежит
  // в поле `calibration`: отдельного файла калибровки не требуется.
  const data = json as Partial<CalibrationResult> & { calibration?: CalibrationResult };
  const candidate = data?.calibration ?? data;
  if (
    !candidate ||
    candidate.agent?.kind !== "evade" ||
    typeof candidate.agent.params !== "object" ||
    candidate.agent.params === null
  ) {
    throw new Error(`${path}: не похоже на CalibrationResult`);
  }
  return candidate as CalibrationResult;
}

function commandSessions(args: ParsedArgs): number {
  const sub = args.positional[0];
  if (sub === "list") {
    const entries = listSessions(args.values.get("--dir"));
    if (entries.length === 0) {
      console.log("записей нет");
      return 0;
    }
    for (const { path, record } of entries) {
      console.log(
        [
          record.sessionId.padEnd(24),
          record.createdAt.slice(0, 19),
          `seed=${record.seed.master}`.padEnd(14),
          `ticks=${record.run.ticks}`.padEnd(12),
          record.run.replayable ? "replayable" : "partial",
          record.run.endReason ?? "missing",
          path,
        ].join("  "),
      );
    }
    console.log(`\nвсего: ${entries.length}`);
    return 0;
  }

  const path = args.positional[1];
  if (!sub || !path) throw new Error("sessions: нужны подкоманда и файл (validate|show <file>)");
  // Ошибка чтения записи — код 1 (невалидный вход), а не 2 (ошибка команды).
  let record: SessionRecordV1;
  try {
    record = readSessionFile(path);
  } catch (error) {
    console.error((error as Error).message);
    return 1;
  }
  if (sub === "validate") {
    console.log(`ok: ${path}`);
    console.log(
      `schemaVersion ${record.schemaVersion}, intents ${record.intents.length}, ` +
        `checkpoints ${record.checkpoints.length}`,
    );
    return 0;
  }
  if (sub === "show") {
    console.log(describeSession(record).join("\n"));
    return 0;
  }
  throw new Error(`sessions: неизвестная подкоманда "${sub}"`);
}

function commandProfile(args: ParsedArgs): number {
  const path = args.positional[0];
  if (!path) throw new Error("profile: укажите путь к записи");
  const record = readSessionFile(path);
  const profile = extractProfile(record.samples, record.sessionId);
  if (args.flags.has("--json")) {
    console.log(JSON.stringify(profile, null, 2));
    return 0;
  }
  console.log(`Профиль ${record.sessionId} (${record.samples.length} сэмплов)\n`);
  console.log(formatProfileTable(profile));
  console.log(`\nmanualAim ${profile.manualAim}`);
  if (profile.warnings.length > 0) {
    console.log("\nПредупреждения:");
    for (const warning of profile.warnings) console.log(`  - ${warning}`);
  }
  return 0;
}

/* ============================== Replay ============================== */

interface ReplayReport {
  sessionId: string;
  balance: string;
  ticks: number;
  firstDivergenceTick: number | null;
  firstDivergenceField: string | null;
  validTicks: number;
  validRatio: number;
  metrics: RunMetrics;
}

/** Повторить запись и сравнить с checkpoint-ами. */
function replaySession(record: SessionRecordV1, balance?: BalanceOverrides): ReplayReport {
  if (!record.run.replayable || record.run.startTick !== 0) {
    throw new Error(
      `Запись ${record.sessionId} начата не с начала забега ` +
        `(startTick=${record.run.startTick}): точный реплей невозможен`,
    );
  }
  if (record.checkpoints.length === 0) {
    throw new Error(`Запись ${record.sessionId} не содержит checkpoint-ов: сравнивать не с чем`);
  }
  for (const checkpoint of record.checkpoints) {
    const actual = hashSnapshot(checkpoint.snapshot);
    if (actual !== checkpoint.hash) {
      throw new Error(
        `checkpoint на тике ${checkpoint.tick} повреждён: hash=${checkpoint.hash}, ожидался ${actual}`,
      );
    }
  }

  const scenario = scenarioFromSession(record, { balance });
  const replayScenario: Scenario = {
    ...scenario,
    player: { agent: "replay", replay: record.intents },
  };
  const result = executeScenario(replayScenario, { ticks: record.run.ticks });
  try {
    const divergence = compareSnapshots(
      record.checkpoints.map((checkpoint) => checkpoint.snapshot),
      result.snapshots,
      { ignoreStreams: ["agent"] },
    );
    const validTicks = divergence ? divergence.tick : result.ticks;
    return {
      sessionId: record.sessionId,
      balance: formatBalance(balance ?? record.run.balance),
      ticks: result.ticks,
      firstDivergenceTick: divergence ? divergence.tick : null,
      firstDivergenceField: divergence ? divergence.field : null,
      validTicks,
      validRatio: result.ticks > 0 ? validTicks / result.ticks : 0,
      metrics: result.metrics,
    };
  } finally {
    result.dispose();
  }
}

function commandReplay(args: ParsedArgs): number {
  const path = args.positional[0];
  if (!path) throw new Error("replay: укажите путь к записи");
  const record = readSessionFile(path);
  const balances = parseBalanceMatrix(args.values.get("--balance"), [record.run.balance]);
  const reports = balances.map((balance) => replaySession(record, balance));

  for (const report of reports) {
    console.log(`\n${report.balance}`);
    console.log(
      report.firstDivergenceTick === null
        ? `  точное совпадение на ${report.ticks} тиках`
        : `  первое расхождение: тик ${report.firstDivergenceTick} ` +
          `(${report.firstDivergenceField}); валидно ${report.validTicks}/${report.ticks} ` +
          `(${(report.validRatio * 100).toFixed(1)}%)`,
    );
    console.log(
      `  метрики${report.firstDivergenceTick === null ? "" : " (только до границы валидны)"}: ` +
        `damageTaken=${report.metrics.damageTaken.toFixed(1)} ` +
        `survival=${report.metrics.survivalTime.toFixed(1)} ` +
        `wave=${report.metrics.waveReached}`,
    );
  }

  const out = args.values.get("--out");
  if (out) {
    const target = resolve(process.cwd(), out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(reports, null, 2)}\n`, "utf8");
    console.log(`\nJSON: ${target}`);
  }
  return 0;
}

/* ============================== Calibration ============================== */

interface CalibrationReport {
  version: 1;
  sessionId: string;
  ticks: number;
  seeds: number[];
  thresholds: { dGood: number; dAccept: number; dImprovement: number };
  profile: BehaviorProfile;
  calibration: CalibrationResult;
  replay: { r0: ReplayReport | null; r1: ReplayReport | null };
  matrix: MatrixRow[];
  summary: {
    dCalibratedMedian: number;
    dDefaultMedian: number;
    improvedSeeds: number[];
    balanceStepsExpected: number;
    balanceStepsTotal: number;
    checks: Record<string, boolean>;
  };
  warnings: string[];
}

interface MatrixRow {
  balance: string;
  enemyHpMult: number;
  seed: number;
  dCalibrated: number;
  dDefault: number;
  calibrated: RunMetrics;
  defaultAgent: RunMetrics;
  samples: number;
}

function median(values: number[]): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function runProfile(
  scenario: Scenario,
  ticks: number,
  recordProfile: BehaviorProfile,
): { distance: number; metrics: RunMetrics; samples: number } {
  const result = executeScenario(scenario, { ticks, collectSamples: true });
  try {
    const samples = result.samples ?? [];
    const profile = extractProfile(samples, recordProfile.sourceSessionId);
    return {
      distance: profileDistance(profile, recordProfile),
      metrics: result.metrics,
      samples: samples.length,
    };
  } finally {
    result.dispose();
  }
}

function commandCalibrate(args: ParsedArgs): number {
  const path = args.positional[0];
  if (!path) throw new Error("calibrate: укажите путь к записи");
  const record = readSessionFile(path);
  const profile = extractProfile(record.samples, record.sessionId);
  const calibration = calibrate(profile);

  if (args.flags.has("--dry-run")) {
    console.log(`Профиль ${record.sessionId}\n`);
    console.log(formatProfileTable(profile));
    console.log("\nПараметры EvadeAgent:");
    for (const [key, value] of Object.entries(calibration.agent.params)) {
      console.log(`  ${key.padEnd(22)} ${value}`);
    }
    console.log("\nОбоснование:");
    for (const [key, value] of Object.entries(calibration.rationale)) {
      console.log(`  ${key}: ${value}`);
    }
    if (calibration.warnings.length > 0) {
      console.log("\nПредупреждения:");
      for (const warning of calibration.warnings) console.log(`  - ${warning}`);
    }
    return 0;
  }

  const ticks = record.run.ticks;
  const runs = readInteger(args.values, "--runs") ?? 3;
  if (runs < 1 || runs > 10) {
    throw new Error("calibrate --runs: ожидается 1..10");
  }
  const seeds = Array.from(
    { length: runs },
    (_, offset) => (record.seed.master + offset) >>> 0,
  );
  const balances = parseBalanceMatrix(args.values.get("--balance"), [
    { enemyHpMult: 1 },
    { enemyHpMult: 1.05 },
    { enemyHpMult: 1.1 },
    { enemyHpMult: 1.2 },
  ]);

  const rows: MatrixRow[] = [];
  for (const balance of balances) {
    for (const seed of seeds) {
      const base = scenarioFromSession(record, { seed, balance });
      const calibratedScenario: Scenario = {
        ...base,
        player: { agent: "evade", ...calibration.agent.params },
      };
      const defaultScenario: Scenario = { ...base, player: { agent: "evade" } };
      const calibrated = runProfile(calibratedScenario, ticks, profile);
      const defaultAgent = runProfile(defaultScenario, ticks, profile);
      rows.push({
        balance: formatBalance(balance),
        enemyHpMult: balance.enemyHpMult ?? 1,
        seed,
        dCalibrated: calibrated.distance,
        dDefault: defaultAgent.distance,
        calibrated: calibrated.metrics,
        defaultAgent: defaultAgent.metrics,
        samples: calibrated.samples,
      });
      console.log(
        `  hp×${(balance.enemyHpMult ?? 1).toFixed(2)} seed=${seed}  ` +
          `D_cal=${calibrated.distance.toFixed(3)}  ` +
          `D_def=${defaultAgent.distance.toFixed(3)}`,
      );
    }
  }

  const replayR0 = record.run.replayable ? replaySession(record) : null;
  const replayR1 = record.run.replayable
    ? replaySession(record, { ...record.run.balance, enemyHpMult: 1.1 })
    : null;

  const dCalMedian = median(rows.map((row) => row.dCalibrated));
  const dDefMedian = median(rows.map((row) => row.dDefault));
  const seedImprovements = seeds.filter((seed) => {
    const forSeed = rows.filter((row) => row.seed === seed);
    return median(forSeed.map((row) => row.dCalibrated)) < median(forSeed.map((row) => row.dDefault)) - 0.05;
  });

  // Отклик на баланс считается по группам с одинаковым набором множителей.
  const byBalance = new Map<string, MatrixRow[]>();
  for (const row of rows) {
    const list = byBalance.get(row.balance) ?? [];
    list.push(row);
    byBalance.set(row.balance, list);
  }
  const balanceGroups = [...byBalance.entries()].sort(
    (a, b) => a[1][0].enemyHpMult - b[1][0].enemyHpMult,
  );
  let expectedSteps = 0;
  for (let i = 1; i < balanceGroups.length; i++) {
    const low = balanceGroups[i - 1][1];
    const high = balanceGroups[i][1];
    const damageRose =
      median(high.map((row) => row.calibrated.damageTaken)) >
      median(low.map((row) => row.calibrated.damageTaken));
    const survivalFell =
      median(high.map((row) => row.calibrated.survivalTime)) <
      median(low.map((row) => row.calibrated.survivalTime));
    // Равенство не считается откликом: иначе «баланс не влияет» проходил бы чек.
    if (damageRose || survivalFell) expectedSteps++;
  }

  const checks = {
    replayExact: replayR0 !== null && replayR0.firstDivergenceTick === null,
    replayDiverges:
      replayR1 !== null &&
      replayR1.firstDivergenceTick !== null &&
      replayR1.firstDivergenceTick < 600,
    distanceGood: dCalMedian <= 0.25,
    improvesOverDefault: seedImprovements.length >= Math.min(2, seeds.length),
    balanceResponds:
      balanceGroups.length < 2 ||
      expectedSteps >= Math.max(1, balanceGroups.length - 2),
  };

  const report: CalibrationReport = {
    version: 1 as const,
    sessionId: record.sessionId,
    ticks,
    seeds,
    thresholds: { dGood: 0.25, dAccept: 0.4, dImprovement: 0.05 },
    profile,
    calibration,
    replay: { r0: replayR0, r1: replayR1 },
    matrix: rows,
    summary: {
      dCalibratedMedian: dCalMedian,
      dDefaultMedian: dDefMedian,
      improvedSeeds: seedImprovements,
      balanceStepsExpected: expectedSteps,
      balanceStepsTotal: Math.max(0, balanceGroups.length - 1),
      checks,
    },
    warnings: [
      ...calibration.warnings,
      "одна запись — один стиль: это не основание для балансировочных выводов",
    ],
  };

  console.log(`\nD_cal median ${dCalMedian.toFixed(3)}, D_def median ${dDefMedian.toFixed(3)}`);
  console.log(`улучшение против default: ${seedImprovements.length}/${seeds.length} seed`);
  if (replayR0) {
    console.log(
      `R0: ${
        replayR0.firstDivergenceTick === null
          ? "точное совпадение"
          : `расхождение на тике ${replayR0.firstDivergenceTick}`
      }`,
    );
  }
  if (replayR1) {
    console.log(
      `R1: ${
        replayR1.firstDivergenceTick === null
          ? "ОШИБКА: реплей не разошёлся"
          : `расхождение на тике ${replayR1.firstDivergenceTick}`
      }`,
    );
  }
  console.log("\nЧек-лист:");
  for (const [name, ok] of Object.entries(checks)) {
    console.log(`  ${ok ? "ok  " : "FAIL"} ${name}`);
  }

  const out = args.values.get("--out");
  if (out) {
    const target = resolve(process.cwd(), out);
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, `${JSON.stringify(report, null, 2)}\n`, "utf8");
    const markdownPath = target.replace(/\.json$/i, ".md");
    writeFileSync(markdownPath, formatCalibrationMarkdown(report), "utf8");
    console.log(`\nJSON: ${target}`);
    console.log(`MD:   ${markdownPath}`);
  }
  return 0;
}

function formatCalibrationMarkdown(report: CalibrationReport): string {
  const lines: string[] = [];
  lines.push(`# Калибровка агента по записи ${report.sessionId}`, "");
  lines.push(`Тиков: ${report.ticks}; seed: ${report.seeds.join(", ")}`, "");
  lines.push("## Профиль записи", "", "```", formatProfileTable(report.profile), "```", "");
  lines.push("## Параметры EvadeAgent", "");
  for (const [key, value] of Object.entries(report.calibration.agent.params)) {
    lines.push(`- \`${key}\`: ${value}`);
  }
  lines.push("", "## Матрица прогонов", "");
  lines.push("| баланс | seed | D calibrated | D default | Δ | survival cal | damage cal | wave | ability |");
  lines.push("|---|---|---|---|---|---|---|---|---|");
  for (const row of report.matrix) {
    lines.push(
      `| ${row.balance} | ${row.seed} ` +
        `| ${row.dCalibrated.toFixed(3)} | ${row.dDefault.toFixed(3)} ` +
        `| ${(row.dDefault - row.dCalibrated).toFixed(3)} ` +
        `| ${row.calibrated.survivalTime.toFixed(1)} ` +
        `| ${row.calibrated.damageTaken.toFixed(1)} ` +
        `| ${row.calibrated.waveReached} | ${row.calibrated.abilityUses} |`,
    );
  }
  lines.push("", "## Воспроизведение", "");
  for (const [name, replay] of [
    ["R0 (тот же баланс)", report.replay.r0],
    ["R1 (enemyHpMult=1.10)", report.replay.r1],
  ] as const) {
    if (!replay) {
      lines.push(`- ${name}: запись неполная, реплей недоступен`);
      continue;
    }
    lines.push(
      replay.firstDivergenceTick === null
        ? `- ${name}: точное совпадение на ${replay.ticks} тиках`
        : `- ${name}: первое расхождение на тике ${replay.firstDivergenceTick}; ` +
          `валидно ${replay.validTicks}/${replay.ticks} ` +
          `(${(replay.validRatio * 100).toFixed(1)}%)`,
    );
  }
  lines.push("", "## Итог", "");
  lines.push(`- D_cal median: ${report.summary.dCalibratedMedian.toFixed(3)}`);
  lines.push(`- D_def median: ${report.summary.dDefaultMedian.toFixed(3)}`);
  lines.push(`- улучшение против default: ${report.summary.improvedSeeds.length}/${report.seeds.length} seed`);
  lines.push(`- реакция на баланс: ${report.summary.balanceStepsExpected}/${report.summary.balanceStepsTotal} шагов`);
  for (const [name, ok] of Object.entries(report.summary.checks)) {
    lines.push(`- ${ok ? "ok" : "FAIL"}: ${name}`);
  }
  lines.push("", "## Ограничения", "");
  for (const warning of report.warnings) lines.push(`- ${warning}`);
  lines.push("");
  return lines.join("\n");
}

function withPlayer(scenario: Scenario, player: Scenario["player"]): Scenario {
  return { ...scenario, player };
}

async function commandRunFromSession(args: ParsedArgs, path: string): Promise<number> {
  const record = readSessionFile(path);
  const seed = readInteger(args.values, "--seed") ?? record.seed.master;
  const balances = parseBalanceMatrix(args.values.get("--balance"), [record.run.balance]);
  if (balances.length !== 1) {
    throw new Error("run --from-session: допустим ровно один набор множителей баланса");
  }
  const agent = args.values.get("--agent") ?? "default";
  let player: Scenario["player"];
  if (agent === "default") {
    player = { agent: "evade" };
  } else if (agent === "calibrated") {
    const calibrationPath = args.values.get("--calibration");
    if (!calibrationPath) {
      throw new Error("run --agent calibrated: обязателен --calibration <file>");
    }
    const calibration = readCalibrationFile(calibrationPath);
    player = { agent: "evade", ...calibration.agent.params };
  } else if (agent === "replay") {
    if (!record.run.replayable || record.run.startTick !== 0) {
      throw new Error("run --agent replay: запись начата не с начала забега");
    }
    player = { agent: "replay", replay: record.intents };
  } else {
    throw new Error(`run --agent: ожидается default | calibrated | replay, получено "${agent}"`);
  }

  const scenario = withPlayer(
    scenarioFromSession(record, { seed, balance: balances[0] }),
    player,
  );
  const ticksOverride = args.values.get("--seconds")
    ? Math.max(1, Math.round(Number(args.values.get("--seconds")) * SCENARIO_TICK_RATE))
    : record.run.ticks;
  if (!Number.isFinite(ticksOverride) || ticksOverride <= 0) {
    throw new Error("run --seconds: ожидается положительное число");
  }

  const result = executeScenario(scenario, { ticks: ticksOverride });
  try {
    const seedSet = scenarioSeedSet(scenario);
    const runResult = buildRunResult(
      scenario,
      await scenarioHash(scenario),
      [{ seed, result }],
      ticksOverride,
      null,
    );
    console.log(formatMetricsTable(runResult));
    console.log(`seedSet.master ${seedSet.master}`);
    writeResult(runResult, args.values.get("--out"));
  } finally {
    result.dispose();
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
      case "sessions":
        return commandSessions(args);
      case "profile":
        return commandProfile(args);
      case "replay":
        return commandReplay(args);
      case "calibrate":
        return commandCalibrate(args);
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
