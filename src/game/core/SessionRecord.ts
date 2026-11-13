/**
 * SessionRecord — версионируемый формат записи забега.
 *
 * Единица хранения — сессия: снимок мета-состояния, seed, интенты по тикам,
 * сэмплы поведения и контрольные снимки мира. Источник истины — JSONL:
 * его пишет и браузер, и Node, его можно читать построчно и диффить.
 *
 * Инварианты:
 *   • `intents.length` равно числу вызовов `world.tick` за запись;
 *   • `replayable=true` требует `startTick = 0`;
 *   • неизвестная `schemaVersion` — ошибка, а не «попробуем прочитать».
 */

import {
  isPhysicsEngineId,
  type PhysicsEngineId,
} from "../physics/index";
import { isSeedSet, type SeedSet } from "./rng";
import type { PlayerControls, PlayerIntent } from "./PlayerControls";
import type { DroneLoadout } from "../drones/Drone";
import type { PlayerUpgrades } from "../upgrades";
import type { WeaponLoadout } from "../weapons/Weapon";
import type { RunMetrics } from "../sim/MetricsSink";
import { hashSnapshot, takeSnapshot, type Snapshot } from "../sim/Snapshot";
import type { GameWorld } from "./GameWorld";
import type { ParamProfileId } from "../balance/params/profiles";

/** Текущая версия схемы. */
export const SESSION_SCHEMA_VERSION = 1;

/** Причина завершения записи. */
export type SessionEndReason = "game_over" | "user_stop" | "focus_lost" | "limit";

/** Состояние рекордера для индикатора HUD. */
export type SessionRecorderStatus = "off" | "armed" | "recording";

/** Снимок мета-состояния на старте забега. */
export interface SessionMeta {
  upgrades: PlayerUpgrades;
  weaponLoadout: WeaponLoadout;
  droneLoadout: DroneLoadout;
  bestWave: number;
  physicsEngine: PhysicsEngineId;
}

/** Паспорт сборки: по нему видно, чем писалась запись. */
export interface SessionBuild {
  gitSha: string;
  /** Множители баланса в момент записи (не хэш, а читаемая строка). */
  balanceHash: string;
}

/** Параметры одного забега внутри сессии. */
export interface SessionRunInfo {
  runId: string;
  /** Номер тика мира в момент старта записи (0 — с начала забега). */
  startTick: number;
  /** Точный реплей возможен только с начала забега. */
  replayable: boolean;
  startWave: number;
  testMode: boolean;
  /** Профиль параметров мира; отсутствие — `default`. */
  paramProfile?: ParamProfileId;
  skipCountdown: boolean;
  physics: PhysicsEngineId;
  /** Число вызовов `world.tick` за запись. */
  ticks: number;
  endReason: SessionEndReason | null;
  /** Множители баланса прогона: повтор должен играть в том же мире. */
  balance: { enemyHpMult: number; enemyDamageMult: number };
}

/** Компактный сэмпл поведения на тике. */
export interface BehaviorSample {
  /** Индекс вызова `world.tick` внутри записи (0-based). */
  tick: number;
  player: { x: number; y: number; vx: number; vy: number; hp: number };
  nearestEnemy: { dx: number; dy: number; dist: number } | null;
  threat: { ttc: number; missDistance: number } | null;
  /** dist — расстояние от игрока до центра зоны. */
  zone: { dist: number; radius: number; active: boolean } | null;
  aimAngle: number | null;
  firing: boolean;
  /** true — способность была запрошена и потреблена на этом тике. */
  ability: boolean;
  axis: { x: number; y: number };
}

/** Контрольный снимок мира. */
export interface SessionCheckpoint {
  tick: number;
  hash: string;
  snapshot: Snapshot;
}

/** Финал записи. */
export interface SessionEnd {
  /** Номер тика мира на момент завершения. */
  tick: number;
  reason: SessionEndReason;
  /** Необязательны: браузерная запись не держит MetricsSink. */
  metrics?: RunMetrics;
}

/** Запись сессии v1. */
export interface SessionRecordV1 {
  schemaVersion: 1;
  sessionId: string;
  createdAt: string;
  build: SessionBuild;
  seed: SeedSet;
  meta: SessionMeta;
  run: SessionRunInfo;
  intents: PlayerIntent[];
  samples: BehaviorSample[];
  checkpoints: SessionCheckpoint[];
  end: SessionEnd | null;
}

/** Порт рекордера для `GameWorld`: мир только сообщает о тиках. */
export interface SessionRecorderPort {
  beginTick(world: GameWorld, controls: PlayerControls): void;
  endTick(world: GameWorld): void;
  onRunStart(world: GameWorld): void;
  onRunEnd(reason: SessionEndReason, world: GameWorld): void;
  noteAbility(): void;
}

/* ============================== Сэмпл поведения ============================== */

/** Горизонт прогноза угрозы, секунды (как у EvadeAgent). */
export const SAMPLE_THREAT_HORIZON = 0.9;
/** Радиус, внутри которого снаряд считается опасным, px. */
export const SAMPLE_THREAT_RADIUS = 120;

/**
 * Снять сэмпл поведения.
 *
 * Функция не вызывает RNG и не мутирует мир: запись не должна менять прогон.
 * `ability` передаётся снаружи, потому что второй `consumeAbility()` съел бы
 * нажатие.
 */
export function sampleBehavior(
  world: GameWorld,
  tick: number,
  controls: Pick<PlayerControls, "axis" | "aimAngle" | "firing">,
  ability: boolean,
): BehaviorSample {
  const view = world.buildPlayerView();
  const px = view.player.x;
  const py = view.player.y;

  let nearestEnemy: BehaviorSample["nearestEnemy"] = null;
  let nearestDist = Infinity;
  for (const enemy of view.enemies) {
    if (enemy.hp <= 0) continue;
    const dx = enemy.x - px;
    const dy = enemy.y - py;
    const dist = Math.hypot(dx, dy);
    if (dist < nearestDist) {
      nearestDist = dist;
      nearestEnemy = { dx, dy, dist };
    }
  }

  let threat: BehaviorSample["threat"] = null;
  let bestTtc = Infinity;
  for (const bullet of view.enemyBullets) {
    const relX = bullet.x - px;
    const relY = bullet.y - py;
    const relVx = bullet.vx - view.player.vx;
    const relVy = bullet.vy - view.player.vy;
    const speed2 = relVx * relVx + relVy * relVy;
    if (speed2 < 1e-6) continue;
    const t = -(relX * relVx + relY * relVy) / speed2;
    if (t <= 0 || t > SAMPLE_THREAT_HORIZON || t >= bestTtc) continue;
    const missDistance = Math.hypot(relX + relVx * t, relY + relVy * t);
    if (missDistance > SAMPLE_THREAT_RADIUS) continue;
    bestTtc = t;
    threat = { ttc: t, missDistance };
  }

  const zoneState = view.zone;
  const zone = zoneState
    ? {
        dist: Math.hypot(px - zoneState.x, py - zoneState.y),
        radius: zoneState.radius,
        active: zoneState.active,
      }
    : null;

  return {
    tick,
    player: {
      x: px,
      y: py,
      vx: view.player.vx,
      vy: view.player.vy,
      hp: view.player.hp,
    },
    nearestEnemy,
    threat,
    zone,
    aimAngle: controls.aimAngle,
    firing: controls.firing,
    ability,
    axis: { x: controls.axis.x, y: controls.axis.y },
  };
}

/* ============================== JSONL ============================== */

export type SessionJsonlEvent =
  | {
      type: "session";
      schemaVersion: 1;
      sessionId: string;
      createdAt: string;
      build: SessionBuild;
      seed: SeedSet;
      meta: SessionMeta;
    }
  | ({ type: "run" } & SessionRunInfo)
  | { type: "intents"; fromTick: number; items: PlayerIntent[] }
  | { type: "samples"; fromTick: number; items: BehaviorSample[] }
  | { type: "checkpoint"; tick: number; hash: string; snapshot: Snapshot }
  | { type: "end"; tick: number; reason: SessionEndReason; metrics?: RunMetrics };

/** Размер чанка при сериализации (интенты и сэмплы). */
export const SESSION_CHUNK_SIZE = 600;

/** Разложить запись в JSONL-строки. */
export function recordToJsonl(record: SessionRecordV1): string {
  const events: SessionJsonlEvent[] = [
    {
      type: "session",
      schemaVersion: record.schemaVersion,
      sessionId: record.sessionId,
      createdAt: record.createdAt,
      build: record.build,
      seed: record.seed,
      meta: record.meta,
    },
    { type: "run", ...record.run },
  ];

  for (let from = 0; from < record.intents.length; from += SESSION_CHUNK_SIZE) {
    events.push({
      type: "intents",
      fromTick: from,
      items: record.intents.slice(from, from + SESSION_CHUNK_SIZE),
    });
  }
  for (let from = 0; from < record.samples.length; from += SESSION_CHUNK_SIZE) {
    events.push({
      type: "samples",
      fromTick: from,
      items: record.samples.slice(from, from + SESSION_CHUNK_SIZE),
    });
  }
  for (const checkpoint of record.checkpoints) {
    events.push({
      type: "checkpoint",
      tick: checkpoint.tick,
      hash: checkpoint.hash,
      snapshot: checkpoint.snapshot,
    });
  }
  if (record.end) {
    events.push({
      type: "end",
      tick: record.end.tick,
      reason: record.end.reason,
      ...(record.end.metrics ? { metrics: record.end.metrics } : {}),
    });
  }

  return `${events.map((event) => JSON.stringify(event)).join("\n")}\n`;
}

/** Ошибка чтения записи: всегда с номером строки, если он известен. */
export class SessionRecordError extends Error {
  constructor(
    message: string,
    readonly line?: number,
    readonly field?: string,
  ) {
    super(line === undefined ? message : `строка ${line}: ${message}`);
    this.name = "SessionRecordError";
  }
}

const END_REASONS: readonly SessionEndReason[] = [
  "game_over",
  "user_stop",
  "focus_lost",
  "limit",
];

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isIntent(value: unknown): value is PlayerIntent {
  if (typeof value !== "object" || value === null) return false;
  const intent = value as Record<string, unknown>;
  return (
    isFiniteNumber(intent.moveX) &&
    isFiniteNumber(intent.moveY) &&
    (intent.aimAngle === null || isFiniteNumber(intent.aimAngle)) &&
    typeof intent.firing === "boolean" &&
    typeof intent.ability === "boolean"
  );
}

function isSample(value: unknown): value is BehaviorSample {
  if (typeof value !== "object" || value === null) return false;
  const sample = value as Record<string, unknown>;
  return (
    isFiniteNumber(sample.tick) &&
    typeof sample.player === "object" &&
    sample.player !== null &&
    typeof sample.firing === "boolean" &&
    typeof sample.ability === "boolean" &&
    typeof sample.axis === "object" &&
    sample.axis !== null &&
    (sample.aimAngle === null || isFiniteNumber(sample.aimAngle))
  );
}

/** Выдать ошибку схемы на конкретной строке. */
function fail(line: number, message: string, field?: string): never {
  throw new SessionRecordError(message, line, field);
}

/**
 * Разобрать и провалидировать JSONL-запись.
 *
 * Возвращает нормализованный объект. Любое нарушение контракта — исключение
 * с номером строки; «похоже на v1» не считается достаточным.
 */
export function parseSessionJsonl(text: string): SessionRecordV1 {
  const lines = text.split(/\r?\n/);
  const intents: PlayerIntent[] = [];
  const samples: BehaviorSample[] = [];
  const checkpoints: SessionCheckpoint[] = [];

  let session:
    | {
        schemaVersion: 1;
        sessionId: string;
        createdAt: string;
        build: SessionBuild;
        seed: SeedSet;
        meta: SessionMeta;
      }
    | null = null;
  let run: SessionRunInfo | null = null;
  let end: SessionEnd | null = null;
  let expectedIntents = 0;
  let expectedSamples = 0;

  for (let index = 0; index < lines.length; index++) {
    const lineNumber = index + 1;
    const raw = lines[index].trim();
    if (!raw) continue;

    let event: Record<string, unknown>;
    try {
      event = JSON.parse(raw) as Record<string, unknown>;
    } catch (error) {
      throw new SessionRecordError(
        `битый JSON (${(error as Error).message})`,
        lineNumber,
      );
    }

    const type = event.type;
    if (typeof type !== "string") fail(lineNumber, "событие без type", "type");

    if (session === null) {
      if (type !== "session") fail(lineNumber, "первая строка должна быть type=session", "type");
      const version = event.schemaVersion;
      if (version !== SESSION_SCHEMA_VERSION) {
        fail(
          lineNumber,
          `неизвестная schemaVersion ${String(version)} (ожидается ${SESSION_SCHEMA_VERSION})`,
          "schemaVersion",
        );
      }
      if (typeof event.sessionId !== "string" || !event.sessionId) {
        fail(lineNumber, "sessionId должен быть непустой строкой", "sessionId");
      }
      if (!isSeedSet(event.seed)) fail(lineNumber, "seed не похож на SeedSet", "seed");
      if (typeof event.build !== "object" || event.build === null) {
        fail(lineNumber, "build должен быть объектом", "build");
      }
      if (typeof event.meta !== "object" || event.meta === null) {
        fail(lineNumber, "meta должен быть объектом", "meta");
      }
      session = {
        schemaVersion: 1,
        sessionId: event.sessionId,
        createdAt: typeof event.createdAt === "string" ? event.createdAt : "",
        build: event.build as SessionBuild,
        seed: event.seed,
        meta: event.meta as SessionMeta,
      };
      continue;
    }

    switch (type) {
      case "session":
        fail(lineNumber, "повторное событие session", "type");
        break;

      case "run": {
        if (run !== null) fail(lineNumber, "повторное событие run", "type");
        if (!isFiniteNumber(event.startTick) || event.startTick < 0) {
          fail(lineNumber, "run.startTick должен быть >= 0", "startTick");
        }
        if (typeof event.replayable !== "boolean") {
          fail(lineNumber, "run.replayable должен быть boolean", "replayable");
        }
        if (event.replayable !== (event.startTick === 0)) {
          fail(
            lineNumber,
            "replayable=true требует startTick=0, а startTick>0 требует replayable=false",
            "replayable",
          );
        }
        if (!isFiniteNumber(event.ticks) || event.ticks < 0) {
          fail(lineNumber, "run.ticks должен быть >= 0", "ticks");
        }
        if (typeof event.physics !== "string" || !isPhysicsEngineId(event.physics)) {
          fail(lineNumber, "run.physics: ожидается custom | planck | p2", "physics");
        }
        if (event.endReason !== null && !END_REASONS.includes(event.endReason as SessionEndReason)) {
          fail(lineNumber, "run.endReason: неизвестная причина", "endReason");
        }
        run = {
          runId: typeof event.runId === "string" ? event.runId : "run-1",
          startTick: event.startTick,
          replayable: event.replayable,
          startWave: isFiniteNumber(event.startWave) ? event.startWave : 1,
          testMode: event.testMode === true,
          skipCountdown: event.skipCountdown === true,
          physics: event.physics,
          ticks: event.ticks,
          endReason: (event.endReason as SessionEndReason | null) ?? null,
          balance:
            typeof event.balance === "object" && event.balance !== null
              ? {
                  enemyHpMult: isFiniteNumber((event.balance as { enemyHpMult?: unknown }).enemyHpMult)
                    ? ((event.balance as { enemyHpMult: number }).enemyHpMult)
                    : 1,
                  enemyDamageMult: isFiniteNumber(
                    (event.balance as { enemyDamageMult?: unknown }).enemyDamageMult,
                  )
                    ? ((event.balance as { enemyDamageMult: number }).enemyDamageMult)
                    : 1,
                }
              : { enemyHpMult: 1, enemyDamageMult: 1 },
        };
        break;
      }

      case "intents": {
        if (run === null) fail(lineNumber, "intents до события run", "type");
        if (!isFiniteNumber(event.fromTick)) {
          fail(lineNumber, "intents.fromTick должен быть числом", "fromTick");
        }
        if (event.fromTick !== expectedIntents) {
          fail(
            lineNumber,
            `intents.fromTick=${event.fromTick}, ожидалось ${expectedIntents}`,
            "fromTick",
          );
        }
        if (!Array.isArray(event.items)) {
          fail(lineNumber, "intents.items должен быть массивом", "items");
        }
        for (const item of event.items) {
          if (!isIntent(item)) fail(lineNumber, "невалидный PlayerIntent", "items");
          intents.push(item);
        }
        expectedIntents = intents.length;
        break;
      }

      case "samples": {
        if (run === null) fail(lineNumber, "samples до события run", "type");
        if (!isFiniteNumber(event.fromTick)) {
          fail(lineNumber, "samples.fromTick должен быть числом", "fromTick");
        }
        if (event.fromTick !== expectedSamples) {
          fail(
            lineNumber,
            `samples.fromTick=${event.fromTick}, ожидалось ${expectedSamples}`,
            "fromTick",
          );
        }
        if (!Array.isArray(event.items)) {
          fail(lineNumber, "samples.items должен быть массивом", "items");
        }
        for (const item of event.items) {
          if (!isSample(item)) fail(lineNumber, "невалидный BehaviorSample", "items");
          const previous = samples[samples.length - 1];
          if (previous && item.tick < previous.tick) {
            fail(lineNumber, "samples.tick убывает", "tick");
          }
          samples.push(item);
        }
        expectedSamples = samples.length;
        break;
      }

      case "checkpoint": {
        if (run === null) fail(lineNumber, "checkpoint до события run", "type");
        if (!isFiniteNumber(event.tick)) fail(lineNumber, "checkpoint.tick", "tick");
        if (typeof event.hash !== "string" || !event.hash) {
          fail(lineNumber, "checkpoint.hash должен быть строкой", "hash");
        }
        if (typeof event.snapshot !== "object" || event.snapshot === null) {
          fail(lineNumber, "checkpoint.snapshot должен быть объектом", "snapshot");
        }
        const snapshot = event.snapshot as Snapshot;
        if (!Array.isArray(snapshot.entities)) {
          fail(lineNumber, "checkpoint.snapshot.entities должен быть массивом", "snapshot");
        }
        checkpoints.push({ tick: event.tick, hash: event.hash, snapshot });
        break;
      }

      case "end": {
        if (run === null) fail(lineNumber, "end до события run", "type");
        if (end !== null) fail(lineNumber, "повторное событие end", "type");
        if (!isFiniteNumber(event.tick)) fail(lineNumber, "end.tick", "tick");
        if (!END_REASONS.includes(event.reason as SessionEndReason)) {
          fail(lineNumber, "end.reason: неизвестная причина", "reason");
        }
        if (event.metrics !== undefined && (typeof event.metrics !== "object" || event.metrics === null)) {
          fail(lineNumber, "end.metrics должен быть объектом", "metrics");
        }
        end = {
          tick: event.tick,
          reason: event.reason as SessionEndReason,
          ...(event.metrics ? { metrics: event.metrics as RunMetrics } : {}),
        };
        break;
      }

      default:
        fail(lineNumber, `неизвестный тип события "${String(type)}"`, "type");
    }
  }

  if (session === null) throw new SessionRecordError("пустая запись: нет события session");
  if (run === null) throw new SessionRecordError("в записи нет события run");
  if (run.ticks !== intents.length) {
    throw new SessionRecordError(
      `run.ticks=${run.ticks} не совпадает с числом интентов ${intents.length}`,
      undefined,
      "ticks",
    );
  }
  if (samples.length > 0 && samples[0].tick !== 0) {
    throw new SessionRecordError(
      `первый сэмпл начинается с тика ${samples[0].tick}, а не с 0`,
      undefined,
      "samples",
    );
  }

  return {
    schemaVersion: 1,
    sessionId: session.sessionId,
    createdAt: session.createdAt,
    build: session.build,
    seed: session.seed,
    meta: session.meta,
    run,
    intents,
    samples,
    checkpoints,
    end,
  };
}

/** Контрольный снимок текущего мира (используется рекордером). */
export function checkpointWorld(world: GameWorld): SessionCheckpoint {
  const snapshot = takeSnapshot(world);
  return { tick: snapshot.tick, hash: hashSnapshot(snapshot), snapshot };
}
