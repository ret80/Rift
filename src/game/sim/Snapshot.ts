/**
 * Snapshot — канонический снимок мира и его хэш.
 *
 * Снимок берётся каждые N тиков и нужен для двух вещей:
 *   • доказать детерминизм (одинаковый seed → одинаковые хэши);
 *   • найти первый тик расхождения, когда формулы или порядок систем изменились.
 *
 * Числа хэшируются как биты Float64, а не через `toString()`: иначе
 * `0.1 + 0.2` и `0.30000000000000004` могли бы дать одинаковый текст.
 * Порядок ключей не влияет на хэш — каноническая строка строится явно.
 */

import type { GameWorld } from "../core/GameWorld";
import { RNG_STREAMS, type RngStream } from "../core/rng";

/** Сущность в снимке: только то, что влияет на геймплей. */
export interface SnapshotEntity {
  /** Стабильный идентификатор (`player`, `enemy:<id>`, `bullet:<id>`, …). */
  id: string;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  hp: number;
}

/** Снимок состояния мира на конкретном тике. */
export interface Snapshot {
  tick: number;
  entities: SnapshotEntity[];
  rngDraws: Record<RngStream, number>;
  score: number;
  wave: number;
}

/** Взять снимок текущего состояния мира. */
export function takeSnapshot(world: GameWorld): Snapshot {
  const entities: SnapshotEntity[] = [];

  const player = world.ecs.playerRef();
  if (player) {
    entities.push({
      id: "player",
      kind: "player",
      x: player.position.x,
      y: player.position.y,
      vx: player.velocity.vx,
      vy: player.velocity.vy,
      hp: player.life.remaining,
    });
  }

  for (const enemy of world.ecs.enemies()) {
    if (enemy.marker.dead) continue;
    entities.push({
      id: `enemy:${enemy.marker.ecsId}`,
      kind: String(enemy.marker.kind),
      x: enemy.position.x,
      y: enemy.position.y,
      vx: enemy.velocity.vx,
      vy: enemy.velocity.vy,
      hp: enemy.life.remaining,
    });
  }

  for (const bullet of world.ecs.bullets()) {
    entities.push({
      id: `bullet:${bullet.entity.id}`,
      kind: "bullet",
      x: bullet.position.x,
      y: bullet.position.y,
      vx: bullet.velocity.vx,
      vy: bullet.velocity.vy,
      hp: 0,
    });
  }

  for (const bullet of world.ecs.enemyBullets()) {
    entities.push({
      id: `enemy_bullet:${bullet.entity.id}`,
      kind: "enemy_bullet",
      x: bullet.position.x,
      y: bullet.position.y,
      vx: bullet.velocity.vx,
      vy: bullet.velocity.vy,
      hp: 0,
    });
  }

  for (const pickup of world.ecs.pickups()) {
    entities.push({
      id: `pickup:${pickup.entity.id}`,
      kind: "pickup",
      x: pickup.position.x,
      y: pickup.position.y,
      vx: pickup.velocity.vx,
      vy: pickup.velocity.vy,
      hp: 0,
    });
  }

  for (const drone of world.ecs.allyDrones()) {
    entities.push({
      id: `drone:${drone.entity.id}`,
      kind: "ally_drone",
      x: drone.position.x,
      y: drone.position.y,
      // У дронов нет компонента скорости: они летят к игроку, позиции достаточно.
      vx: 0,
      vy: 0,
      hp: drone.life.remaining,
    });
  }

  for (const asteroid of world.ecs.asteroids()) {
    entities.push({
      id: `asteroid:${asteroid.marker.key}`,
      kind: `asteroid:${asteroid.marker.kind}`,
      x: asteroid.position.x,
      y: asteroid.position.y,
      vx: asteroid.velocity.vx,
      vy: asteroid.velocity.vy,
      hp: asteroid.life.remaining,
    });
  }

  // Порядок сущностей не должен зависеть от порядка обхода ECS.
  entities.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));

  return {
    tick: world.tickIndex,
    entities,
    rngDraws: world.rngDraws(),
    score: world.scoringSystem.score,
    wave: world.waveOrchestrator.wave,
  };
}

/** Буфер для Float64-битов (создаётся один раз). */
const FLOAT_BUFFER = new ArrayBuffer(8);
const FLOAT_VIEW = new DataView(FLOAT_BUFFER);

/** 16 hex-символов: биты Float64 (big-endian). */
function float64Bits(value: number): string {
  FLOAT_VIEW.setFloat64(0, value, false);
  let hex = "";
  for (let i = 0; i < 8; i++) hex += FLOAT_VIEW.getUint8(i).toString(16).padStart(2, "0");
  return hex;
}

/** Каноническая строка снимка: только явный порядок, числа — битами. */
export function snapshotToCanonical(snapshot: Snapshot): string {
  const parts: string[] = [`t${snapshot.tick}`, `w${snapshot.wave}`, `s${float64Bits(snapshot.score)}`];
  for (const stream of RNG_STREAMS) parts.push(`${stream}:${snapshot.rngDraws[stream]}`);
  for (const entity of snapshot.entities) {
    parts.push(
      [
        entity.id,
        entity.kind,
        float64Bits(entity.x),
        float64Bits(entity.y),
        float64Bits(entity.vx),
        float64Bits(entity.vy),
        float64Bits(entity.hp),
      ].join("|"),
    );
  }
  return parts.join("\n");
}

/**
 * FNV-1a 64 по строке — детерминированный хэш без зависимости от платформы.
 * Не криптографический: нужен только для сравнения прогонов.
 */
export function hashString(text: string): string {
  const FNV_OFFSET = 0xcbf29ce484222325n;
  const FNV_PRIME = 0x100000001b3n;
  const MASK = 0xffffffffffffffffn;
  let hash = FNV_OFFSET;
  for (let i = 0; i < text.length; i++) {
    hash ^= BigInt(text.charCodeAt(i) & 0xff);
    hash = (hash * FNV_PRIME) & MASK;
  }
  return `fnv1a64:${hash.toString(16).padStart(16, "0")}`;
}

/** Хэш снимка. */
export function hashSnapshot(snapshot: Snapshot): string {
  return hashString(snapshotToCanonical(snapshot));
}

/** Расхождение между двумя сериями снимков. */
export interface Divergence {
  /** Номер тика, на котором хэши разошлись. */
  tick: number;
  /** Первое замеченное поле (поток RNG, сущности, счёт, волна). */
  field: string;
}

/**
 * Первое расхождение двух серий снимков.
 *
 * Сначала ищется разошедшийся поток случайности — это быстрее объясняет
 * причину, чем диф сущностей.
 */
export function firstDivergence(a: readonly Snapshot[], b: readonly Snapshot[]): Divergence | null {
  const length = Math.min(a.length, b.length);
  for (let i = 0; i < length; i++) {
    const left = a[i];
    const right = b[i];
    if (left.tick !== right.tick) return { tick: left.tick, field: "tick" };

    for (const stream of RNG_STREAMS) {
      if (left.rngDraws[stream] !== right.rngDraws[stream]) {
        return { tick: left.tick, field: `rngDraws.${stream}` };
      }
    }
    if (left.score !== right.score) return { tick: left.tick, field: "score" };
    if (left.wave !== right.wave) return { tick: left.tick, field: "wave" };
    if (snapshotToCanonical(left) !== snapshotToCanonical(right)) {
      return { tick: left.tick, field: "entities" };
    }
  }
  if (a.length !== b.length) {
    const tick = length < a.length ? a[length].tick : b[length].tick;
    return { tick, field: "snapshotCount" };
  }
  return null;
}
