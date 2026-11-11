/**
 * Проверка актуальности session-фикстуры.
 *
 * Генерирует запись теми же настройками, что и `npm run sim:fixture`, и
 * сравнивает её с закоммиченным JSONL. Если поведение симуляции изменилось,
 * проверка падает и просит осознанно перегенерировать фикстуру — иначе
 * replay-тест в `sim:selftest` начнёт расходиться позже и неочевидно.
 *
 * `createdAt` игнорируется: это единственное поле, которое меняется от
 * запуска к запуску. Остальные данные записи должны совпадать бит-в-бит.
 *
 * Запуск: `npm run check:session-fixture`.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  parseSessionJsonl,
  type SessionRecordV1,
} from "../src/game/core/SessionRecord";
import {
  generateSessionFixture,
  SESSION_FIXTURE_PATH,
  SESSION_FIXTURE_SECONDS,
  SESSION_FIXTURE_SEED,
} from "../src/game/sim/Fixture";

const FIXTURE_ABS = fileURLToPath(
  new URL(`../${SESSION_FIXTURE_PATH}`, import.meta.url),
);

/** Нормализовать запись: убрать единственное нестабильное поле. */
function normalized(record: SessionRecordV1): string {
  return JSON.stringify({ ...record, createdAt: "" });
}

/** Первое расхождение для понятного сообщения в CI. */
function firstDivergence(
  expected: SessionRecordV1,
  actual: SessionRecordV1,
): string {
  if (expected.intents.length !== actual.intents.length) {
    return `intents: ${expected.intents.length} → ${actual.intents.length}`;
  }
  for (let i = 0; i < expected.intents.length; i++) {
    if (JSON.stringify(expected.intents[i]) !== JSON.stringify(actual.intents[i])) {
      return `intent at tick ${i}`;
    }
  }

  if (expected.samples.length !== actual.samples.length) {
    return `samples: ${expected.samples.length} → ${actual.samples.length}`;
  }
  for (let i = 0; i < expected.samples.length; i++) {
    if (JSON.stringify(expected.samples[i]) !== JSON.stringify(actual.samples[i])) {
      return `sample at tick ${expected.samples[i]?.tick ?? i}`;
    }
  }

  const checkpoints = Math.max(
    expected.checkpoints.length,
    actual.checkpoints.length,
  );
  for (let i = 0; i < checkpoints; i++) {
    const a = expected.checkpoints[i];
    const b = actual.checkpoints[i];
    if (!a || !b) return `checkpoint #${i}: missing`;
    if (a.tick !== b.tick) return `checkpoint #${i}: tick ${a.tick} → ${b.tick}`;
    if (a.hash !== b.hash) return `checkpoint tick ${a.tick}: hash changed`;
    if (JSON.stringify(a.snapshot) !== JSON.stringify(b.snapshot)) {
      return `checkpoint tick ${a.tick}: snapshot changed`;
    }
  }

  return "session metadata";
}

function main(): number {
  const expected = parseSessionJsonl(readFileSync(FIXTURE_ABS, "utf8"));
  const actual = generateSessionFixture({
    seconds: SESSION_FIXTURE_SECONDS,
    seed: SESSION_FIXTURE_SEED,
    gitSha: "fixture",
  });

  if (normalized(expected) === normalized(actual)) {
    console.log(`session fixture is up to date (${expected.run.ticks} ticks)`);
    return 0;
  }

  console.error("session fixture drift detected");
  console.error(`reason: ${firstDivergence(expected, actual)}`);
  console.error("simulation behavior changed; re-baseline intentionally with:");
  console.error(
    `  npm run sim:fixture -- --out ${SESSION_FIXTURE_PATH} --seconds ${SESSION_FIXTURE_SECONDS} --seed ${SESSION_FIXTURE_SEED}`,
  );
  console.error("review the replay diff and commit the regenerated fixture");
  return 1;
}

try {
  process.exitCode = main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
