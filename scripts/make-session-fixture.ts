/**
 * Генератор синтетической записи для CI.
 *
 * Пишет JSONL тем же `SessionRecorder`, что и браузер, но играет
 * headless-агентом EvadeAgent. Это проверяет конвейер, но не заменяет
 * человеческую запись: стиль агента — не стиль игрока.
 *
 * Запуск: `npm run sim:fixture -- --out <path> --seconds 10 --seed 12345`.
 */

import { SessionRecorder } from "../src/game/core/SessionRecorder";
import { SimulationClock } from "../src/game/core/SimulationClock";
import { createPlayerAgent } from "../src/game/sim/agents";
import { writeSessionFile } from "../src/game/sim/SessionStore";
import { createHeadlessWorld, ticksForSeconds } from "../src/sim/runner";

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
  const seconds = Number(values.get("--seconds") ?? 10);
  const seed = Number(values.get("--seed") ?? 12345);
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
  const ticks = ticksForSeconds(options.seconds);
  const recorder = new SessionRecorder({
    gitSha: options.gitSha,
    sessionId: `synthetic-${options.seed}-${ticks}`,
  });
  // Запись взводится до startRun: только так она начинается с тика 0.
  recorder.arm();

  const world = createHeadlessWorld({
    seed: options.seed,
    recorder,
    agent: (rng) => createPlayerAgent("evade", {}, rng),
  });

  const clock = new SimulationClock();
  clock.runTicks(ticks, (dt) => world.tick(dt));
  recorder.stop(world, "user_stop");

  const record = recorder.toRecord();
  if (!record) throw new Error("рекордер не собрал запись");
  const path = writeSessionFile(record, options.out);
  world.destroy();

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
