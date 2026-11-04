/**
 * selftest — быстрые проверки инвариантов симулятора без игрового прогона.
 *
 * Запуск: `npm run sim:selftest`. Проверки растут по шагам плана:
 * RNG (шаг 1), потоки и счётчики, детерминизм мира (шаг 5+).
 * Любая упавшая проверка даёт ненулевой код выхода.
 */

import type { GameWorld } from "../game/core/GameWorld";
import type { PlayerControls } from "../game/core/PlayerControls";
import {
  RNG_STREAMS,
  createRandomSeed,
  createRngStream,
  createRngStreams,
  createSeedSet,
  deriveSeed,
  isSeedSet,
  type SeedSet,
} from "../game/core/rng";
import { FIXED_DT, MAX_CATCH_UP, SimulationClock } from "../game/core/SimulationClock";
import { PLAYER_AGENT_KINDS, ReplayAgent, createPlayerAgent } from "../game/sim/agents";
import { compareResults } from "../game/sim/Compare";
import { executeScenario } from "../game/sim/execute";
import { aggregateMetrics, type RunResult } from "../game/sim/RunResult";
import {
  ScenarioError,
  parseScenario,
  scenarioHash,
  scenarioSeedSet,
  type Scenario,
} from "../game/sim/Scenario";
import { createHeadlessWorld, ticksForSeconds } from "./runner";

type CheckFn = () => void | Promise<void>;

interface Check {
  name: string;
  fn: CheckFn;
}

const checks: Check[] = [];

function check(name: string, fn: CheckFn): void {
  checks.push({ name, fn });
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function expectEqual<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) {
    throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
  }
}

function sequence(rng: { next(): number }, count: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(rng.next());
  return out;
}

function sameSequence(a: number[], b: number[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** Прогнать мир на фиксированном шаге. */
function clockTicks(world: GameWorld, count: number): void {
  const clock = new SimulationClock();
  clock.runTicks(count, (dt) => world.tick(dt));
}

/**
 * Компактная сигнатура состояния мира.
 *
 * Временная замена канонического snapshot-хэша (шаг 8): ловит расхождения
 * позиций, HP, счёта и числа RNG-бросков.
 */
function stateSignature(world: GameWorld): string {
  const player = world.getPlayerPosition();
  const enemies = world.ecs
    .enemies()
    .map((e) => [e.marker.kind, round(e.position.x), round(e.position.y), round(e.life.remaining)])
    .sort((a, b) => String(a[0]).localeCompare(String(b[0])) || Number(a[1]) - Number(b[1]));
  const bullets = world.ecs.bullets().map((b) => [round(b.position.x), round(b.position.y)]);
  return JSON.stringify({
    tick: world.tickIndex,
    player: [round(player.x), round(player.y), round(player.vx), round(player.vy)],
    hp: round(world.playerSystem.getHp()),
    score: world.scoringSystem.score,
    wave: world.waveOrchestrator.wave,
    zone: round(world.waveOrchestrator.zoneState.radius),
    enemies,
    bullets,
    draws: world.rngDraws(),
  });
}

/** Число с 4 знаками: сигнатура не зависит от последнего бита float. */
function round(value: number): number {
  return Math.round(value * 10000) / 10000;
}

/** Глубоко заморозить объект (мутация в strict mode бросит). */
function deepFreeze<T>(value: T): T {
  if (value && typeof value === "object") {
    for (const key of Object.keys(value as object)) {
      deepFreeze((value as Record<string, unknown>)[key]);
    }
    Object.freeze(value);
  }
  return value;
}

/* ============================== RNG ============================== */

check("одинаковый seed → одинаковая последовательность 1000 чисел", () => {
  const a = sequence(createRngStream(12345), 1000);
  const b = sequence(createRngStream(12345), 1000);
  expect(sameSequence(a, b), "последовательности одного seed разошлись");
  for (const value of a) {
    expect(value >= 0 && value < 1, `значение вне [0,1): ${value}`);
  }
});

check("разные seed → разные последовательности", () => {
  const a = sequence(createRngStream(1), 100);
  const b = sequence(createRngStream(2), 100);
  expect(!sameSequence(a, b), "разные seed дали одинаковый ряд");
});

check("deriveSeed стабилен для известных значений", () => {
  expectEqual(deriveSeed(12345, "combat"), 241527836, "combat:12345");
  expectEqual(deriveSeed(12345, "spawn"), 2307763317, "spawn:12345");
  expectEqual(deriveSeed(12345, "drops"), 2353422408, "drops:12345");
  expectEqual(deriveSeed(12345, "fx"), 412099138, "fx:12345");
  expectEqual(deriveSeed(12345, "agent"), 1232222247, "agent:12345");
  expectEqual(deriveSeed(0, "spawn"), 139810562, "spawn:0");
});

check("потоки одного SeedSet не совпадают", () => {
  const seeds = createSeedSet(777);
  const seen = new Set<number>();
  for (const stream of RNG_STREAMS) {
    expect(!seen.has(seeds.streams[stream]), `поток ${stream} совпал с другим`);
    seen.add(seeds.streams[stream]);
  }
});

check("SeedSet сериализуется в JSON и обратно без потерь", () => {
  const seeds = createSeedSet(424242);
  const parsed = JSON.parse(JSON.stringify(seeds)) as SeedSet;
  expect(isSeedSet(parsed), "после JSON-круга объект не похож на SeedSet");
  expectEqual(parsed.master, seeds.master, "master");
  for (const stream of RNG_STREAMS) {
    expectEqual(parsed.streams[stream], seeds.streams[stream], `поток ${stream}`);
  }
});

check("int(max) всегда в [0, max)", () => {
  const rng = createRngStream(99);
  for (let i = 0; i < 500; i++) {
    const max = 1 + (i % 17);
    const value = rng.int(max);
    expect(Number.isInteger(value), `int вернул не целое: ${value}`);
    expect(value >= 0 && value < max, `int(${max}) = ${value} вне диапазона`);
  }
  expectEqual(rng.int(0), 0, "int(0)");
});

check("range(a,b) остаётся в [a,b)", () => {
  const rng = createRngStream(5);
  for (let i = 0; i < 200; i++) {
    const value = rng.range(-3, 4);
    expect(value >= -3 && value < 4, `range вышел за границы: ${value}`);
  }
});

check("потоки набора счётчиков независимы и считают броски", () => {
  const streams = createRngStreams(createSeedSet(12345));
  const combat1 = sequence(streams.rng("combat"), 3);
  expectEqual(streams.draws("combat"), 3, "счётчик combat");

  // Броски агента не должны сдвигать боевой поток: четвёртый бросок combat
  // обязан совпасть с четвёртым броском свежего потока.
  sequence(streams.rng("agent"), 50);
  const combat2 = sequence(streams.rng("combat"), 3);
  const reference = sequence(createRngStream(createSeedSet(12345).streams.combat), 4);
  expectEqual(combat2[0], reference[3], "поток combat сдвинулся");
  expectEqual(streams.draws("agent"), 50, "счётчик agent");
  expectEqual(streams.draws("spawn"), 0, "неиспользованный поток насчитал броски");
  expectEqual(combat1.length, 3, "длина первого среза");

  const counts = streams.drawCounts();
  expectEqual(counts.combat, 6, "счётчик combat после второго среза");

  streams.reset();
  expectEqual(streams.draws("combat"), 0, "счётчик не сбросился");
  const afterReset = sequence(streams.rng("combat"), 3);
  expect(
    sameSequence(afterReset, sequence(createRngStream(createSeedSet(12345).streams.combat), 3)),
    "после reset поток не начался заново",
  );
});

check("поток без общего состояния между экземплярами", () => {
  const seeds = createSeedSet(2026);
  const first = createRngStream(seeds.streams.combat);
  const second = createRngStream(seeds.streams.combat);
  for (let i = 0; i < 10; i++) expectEqual(first.next(), second.next(), `бросок ${i}`);
});

check("createRandomSeed возвращает 32-битное целое", () => {
  const seed = createRandomSeed();
  expect(Number.isInteger(seed) && seed >= 0 && seed <= 0xffffffff, `плохой seed: ${seed}`);
});

check("RNG-модуль не использует Math.random", async () => {
  // Статическая проверка текста модуля: геймплейный RNG не должен тянуть
  // глобальную случайность даже случайно.
  const fs = await import("node:fs/promises");
  const path = new URL("../game/core/rng.ts", import.meta.url);
  const source = await fs.readFile(path, "utf8");
  // Комментарии не считаются: важно, что вызовов нет в коде.
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  expect(!code.includes("Math.random"), "rng.ts содержит Math.random");
});

/* ============================== Simulation clock ============================== */

check("SimulationClock: 1/30 делает два тика, 1/144 — один с накоплением", () => {
  const clock = new SimulationClock();
  let ticks = 0;
  const step = () => {
    ticks++;
  };
  expectEqual(clock.advance(1 / 30, step), 2, "1/30 → 2 тика");
  expectEqual(ticks, 2, "шагов за 1/30");

  // 144 Гц медленнее тика: мир накапливает время и тикает раз в ~2.4 кадра.
  const slow = new SimulationClock();
  expectEqual(slow.advance(1 / 144, step), 0, "1-й 1/144 → 0 тиков");
  expectEqual(slow.advance(1 / 144, step), 0, "2-й 1/144 → 0 тиков");
  expectEqual(slow.advance(1 / 144, step), 1, "3-й 1/144 → 1 тик");
});

check("SimulationClock: разный realDt → одинаковое число тиков", () => {
  const count = (realDt: number, steps: number): number => {
    const clock = new SimulationClock();
    let ticks = 0;
    for (let i = 0; i < steps; i++) clock.advance(realDt, () => ticks++);
    return ticks;
  };
  const seconds = 2;
  const a = count(1 / 30, seconds * 30);
  const b = count(1 / 60, seconds * 60);
  const c = count(1 / 144, seconds * 144);
  expectEqual(a, b, "1/30 vs 1/60");
  expectEqual(b, c, "1/60 vs 1/144");
  expectEqual(b, 120, "2 секунды → 120 тиков");
});

check("SimulationClock: пауза не телепортирует мир (maxCatchUp)", () => {
  const clock = new SimulationClock();
  let ticks = 0;
  const made = clock.advance(10, () => ticks++);
  expectEqual(made, MAX_CATCH_UP, "догоняющих тиков не больше maxCatchUp");
  expectEqual(clock.pending, 0, "отставание сброшено");
});

/* ============================== World ============================== */

check("GameWorld создаётся и тикает в Node без DOM", () => {
  expect(typeof (globalThis as { window?: unknown }).window === "undefined", "в Node есть window");
  const world = createHeadlessWorld({ seed: 12345 });
  expectEqual(world.fsm.state, "active", "FSM должна быть active после startRun");
  clockTicks(world, 600);
  expectEqual(world.tickIndex, 600, "tickIndex");
  expect(world.ecs.enemies().length > 0, "враги не заспавнились");
  expect(world.ecs.bullets().length + world.ecs.enemyBullets().length > 0, "нет ни одного выстрела");
});

check("GameWorld.tick требует FIXED_DT", () => {
  const world = createHeadlessWorld({ seed: 1 });
  let threw = false;
  try {
    world.tick(1 / 120);
  } catch {
    threw = true;
  }
  expect(threw, "tick с переменным dt не должен проходить");
});

check("GameWorld использует переданный PlayerControls (custom и planck)", () => {
  // Регрессия шага 9: браузер не передал HumanControls в мир, и мир жил
  // с пустым AgentControls — игрок переставал реагировать на клавиши.
  // Симуляция играет на custom, браузер — на planck, поэтому проверяем оба.
  for (const physics of ["custom", "planck"] as const) {
    const axis = { x: 1, y: 0 };
    let abilityCalls = 0;
    const controls: PlayerControls = {
      axis,
      aimAngle: 0,
      firing: true,
      consumeAbility() {
        abilityCalls++;
        return false;
      },
    };

    const driven = createHeadlessWorld({ seed: 90210, controls, physics });
    const idle = createHeadlessWorld({ seed: 90210, physics });
    expect(driven.controls === controls, `${physics}: мир подставил собственный порт`);

    let shots = 0;
    driven.eventBus.subscribe("player_shot", () => shots++);

    const ticks = 120;
    clockTicks(driven, ticks);
    clockTicks(idle, ticks);

    const moved = Math.hypot(
      driven.getPlayerPosition().x - idle.getPlayerPosition().x,
      driven.getPlayerPosition().y - idle.getPlayerPosition().y,
    );
    expect(moved > 1, `${physics}: ось из порта не дошла до игрока (${moved.toFixed(3)})`);
    expectEqual(abilityCalls, ticks, `${physics}: AbilitySystem не опрашивает порт`);
    expect(shots > 0, `${physics}: firing из порта не дошёл до оружия`);
  }
});

check("10 прогонов с одним seed → одинаковое состояние на каждом 60-м тике", () => {
  const signatures: string[][] = [];
  for (let run = 0; run < 10; run++) {
    const world = createHeadlessWorld({ seed: 424242 });
    const marks: string[] = [];
    for (let tick = 1; tick <= 1800; tick++) {
      world.tick(FIXED_DT);
      if (tick % 60 === 0) marks.push(stateSignature(world));
    }
    signatures.push(marks);
  }
  for (let run = 1; run < signatures.length; run++) {
    for (let i = 0; i < signatures[0].length; i++) {
      expectEqual(
        signatures[run][i],
        signatures[0][i],
        `run ${run}: расхождение на тике ${(i + 1) * 60}`,
      );
    }
  }
});

check("разные seed → разные траектории", () => {
  const a = createHeadlessWorld({ seed: 1 });
  const b = createHeadlessWorld({ seed: 2 });
  clockTicks(a, 600);
  clockTicks(b, 600);
  expect(stateSignature(a) !== stateSignature(b), "два seed дали одинаковое состояние");
});

check("повторный startRun на том же мире воспроизводим", () => {
  const world = createHeadlessWorld({ seed: 777 });
  clockTicks(world, 300);
  const first = stateSignature(world);
  world.startRun();
  clockTicks(world, 300);
  const second = stateSignature(world);
  expectEqual(second, first, "второй забег отличается от первого");
});

check("GameWorld.ts не содержит DOM-вызовов", async () => {
  const fs = await import("node:fs/promises");
  const source = await fs.readFile(new URL("../game/core/GameWorld.ts", import.meta.url), "utf8");
  const code = source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
  for (const forbidden of ["window", "document", "requestAnimationFrame", "performance.now"]) {
    expect(!code.includes(forbidden), `GameWorld.ts содержит ${forbidden}`);
  }
});

/* ============================== Player agents ============================== */

check("OrbitAgent держит радиус и не вылетает из зоны 30 с", () => {
  let damage = 0;
  const world = createHeadlessWorld({
    seed: 12345,
    agent: (rng) => createPlayerAgent("orbit", { radius: 300, direction: 1 }, rng),
  });
  world.eventBus.subscribe("player_damaged", (event) => {
    damage += event.payload.dmg;
  });

  const ticks = ticksForSeconds(30);
  let activeTicks = 0;
  let outsideTicks = 0;
  let radiusSum = 0;
  for (let i = 0; i < ticks; i++) {
    world.tick(FIXED_DT);
    const p = world.getPlayerPosition();
    const zone = world.waveOrchestrator.zoneState;
    if (!zone.active || zone.radius < 80) continue;
    activeTicks++;
    const dist = Math.hypot(p.x - zone.x, p.y - zone.y);
    radiusSum += dist;
    if (dist > zone.radius) outsideTicks++;
  }

  expect(activeTicks > 0, "зона ни разу не активировалась");
  expect(
    outsideTicks / activeTicks < 0.05,
    `орбита выходила за зону ${outsideTicks}/${activeTicks} тиков`,
  );
  const avgRadius = radiusSum / activeTicks;
  expect(Math.abs(avgRadius - 300) < 120, `средний радиус ${avgRadius.toFixed(0)} далёк от 300`);
  expect(damage >= 0, "урон не может быть отрицательным");
});

check("EvadeAgent получает меньше урона, чем RandomAgent (5 seed)", () => {
  const measure = (kind: "evade" | "random", seed: number): number => {
    let damage = 0;
    const world = createHeadlessWorld({
      seed,
      agent: (rng) => createPlayerAgent(kind, { radius: 300 }, rng),
      waveComposition: { fighter: 3 },
    });
    world.eventBus.subscribe("player_damaged", (event) => {
      damage += event.payload.dmg;
    });
    clockTicks(world, ticksForSeconds(30));
    return damage;
  };

  let evade = 0;
  let random = 0;
  for (let seed = 1; seed <= 5; seed++) {
    evade += measure("evade", seed);
    random += measure("random", seed);
  }
  expect(evade < random, `уклонение не помогает: evade ${evade}, random ${random}`);
});

check("RandomAgent воспроизводим при одном seed", () => {
  const trace = (): string => {
    const world = createHeadlessWorld({
      seed: 99,
      agent: (rng) => createPlayerAgent("random", { radius: 300 }, rng),
    });
    clockTicks(world, 600);
    return stateSignature(world);
  };
  expectEqual(trace(), trace(), "решения агента невоспроизводимы");
});

check("агенты не мутируют PlayerView", () => {
  const view = deepFreeze({
    time: 0,
    player: { x: 0, y: 0, vx: 10, vy: 0, hp: 100, maxHp: 100 },
    enemies: [{ x: 200, y: 0, vx: -20, vy: 0, kind: "fighter", hp: 30 }],
    enemyBullets: [{ x: 100, y: 0, vx: -600, vy: 0 }],
    zone: { x: 0, y: 0, radius: 600, active: true },
  });

  for (const kind of PLAYER_AGENT_KINDS) {
    if (kind === "replay") continue;
    const agent = createPlayerAgent(kind, {}, createRngStream(7));
    const intent = agent.update(view, FIXED_DT);
    expect(Number.isFinite(intent.moveX), `${kind}: moveX не число`);
    expect(Number.isFinite(intent.moveY), `${kind}: moveY не число`);
  }
});

check("ReplayAgent воспроизводит записанные намерения", () => {
  const intents = [
    { moveX: 1, moveY: 0, aimAngle: 0.5, firing: true, ability: false },
    { moveX: 0, moveY: -1, aimAngle: null, firing: false, ability: true },
  ];
  const agent = new ReplayAgent(intents);
  const view = {
    time: 0,
    player: { x: 0, y: 0, vx: 0, vy: 0, hp: 1, maxHp: 1 },
    enemies: [],
    enemyBullets: [],
    zone: null,
  };
  expectEqual(agent.update(view, FIXED_DT).moveX, 1, "тик 0");
  expectEqual(agent.update(view, FIXED_DT).moveY, -1, "тик 1");
  expectEqual(agent.update(view, FIXED_DT).firing, false, "запись кончилась");
  agent.reset();
  expectEqual(agent.update(view, FIXED_DT).moveX, 1, "reset");
});

/* ============================== Scenario / metrics ============================== */

/** Маленький сценарий для проверок: тот же формат, что в scenarios/*.json. */
function smokeScenarioRaw(): Record<string, unknown> {
  return {
    name: "selftest-smoke",
    seed: { master: 12345 },
    tickRate: 60,
    duration: 10,
    physics: "custom",
    startWave: 1,
    viewport: { width: 1920, height: 1080 },
    player: { agent: "orbit", radius: 220, direction: 1, reactionTime: 0.15 },
  };
}

function smokeScenario(): Scenario {
  return parseScenario(smokeScenarioRaw());
}

check("Scenario: валидация перечисляет все проблемы", () => {
  let error: unknown = null;
  try {
    parseScenario({
      name: "bad",
      seed: { master: 1 },
      duration: -5,
      physics: "box2d",
      player: { agent: "turbo" },
    });
  } catch (caught) {
    error = caught;
  }
  expect(error instanceof ScenarioError, "ожидалась ScenarioError");
  expectEqual((error as ScenarioError).issues.length, 3, "число проблем в ошибке");
});

check("scenarioHash не зависит от порядка ключей", async () => {
  const straight = smokeScenario();
  const reversed = parseScenario(
    Object.fromEntries(Object.entries(smokeScenarioRaw()).reverse()) as Record<string, unknown>,
  );
  expectEqual(await scenarioHash(straight), await scenarioHash(reversed), "hash сценария");
});

check("executeScenario: один seed → одинаковые хэши снимков", () => {
  const scenario = smokeScenario();
  const first = executeScenario(scenario, { ticks: 600 });
  const second = executeScenario(scenario, { ticks: 600 });
  try {
    expectEqual(
      first.snapshotHashes.join(","),
      second.snapshotHashes.join(","),
      "хэши снимков двух прогонов",
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});

check("MetricsSink считает выстрелы, попадания и урон", () => {
  const result = executeScenario(smokeScenario(), { ticks: 600 });
  try {
    const { shots, hits, damageDealt, survivalTime, rngDraws } = result.metrics;
    expect(shots > 0, "выстрелов не было");
    expect(hits > 0, "попаданий не было");
    expect(damageDealt > 0, "урон не посчитан");
    expect(Math.abs(survivalTime - 10) < 0.01, `survivalTime=${survivalTime}`);
    expect(rngDraws.combat > 0, "поток combat не расходовался");
    expect(rngDraws.agent > 0, "поток agent не расходовался");
  } finally {
    result.dispose();
  }
});

/* ============================== Compare ============================== */

/** Прогнать сценарий на наборе seed и собрать минимальный RunResult. */
function fakeRunResult(
  scenario: Scenario,
  masters: readonly number[],
  ticks: number,
  runtime = "node selftest",
): RunResult {
  const perSeed = masters.map((master) => {
    const result = executeScenario(scenario, {
      seedSet: scenarioSeedSet({ ...scenario, seed: { master } }),
      ticks,
    });
    try {
      return { seed: master, metrics: result.metrics, snapshotHashes: result.snapshotHashes };
    } finally {
      result.dispose();
    }
  });

  return {
    scenario: scenario.name,
    scenarioHash: `test:${scenario.name}`,
    gitSha: "selftest",
    runtime,
    physics: scenario.physics ?? "custom",
    tickRate: 60,
    duration: ticks / 60,
    ticks,
    seed: scenarioSeedSet(scenario),
    runs: perSeed.length,
    identical: true,
    firstDivergenceTick: null,
    metrics: perSeed[0].metrics,
    aggregate: aggregateMetrics(perSeed.map((entry) => entry.metrics)),
    snapshotHashes: perSeed[0].snapshotHashes,
    perSeed,
  };
}

check("aggregateMetrics: одинаковые прогоны → stddev = 0", () => {
  const result = executeScenario(smokeScenario(), { ticks: 300 });
  try {
    const aggregate = aggregateMetrics(Array.from({ length: 10 }, () => result.metrics));
    expect(aggregate.dps.stddev < 1e-12, `stddev dps = ${aggregate.dps.stddev}`);
    expect(aggregate.kills.stddev < 1e-12, `stddev kills = ${aggregate.kills.stddev}`);
  } finally {
    result.dispose();
  }
});

check("compare: одинаковые прогоны → нет регрессий и CI = [0, 0]", () => {
  const scenario = smokeScenario();
  const baseline = fakeRunResult(scenario, [1, 2, 3], 300);
  const current = fakeRunResult({ ...scenario }, [1, 2, 3], 300);
  const report = compareResults(baseline, current);
  expectEqual(report.regressions.length, 0, "регрессии");
  const dps = report.diffs.find((diff) => diff.metric === "dps")!;
  expectEqual(dps.ciLow, 0, "CI low");
  expectEqual(dps.ciHigh, 0, "CI high");
});

check("compare: больше fireRate → DPS растёт на большинстве seed", () => {
  const base = smokeScenario();
  const boosted = parseScenario({ ...smokeScenarioRaw(), upgrades: { fireRate: 3 } });
  const baseline = fakeRunResult(base, [1, 2, 3, 4], 600);
  const current = fakeRunResult(boosted, [1, 2, 3, 4], 600);
  const report = compareResults(baseline, current);
  const dps = report.diffs.find((diff) => diff.metric === "dps")!;
  expect(dps.meanDelta > 0, `ΔDPS=${dps.meanDelta}`);
  expect(dps.wins > dps.losses, `win/loss = ${dps.wins}/${dps.losses}`);
  expect(dps.regression === false, "рост DPS не должен считаться регрессией");
});

check("compare: падение DPS на 10% → регрессия", () => {
  const scenario = smokeScenario();
  const baseline = fakeRunResult(scenario, [1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 300);
  const degraded = baseline.perSeed.map((entry) => ({
    ...entry,
    metrics: {
      ...entry.metrics,
      dps: entry.metrics.dps * 0.9,
      damageDealt: entry.metrics.damageDealt * 0.9,
    },
  }));
  const current = { ...baseline, perSeed: degraded, metrics: degraded[0].metrics };
  const report = compareResults(baseline, current);
  const dps = report.diffs.find((diff) => diff.metric === "dps")!;
  expect(dps.regression, `ΔDPS=${dps.meanDelta}, CI [${dps.ciLow}, ${dps.ciHigh}]`);
  expect(report.regressions.includes("dps"), `регрессии: ${report.regressions.join(", ")}`);
});

check("compare: другой runtime → предупреждение, а не bit-exact", () => {
  const scenario = smokeScenario();
  const baseline = fakeRunResult(scenario, [1, 2], 300, "node 20");
  const current = fakeRunResult(scenario, [1, 2], 300, "node 26");
  const report = compareResults(baseline, current);
  expect(
    report.warnings.some((warning) => warning.includes("Разные runtime")),
    "ожидалось предупреждение о runtime",
  );
});

/* ============================== Runner ============================== */

async function main(): Promise<number> {
  let failed = 0;
  for (const item of checks) {
    try {
      await item.fn();
      console.log(`  ok   ${item.name}`);
    } catch (error) {
      failed++;
      const message = error instanceof Error ? error.message : String(error);
      console.log(`  FAIL ${item.name}\n       ${message}`);
    }
  }

  const total = checks.length;
  console.log(`\n${total - failed}/${total} checks passed`);
  if (failed > 0) {
    console.log("selftest failed");
    return 1;
  }
  console.log("selftest ok");
  return 0;
}

void main().then((code) => {
  process.exitCode = code;
});
