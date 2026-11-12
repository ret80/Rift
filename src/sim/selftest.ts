/**
 * selftest — быстрые проверки инвариантов симулятора без игрового прогона.
 *
 * Запуск: `npm run sim:selftest`. Проверки растут по шагам плана:
 * RNG (шаг 1), потоки и счётчики, детерминизм мира (шаг 5+).
 * Любая упавшая проверка даёт ненулевой код выхода.
 */

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { GameWorld } from "../game/core/GameWorld";
import { AFFIXES } from "../game/balance/affixes";
import { EnemyKind, enemyDefFor } from "../game/balance";
import { AgentControls, emptyPlayerIntent, type PlayerControls } from "../game/core/PlayerControls";
import { SessionRecorder } from "../game/core/SessionRecorder";
import {
  parseSessionJsonl,
  recordToJsonl,
  SessionRecordError,
  type BehaviorSample,
  type SessionRecordV1,
} from "../game/core/SessionRecord";
import { extractProfile } from "../game/sim/BehaviorProfile";
import { CALIBRATION_DEFAULTS, calibrate } from "../game/sim/Calibrate";
import { profileDistance } from "../game/sim/ProfileDistance";
import { scenarioFromSession } from "../game/sim/SessionStore";
import { hashSnapshot, takeSnapshot } from "../game/sim/Snapshot";
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
import { compareSnapshots, executeScenario } from "../game/sim/execute";
import { aggregateMetrics, type RunResult } from "../game/sim/RunResult";
import {
  WaveStateMachine,
  anchorCountFor,
  waveTypeFor,
} from "../game/waves/WaveStateMachine";
import {
  ScenarioError,
  parseScenario,
  scenarioHash,
  scenarioSeedSet,
  type Scenario,
} from "../game/sim/Scenario";
import { createHeadlessWorld, runHeadless, ticksForSeconds } from "./runner";
import { WeaponManager } from "../game/weapons/WeaponManager";
import { createWeaponRegistry } from "../game/weapons/WeaponRegistry";
import { WEAPON_CATALOG, WEAPON_IDS } from "../game/weapons/WeaponCatalog";
import { applyUpgrades, defaultUpgrades } from "../game/upgrades";
import { DOCTRINES } from "../game/meta/doctrines";
import { mergeMetaBonuses, noMetaBonuses } from "../game/meta/types";
import {
  MAX_THREAT_LEVEL,
  clampThreatLevel,
  threatLevelDef,
} from "../game/meta/ascension";
import { WaveOrchestrator } from "../game/waves/WaveOrchestrator";
import { WaveFlowSystem } from "../game/ecs/systems/WaveFlowSystem";
import type { BulletSpawn } from "../game/ecs";

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
  let shots = 0;
  world.eventBus.subscribe("player_shot", () => shots++);
  clockTicks(world, 600);
  // Элиты могут убить агента до 600-го тика: смерть останавливает мир,
  // поэтому проверяем либо полный прогон, либо штатное завершение забега.
  expect(
    world.tickIndex === 600 || world.fsm.is("dying", "over"),
    `tickIndex=${world.tickIndex}, fsm=${world.fsm.state}`,
  );
  expect(world.ecs.enemies().length > 0, "враги не заспавнились");
  expect(shots > 0, "игрок не сделал ни одного выстрела");
});

check("Elite affixes: на 5-й волне гарантированная элита получает аффикс", () => {
  const world = createHeadlessWorld({ seed: 12345, startWave: 5 });
  try {
    world.spawnEnemy(EnemyKind.Drone, 0, 0, null);
    const enemy = world.ecs.enemies().find((e) => e.marker.kind === EnemyKind.Drone);
    expect(enemy !== undefined, "элита не заспавнилась");
    expect(enemy!.marker.affix !== null, "на 5-й волне нет гарантированной элиты");

    const affix = AFFIXES[enemy!.marker.affix!];
    const base = enemyDefFor(EnemyKind.Drone, 5);
    expect(
      Math.abs(enemy!.life.max - base.hp * affix.hpMult) < 1e-9,
      `HP элиты ${enemy!.life.max} вместо ${base.hp * affix.hpMult}`,
    );
    expect(
      Math.abs(enemy!.marker.speed - base.speed * affix.speedMult) < 1e-9,
      `speed элиты ${enemy!.marker.speed} вместо ${base.speed * affix.speedMult}`,
    );

    // Щит — отдельный слой над HP: даже смертельный удар сначала снимает его.
    const hpBefore = enemy!.life.remaining;
    enemy!.marker.shieldHp = enemy!.life.max;
    enemy!.marker.maxShieldHp = enemy!.life.max;
    world.ecs.damageEnemy(enemy!.marker.ecsId ?? "", 1);
    expectEqual(enemy!.life.remaining, hpBefore, "щит не поглотил урон");
    expect(enemy!.marker.shieldHp < enemy!.life.max, "щит не уменьшился");
  } finally {
    world.destroy();
  }
});

check("WaveStateMachine: objective-тип волны явный и стабильный", () => {
  expectEqual(waveTypeFor(3), "objective", "wave 3");
  expectEqual(waveTypeFor(6), "objective", "wave 6");
  expectEqual(waveTypeFor(10), "combat", "wave 10");
  expectEqual(anchorCountFor(3), 2, "anchors wave 3");
  expectEqual(anchorCountFor(6), 3, "anchors wave 6");
  expectEqual(anchorCountFor(4), 0, "anchors wave 4");

  const machine = new WaveStateMachine();
  machine.init(3, 30);
  expectEqual(machine.waveType, "objective", "init wave 3");
  machine.advance();
  expectEqual(machine.waveType, "combat", "advance wave 4");
  machine.reset(9);
  expectEqual(machine.waveType, "objective", "reset wave 9");
});

check("GameWorld: якоря появляются после активации зоны и остаются внутри неё", () => {
  const objective = createHeadlessWorld({ seed: 1, startWave: 3 });
  const combat = createHeadlessWorld({ seed: 1, startWave: 4 });
  try {
    expectEqual(objective.waveOrchestrator.waveType, "objective", "wave 3 type");
    // До активации зоны у арены нет радиуса — якоря ставить некуда.
    expectEqual(objective.anchorSystem.getAnchors().length, 0, "до активации зоны якорей нет");
    for (let i = 0; i < 10; i++) objective.tick(FIXED_DT);
    expectEqual(objective.anchorSystem.getAnchors().length, 2, "wave 3 anchors");
    const zone = objective.waveOrchestrator.zoneState;
    for (const anchor of objective.anchorSystem.getAnchors()) {
      const dist = Math.hypot(anchor.x - zone.x, anchor.y - zone.y);
      expect(dist <= zone.radius, `якорь вне зоны: ${dist.toFixed(1)} > ${zone.radius.toFixed(1)}`);
    }
    // Живой якорь держит разлом открытым и выпускает подкрепления.
    for (let i = 0; i < 300; i++) objective.tick(FIXED_DT);
    const spawned = objective.anchorSystem.getAnchors().reduce((sum, a) => sum + a.spawned, 0);
    expect(spawned > 0, "разлом не выпустил подкреплений");
    expectEqual(combat.waveOrchestrator.waveType, "combat", "wave 4 type");
    expectEqual(combat.anchorSystem.getAnchors().length, 0, "wave 4 anchors");
  } finally {
    objective.destroy();
    combat.destroy();
  }
});

check("WaveFlowSystem: objective-волна закрывается по последнему якорю", () => {
  // Регрессия: зачистка проверялась только по enemy_killed, поэтому волна
  // залипала, если игрок убивал всех врагов раньше якорей.
  const orchestrator = new WaveOrchestrator({
    hooks: {
      onBanner: () => {},
      onToast: () => {},
      hitPlayerRaw: () => {},
      hitPlayerShielded: () => {},
      shakeScreen: () => {},
      onWaveAdvanced: () => {},
    },
    playerMaxSpeed: 300,
    getPlayerMaxHp: () => 100,
  });
  orchestrator.initWave(0, 0, 3, 10, "objective");

  let anchorsDestroyed = false;
  const flow = new WaveFlowSystem({
    orchestrator,
    scoringSystem: { addRunTime: () => {}, killedWave: 10 },
    spawnSystem: { allocated: 10 },
    upgradeSystem: { getApplied: () => 1 as never },
    countdownSystem: { isCountdownActive: () => false },
    getEnemyList: () => [],
    getPlayerPosition: () => ({ x: 0, y: 0 }),
    anchorSystem: {
      hasAnchors: () => true,
      allDestroyed: () => anchorsDestroyed,
    },
  });

  flow.updateZoneAndWaves(FIXED_DT);
  expectEqual(orchestrator.waveState, "active", "волна ждёт якоря");

  anchorsDestroyed = true;
  flow.updateZoneAndWaves(FIXED_DT);
  expectEqual(orchestrator.waveState, "cleared", "волна закрылась по якорям");
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
      altFiring: false,
      consumeAbility() {
        abilityCalls++;
        return false;
      },
      consumeBoost() {
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
  // Волна выше стартовой и 20 с боя: на 1-й волне 24 врага умирают за
  // время прогона при любом темпе огня, и разница DPS схлопывается в ноль
  // не из-за баланса, а из-за нехватки целей.
  const base = parseScenario({ ...smokeScenarioRaw(), startWave: 10 });
  const boosted = parseScenario({
    ...smokeScenarioRaw(),
    startWave: 10,
    upgrades: { fireRate: 3 },
  });
  // 8 seed, а не 4: любая правка ИИ меняет последовательность бросков
  // боевого потока, и на коротком окне в 20 с разница DPS по seed-ам стала
  // шумнее. Утверждение то же («побед больше, чем поражений»), но выборка
  // вдвое больше — проверка от этого строже, а не мягче.
  const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
  const baseline = fakeRunResult(base, seeds, 1200);
  const current = fakeRunResult(boosted, seeds, 1200);
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

/* ============================== Session records ============================== */

const FIXTURE_PATH = fileURLToPath(
  new URL("../game/sim/__fixtures__/session-600.jsonl", import.meta.url),
);

function readFixture(): SessionRecordV1 {
  return parseSessionJsonl(readFileSync(FIXTURE_PATH, "utf8"));
}

/** Ожидать `SessionRecordError` на испорченной записи. */
function expectRecordError(text: string, message: string): void {
  try {
    parseSessionJsonl(text);
  } catch (error) {
    expect(error instanceof SessionRecordError, `${message}: ${String(error)}`);
    return;
  }
  throw new Error(`${message}: ошибки не было`);
}

/** Строки JSONL фикстуры как объекты. */
function fixtureEvents(): Record<string, unknown>[] {
  return readFileSync(FIXTURE_PATH, "utf8")
    .trimEnd()
    .split("\n")
    .map((line) => JSON.parse(line) as Record<string, unknown>);
}

function eventsToJsonl(events: readonly Record<string, unknown>[]): string {
  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

check("SessionRecord: JSONL round-trip сохраняет запись", () => {
  const original = readFixture();
  const again = parseSessionJsonl(recordToJsonl(original));
  expectEqual(again.sessionId, original.sessionId, "sessionId");
  expectEqual(again.run.ticks, original.run.ticks, "ticks");
  expectEqual(again.intents.length, original.intents.length, "intents");
  expectEqual(again.samples.length, original.samples.length, "samples");
  expectEqual(
    again.checkpoints.map((cp) => `${cp.tick}:${cp.hash}`).join(","),
    original.checkpoints.map((cp) => `${cp.tick}:${cp.hash}`).join(","),
    "checkpoints",
  );
  expectEqual(
    JSON.stringify(again.meta.upgrades),
    JSON.stringify(original.meta.upgrades),
    "upgrades",
  );
});

check("SessionRecorder: onFinalize срабатывает один раз при stop", () => {
  let saved: SessionRecordV1 | null = null;
  const recorder = new SessionRecorder({
    gitSha: "test",
    sessionId: "selftest",
    onFinalize: (record) => {
      saved = record;
    },
  });
  recorder.arm();
  const world = createHeadlessWorld({
    seed: 1,
    recorder,
    agent: (rng) => createPlayerAgent("evade", {}, rng),
  });
  clockTicks(world, 10);
  recorder.stop(world, "user_stop");
  recorder.stop(world, "user_stop");
  world.destroy();

  expect(saved !== null, "onFinalize не вызван");
  expectEqual(saved!.run.ticks, 10, "тиков в записи");
  expectEqual(saved!.run.startTick, 0, "startTick armed-записи");
  expectEqual(saved!.run.replayable, true, "armed-запись должна быть replayable");
  expectEqual(saved!.end?.reason, "user_stop", "причина завершения");
});

check("SessionRecorder: partial-запись помечается replayable=false", () => {
  let saved: SessionRecordV1 | null = null;
  const recorder = new SessionRecorder({
    gitSha: "test",
    sessionId: "partial",
    onFinalize: (record) => {
      saved = record;
    },
  });
  const world = createHeadlessWorld({
    seed: 2,
    recorder,
    agent: (rng) => createPlayerAgent("evade", {}, rng),
  });
  clockTicks(world, 5);
  recorder.start(world);
  clockTicks(world, 5);
  recorder.stop(world, "user_stop");
  world.destroy();

  expect(saved !== null, "onFinalize не вызван");
  expectEqual(saved!.run.startTick, 5, "startTick partial-записи");
  expectEqual(saved!.run.replayable, false, "partial-запись не должна быть replayable");
});

check("SessionRecord: валидатор ловит мутации схемы", () => {
  const original = fixtureEvents();

  const unknownVersion = original.map((event) => ({ ...event }));
  unknownVersion[0].schemaVersion = 2;
  expectRecordError(eventsToJsonl(unknownVersion), "неизвестная schemaVersion");

  const brokenReplay = original.map((event) => ({ ...event }));
  const run = brokenReplay.find((event) => event.type === "run")!;
  run.startTick = 1;
  run.replayable = true;
  expectRecordError(eventsToJsonl(brokenReplay), "replayable при startTick>0");

  const missingChunk = original.filter(
    (event) => !(event.type === "intents" && event.fromTick === 0),
  );
  expectRecordError(eventsToJsonl(missingChunk), "пропуск чанка интентов");

  const decreasingSamples = original.map((event) => ({ ...event }));
  const samples = decreasingSamples.find((event) => event.type === "samples")!;
  const items = samples.items as BehaviorSample[];
  expect(items.length > 1, "в фикстуре должно быть больше одного сэмпла");
  const mutated = items.map((item, index) =>
    index === 1 ? { ...item, tick: -1 } : item,
  );
  samples.items = mutated;
  expectRecordError(eventsToJsonl(decreasingSamples), "убывающие сэмплы");

  const unknownEvent = [...original, { type: "mystery" }];
  expectRecordError(eventsToJsonl(unknownEvent), "неизвестный тип события");

  const noVersion = original.map((event) => ({ ...event }));
  delete noVersion[0].schemaVersion;
  expectRecordError(eventsToJsonl(noVersion), "нет schemaVersion");

  expectRecordError('{"type":"session",\n', "битый JSON");

  const wrongTicks = original.map((event) => ({ ...event }));
  const runEvent = wrongTicks.find((event) => event.type === "run")!;
  runEvent.ticks = Number(runEvent.ticks) + 1;
  expectRecordError(eventsToJsonl(wrongTicks), "ticks не совпадает с концами интентов");

  const shortIntents = original.map((event) => ({ ...event }));
  const lastChunk = [...shortIntents]
    .reverse()
    .find((event) => event.type === "intents")!;
  lastChunk.items = (lastChunk.items as unknown[]).slice(0, -1);
  expectRecordError(eventsToJsonl(shortIntents), "интентов меньше ticks");
});

check("SessionRecorder: запись не меняет мир", () => {
  // Миры создаются последовательно: id сущностей сбрасываются на каждом мире.
  const clean = createHeadlessWorld({
    seed: 777,
    agent: (rng) => createPlayerAgent("evade", {}, rng),
  });
  clockTicks(clean, 300);
  const cleanHash = hashSnapshot(takeSnapshot(clean));
  clean.destroy();

  const recorder = new SessionRecorder({ gitSha: "test", sessionId: "noop" });
  recorder.arm();
  const recorded = createHeadlessWorld({
    seed: 777,
    recorder,
    agent: (rng) => createPlayerAgent("evade", {}, rng),
  });
  clockTicks(recorded, 300);
  const recordedHash = hashSnapshot(takeSnapshot(recorded));
  recorded.destroy();

  expectEqual(recordedHash, cleanHash, "мир с записью и без");
});

check("BalanceOverrides: нейтральные множители не меняют прогон", () => {
  const plain = parseScenario(smokeScenarioRaw());
  const neutral = parseScenario({
    ...smokeScenarioRaw(),
    balance: { enemyHpMult: 1, enemyDamageMult: 1 },
  });
  const first = executeScenario(plain, { ticks: 300 });
  const second = executeScenario(neutral, { ticks: 300 });
  try {
    expectEqual(
      first.snapshotHashes.join(","),
      second.snapshotHashes.join(","),
      "хэши при balance=1.0",
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});

/** Параметры врагов в первом тике, где они появились. */
interface EnemySpawnStats {
  hp: number[];
  contact: number[];
  bolt: number[];
}

function firstEnemyStats(mult: number): EnemySpawnStats {
  const empty: EnemySpawnStats = { hp: [], contact: [], bolt: [] };
  const world = runHeadless({
    seed: 12345,
    ticks: 300,
    balance: { enemyHpMult: mult, enemyDamageMult: mult },
    waveComposition: { drone: 1 },
    onTick: (current) => {
      if (empty.hp.length > 0) return;
      const enemies = current.ecs.enemies();
      if (enemies.length === 0) return;
      empty.hp = enemies.map((enemy) => enemy.life.max);
      empty.contact = enemies.map((enemy) => enemy.marker.contact);
      empty.bolt = enemies.map((enemy) => enemy.marker.boltDmg);
    },
  });
  world.destroy();
  return empty;
}

check("BalanceOverrides: множители повышают HP и урон врагов", () => {
  const base = firstEnemyStats(1);
  const boosted = firstEnemyStats(1.1);
  expect(base.hp.length > 0, "на первом тике волны не появилось врагов");
  expectEqual(boosted.hp.length, base.hp.length, "число врагов");
  for (let i = 0; i < base.hp.length; i++) {
    expect(
      Math.abs(boosted.hp[i] - base.hp[i] * 1.1) < 1e-9,
      `HP ${boosted.hp[i]} вместо ${base.hp[i] * 1.1}`,
    );
    expect(
      Math.abs(boosted.contact[i] - base.contact[i] * 1.1) < 1e-9,
      `contact ${boosted.contact[i]} вместо ${base.contact[i] * 1.1}`,
    );
    // Болт есть не у всех видов; сравниваем только непустые значения.
    if (base.bolt[i] > 0) {
      expect(
        Math.abs(boosted.bolt[i] - base.bolt[i] * 1.1) < 1e-9,
        `bolt ${boosted.bolt[i]} вместо ${base.bolt[i] * 1.1}`,
      );
    }
  }
});

/** Прогнать запись через ReplayAgent и вернуть снимки с балансом. */
function replayResult(record: SessionRecordV1, enemyHpMult = 1) {
  const base = scenarioFromSession(record, {
    balance: { enemyHpMult, enemyDamageMult: 1 },
  });
  const scenario: Scenario = {
    ...base,
    player: { agent: "replay", replay: record.intents },
  };
  return executeScenario(scenario, { ticks: record.run.ticks });
}

check("Replay: запись воспроизводится бит-в-бит при том же балансе", () => {
  const record = readFixture();
  const result = replayResult(record, 1);
  try {
    // `agent` — вход реплея, а не состояние мира: его счётчик не сравниваем.
    const divergence = compareSnapshots(
      record.checkpoints.map((checkpoint) => checkpoint.snapshot),
      result.snapshots,
      { ignoreStreams: ["agent"] },
    );
    expectEqual(divergence, null, `расхождение ${JSON.stringify(divergence)}`);
  } finally {
    result.dispose();
  }
});

check("Replay: enemyHpMult=1.1 расходится до 600-го тика", () => {
  const record = readFixture();
  const result = replayResult(record, 1.1);
  try {
    const divergence = compareSnapshots(
      record.checkpoints.map((checkpoint) => checkpoint.snapshot),
      result.snapshots,
      { ignoreStreams: ["agent"] },
    );
    expect(divergence !== null, "реплей с другим HP не разошёлся");
    expect(divergence!.tick <= 600, `первое расхождение на тике ${divergence!.tick}`);
  } finally {
    result.dispose();
  }
});

/* ============================== Профиль и калибровка ============================== */

/** Синтетические сэмплы с известными ставками и дистанцией. */
function syntheticSamples(count = 300): BehaviorSample[] {
  const samples: BehaviorSample[] = [];
  for (let tick = 0; tick < count; tick++) {
    samples.push({
      tick,
      player: { x: 960, y: 540, vx: 0, vy: 0, hp: 100 },
      nearestEnemy: { dx: 400, dy: 0, dist: 400 },
      threat: null,
      zone: { dist: 342, radius: 360, active: true },
      aimAngle: 0,
      firing: true,
      ability: tick % 30 === 0,
      axis: { x: 0.5, y: 0 },
    });
  }
  return samples;
}

check("BehaviorProfile: синтетические сэмплы дают ожидаемые ставки", () => {
  const profile = extractProfile(syntheticSamples(), "synthetic");
  expect(profile.manualAim, "manualAim должен быть true");
  expectEqual(profile.fireRatio.value, 1, "fireRatio");
  expect(Math.abs(profile.preferredRange.p50 - 400) < 1e-6, `range=${profile.preferredRange.p50}`);
  expect(profile.zoneEdgeRatio.value > 0.99, `zoneEdge=${profile.zoneEdgeRatio.value}`);
  expect(Math.abs(profile.moveIntensity.value - 0.5) < 0.01, `move=${profile.moveIntensity.value}`);
  expect(
    Math.abs(profile.abilityPerMinute.value - 120) < 1e-6,
    `ability=${profile.abilityPerMinute.value}`,
  );
});

check("Calibrate: детерминирован и уважает границы", () => {
  const profile = extractProfile(syntheticSamples(), "synthetic");
  const first = calibrate(profile);
  const second = calibrate(profile);
  expectEqual(JSON.stringify(first), JSON.stringify(second), "два вызова calibrate");
  expect(first.agent.params.fireRange >= 180 && first.agent.params.fireRange <= 900, "fireRange");
  expect(first.agent.params.aimJitter >= 0.005 && first.agent.params.aimJitter <= 0.25, "aimJitter");

  const noisier = calibrate({
    ...profile,
    aimError: { ...profile.aimError, p50: profile.aimError.p50 + 0.1 },
  });
  expect(
    noisier.agent.params.aimJitter > first.agent.params.aimJitter,
    "рост aimError не увеличил aimJitter",
  );

  const farther = calibrate({
    ...profile,
    preferredRange: { ...profile.preferredRange, p90: profile.preferredRange.p90 + 200 },
  });
  expect(
    farther.agent.params.fireRange > first.agent.params.fireRange,
    "рост preferredRange не увеличил fireRange",
  );

  const empty = calibrate(extractProfile([], "empty"));
  expectEqual(empty.agent.params.reactionTime, 0.15, "дефолт reactionTime на пустом профиле");
});

check("BehaviorProfile: детерминирован, без NaN, пустой — low", () => {
  const profile = extractProfile(syntheticSamples(), "synthetic");
  expectEqual(
    JSON.stringify(profile),
    JSON.stringify(extractProfile(syntheticSamples(), "synthetic")),
    "два извлечения профиля",
  );
  const walk = (value: unknown, path: string): void => {
    if (typeof value === "number") {
      expect(Number.isFinite(value), `${path} = ${value}`);
      return;
    }
    if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) walk(child, `${path}.${key}`);
    }
  };
  walk(profile, "profile");

  const empty = extractProfile([], "empty");
  expectEqual(empty.fireRatio.confidence, "low", "confidence пустого профиля");
  expect(empty.warnings.length > 0, "пустой профиль должен предупреждать");
});

check("ProfileDistance: идентичные профили → 0, разные → > 0", () => {
  const base = extractProfile(syntheticSamples(), "synthetic");
  const shifted = extractProfile(
    syntheticSamples().map((sample) => ({ ...sample, firing: false })),
    "synthetic",
  );
  expectEqual(profileDistance(base, base), 0, "расстояние до себя");
  expect(profileDistance(base, shifted) > 0.1, `расстояние=${profileDistance(base, shifted)}`);

  const reactionShift = {
    ...base,
    reactionTime: {
      ...base.reactionTime,
      p50: base.reactionTime.p50 + 0.2,
      p90: base.reactionTime.p90 + 0.2,
    },
  };
  expect(
    profileDistance(base, reactionShift) >= 0.15,
    `сдвиг reactionTime дал ${profileDistance(base, reactionShift)}`,
  );
});

check("EvadeAgent: явные дефолты не меняют поведение", () => {
  const raw = smokeScenarioRaw();
  const implicit = parseScenario({ ...raw, player: { agent: "evade" } });
  const explicit = parseScenario({
    ...raw,
    player: { agent: "evade", ...CALIBRATION_DEFAULTS },
  });
  const first = executeScenario(implicit, { ticks: 600 });
  const second = executeScenario(explicit, { ticks: 600 });
  try {
    expectEqual(
      first.snapshotHashes.join(","),
      second.snapshotHashes.join(","),
      "дефолты EvadeAgent",
    );
  } finally {
    first.dispose();
    second.dispose();
  }
});

check("Scenario: balance 1.0 не меняет хэш, 1.1 — меняет", async () => {
  const base = smokeScenario();
  const neutral = parseScenario({
    ...smokeScenarioRaw(),
    balance: { enemyHpMult: 1, enemyDamageMult: 1 },
  });
  const boosted = parseScenario({
    ...smokeScenarioRaw(),
    balance: { enemyHpMult: 1.1 },
  });
  expectEqual(await scenarioHash(base), await scenarioHash(neutral), "нейтральный баланс");
  expect(
    (await scenarioHash(base)) !== (await scenarioHash(boosted)),
    "хэш не изменился при enemyHpMult=1.1",
  );
});

check("Scenario: невалидные множители баланса отклоняются", () => {
  for (const bad of [0, Number.NaN, 5]) {
    let failed = false;
    try {
      parseScenario({ ...smokeScenarioRaw(), balance: { enemyHpMult: bad } });
    } catch (error) {
      failed = error instanceof ScenarioError;
    }
    expect(failed, `enemyHpMult=${bad} должен быть отклонён`);
  }
});

check("WeaponCatalog: реестр покрывает все виды оружия", () => {
  const registry = createWeaponRegistry();
  expectEqual(Object.keys(registry).length, WEAPON_IDS.length, "число видов оружия");
  for (const id of WEAPON_IDS) {
    expectEqual(registry[id].id, id, `оружие ${id}`);
    expectEqual(registry[id].meta.icon, WEAPON_CATALOG[id].icon, `иконка ${id}`);
  }
  expect(WEAPON_IDS.length >= 8, "в каталоге меньше 8 видов оружия");
});

check("Орудия: слотов хватает на весь арсенал", () => {
  expectEqual(applyUpgrades(defaultUpgrades()).weaponSlots, 1, "стартовые слоты");
  expectEqual(
    applyUpgrades({ ...defaultUpgrades(), guns: 6 }).weaponSlots,
    WEAPON_IDS.length - 1,
    "слоты при максимуме орудий",
  );
});

check("Мета: доктрина и уровень угрозы меняют стартовые значения", () => {
  const baseHp = applyUpgrades(defaultUpgrades()).baseHp;
  const bulwark = DOCTRINES.find((doctrine) => doctrine.id === "bulwark");
  expect(bulwark !== undefined, "доктрина bulwark отсутствует");
  const tanky = applyUpgrades(
    defaultUpgrades(),
    mergeMetaBonuses(noMetaBonuses(), bulwark!.effect),
  );
  expectEqual(tanky.baseHp, Math.round(baseHp * 1.25), "корпус с доктриной");
  expect(tanky.speedMult < 1, "цена доктрины не применилась");

  const gunner = DOCTRINES.find((doctrine) => doctrine.id === "gunner");
  expect(gunner !== undefined, "доктрина gunner отсутствует");
  const armed = applyUpgrades(
    defaultUpgrades(),
    mergeMetaBonuses(noMetaBonuses(), gunner!.effect),
  );
  expectEqual(armed.weaponSlots, 2, "слот оружия от доктрины");

  expectEqual(clampThreatLevel(-5), 0, "нижняя граница TL");
  expectEqual(clampThreatLevel(999), MAX_THREAT_LEVEL, "верхняя граница TL");
  expectEqual(threatLevelDef(5).hpMult, 1.75, "корпус врагов на TL 5");
  expectEqual(threatLevelDef(5).creditsMult, 2, "кредиты на TL 5");
});

check("Альтернативный огонь: интент агента и залп пушки", () => {
  const agent = new AgentControls();
  expectEqual(agent.altFiring, false, "altFiring по умолчанию");
  agent.setIntent({ ...emptyPlayerIntent(), altFiring: true });
  expectEqual(agent.altFiring, true, "altFiring из намерения агента");

  const bullets: BulletSpawn[] = [];
  const manager = new WeaponManager(
    {
      getPlayer: () => ({ x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100 }),
      getEnemies: () => [],
      addBullet: (b) => bullets.push(b),
      getDrones: () => [],
      addAllyDrone: () => {},
      getBonuses: () => ({ rateMult: 1, rateT: 0, extraBarrels: 0 }),
      damageEnemy: () => false,
    },
    () => {},
    createRngStream(11),
    createRngStream(12),
  );

  manager.setManualAim(0);
  manager.setManualAltFiring(true);
  manager.process(FIXED_DT);

  expect(bullets.length >= 5, `альтернативный огонь дал ${bullets.length} снарядов`);
  expect(
    bullets.every((b) => b.life !== undefined && b.life > 0),
    "у картечи не ограничена дальность",
  );

  const salvo = bullets.length;
  bullets.length = 0;
  manager.process(FIXED_DT);
  expectEqual(bullets.length, 0, "залп повторился до перезарядки");
  expect(salvo >= 5, `в залпе ${salvo} снарядов`);
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
