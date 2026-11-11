/**
 * Fixture — генерация синтетической записи для CI и replay-тестов.
 *
 * Запись делает тот же `SessionRecorder`, что и браузер, но играет
 * headless-агентом EvadeAgent. `createdAt` у записи нестабилен, поэтому
 * проверка фикстуры сравнивает запись без него.
 */

import type { SessionRecordV1 } from "../core/SessionRecord";
import { SessionRecorder } from "../core/SessionRecorder";
import { SimulationClock } from "../core/SimulationClock";
import { createHeadlessWorld, ticksForSeconds } from "../../sim/runner";
import { createPlayerAgent } from "./agents";

/** Время записи фикстуры, секунды. */
export const SESSION_FIXTURE_SECONDS = 10;
/** Seed фикстуры. */
export const SESSION_FIXTURE_SEED = 12345;
/** Путь к закоммиченной фикстуре относительно корня проекта. */
export const SESSION_FIXTURE_PATH = "src/game/sim/__fixtures__/session-600.jsonl";

/** Параметры генерации фикстуры. */
export interface GenerateSessionFixtureOptions {
  seconds: number;
  seed: number;
  gitSha: string;
}

/**
 * Сгенерировать запись, не записывая её на диск.
 *
 * Вызывающий код сам решает, сохранить файл или сравнить с уже
 * закоммиченной фикстурой. Мир уничтожается до возврата.
 */
export function generateSessionFixture(
  options: GenerateSessionFixtureOptions,
): SessionRecordV1 {
  const ticks = ticksForSeconds(options.seconds);
  const recorder = new SessionRecorder({
    gitSha: options.gitSha,
    sessionId: `synthetic-${options.seed}-${ticks}`,
  });
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
  world.destroy();
  if (!record) throw new Error("рекордер не собрал запись");
  return record;
}
