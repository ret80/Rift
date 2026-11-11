/**
 * Генератор синтетической записи для CI.
 *
 * Пишет JSONL тем же `SessionRecorder`, что и браузер, но играет
 * headless-агентом EvadeAgent. Сама генерация живёт в
 * `src/game/sim/Fixture.ts`, чтобы CI-проверка могла получить запись без
 * записи на диск.
 *
 * Запуск: `npm run sim:fixture -- --out <path> --seconds 10 --seed 12345`.
 */

import { writeSessionFile } from "../src/game/sim/SessionStore";
import {
  generateSessionFixture,
  SESSION_FIXTURE_SECONDS,
  SESSION_FIXTURE_SEED,
} from "../src/game/sim/Fixture";
import { ticksForSeconds } from "../src/sim/runner";

interface FixtureOptions {
  out: string;
  seconds: number;
  seed: number;
  gitSha: string;
}

/** Разобрать `--key value` без зависимостей: скрипт живёт вне CLI. */
function parseOptions(argv: readonly string[]): FixtureOptions {
  const values = new Map<string, string>();
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    const value = argv[i + 1];
    if (!key?.startsWith("--") || value === undefined) {
      throw new Error(`ожидалась пара --key value, получено: ${argv.slice(i).join(" ")}`);
    }
    values.set(key, value);
  }
  const seconds = Number(values.get("--seconds") ?? SESSION_FIXTURE_SECONDS);
  const seed = Number(values.get("--seed") ?? SESSION_FIXTURE_SEED);
  if (!Number.isFinite(seconds) || seconds <= 0) {
    throw new Error(`--seconds должен быть > 0, получено ${values.get("--seconds")}`);
  }
  if (!Number.isInteger(seed)) {
    throw new Error(`--seed должен быть целым, получено ${values.get("--seed")}`);
  }
  const ticks = ticksForSeconds(seconds);
  return {
    out: values.get("--out") ?? `sim-results/sessions/synthetic-${ticks}.jsonl`,
    seconds,
    seed,
    gitSha: values.get("--git-sha") ?? "fixture",
  };
}

function main(): number {
  const options = parseOptions(process.argv.slice(2));
  const record = generateSessionFixture({
    seconds: options.seconds,
    seed: options.seed,
    gitSha: options.gitSha,
  });
  const path = writeSessionFile(record, options.out);

  console.log(`session: ${record.sessionId}`);
  console.log(`ticks:   ${record.run.ticks}`);
  console.log(`replay:  ${record.run.replayable}`);
  console.log(`file:    ${path}`);
  return 0;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
