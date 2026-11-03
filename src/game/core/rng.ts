/**
 * rng — единственный детерминированный PRNG и модель seed-потоков.
 *
 * Геймплей не вызывает `Math.random`: каждый бросок идёт через поток
 * (`combat`, `spawn`, `drops`, `fx`, `agent`). Потоки выводятся из мастер-seed
 * стабильным 32-битным хэшем, поэтому:
 *   • один и тот же SeedSet всегда даёт одну и ту же последовательность;
 *   • изменение числа бросков в одном потоке не сдвигает остальные;
 *   • решения агента (`agent`) не влияют на боевые броски.
 *
 * Модуль не импортирует DOM и не использует `Math.random`.
 */

import { mulberry32 } from "../math";

/** Детерминированный генератор: [0,1), диапазон и целые. */
export interface Rng {
  /** Следующее число в [0, 1). */
  next(): number;
  /** Равномерное число в [a, b). */
  range(a: number, b: number): number;
  /** Целое в [0, maxExclusive). */
  int(maxExclusive: number): number;
}

/** Независимые потоки случайности. */
export type RngStream = "combat" | "spawn" | "drops" | "fx" | "agent";

/** Все потоки в стабильном порядке (для снапшотов и отчётов). */
export const RNG_STREAMS: readonly RngStream[] = ["combat", "spawn", "drops", "fx", "agent"];

/** Seed-набор прогона: мастер-seed и выведенные из него потоки. */
export interface SeedSet {
  master: number;
  streams: Record<RngStream, number>;
}

/** FNV-1a (32 бита) — стабильный хэш строки в браузере и Node. */
function fnv1a(text: string): number {
  let hash = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

/**
 * Seed потока из мастер-seed.
 *
 * Хэшируется строка `stream:master`, а не `master + index`: иначе соседние
 * seed-наборы давали бы коррелированные потоки.
 */
export function deriveSeed(master: number, stream: RngStream): number {
  return fnv1a(`${stream}:${master >>> 0}`);
}

/** Создать поток по seed (mulberry32). */
export function createRngStream(seed: number): Rng {
  // mulberry32(0) вырождается в предсказуемый ряд — подменяем нулевой seed
  // на константу «золотого сечения», чтобы пустой seed оставался рабочим.
  const next = mulberry32((seed >>> 0) || 0x9e3779b9);
  return {
    next,
    range(a: number, b: number): number {
      return a + next() * (b - a);
    },
    int(maxExclusive: number): number {
      if (maxExclusive <= 0) return 0;
      return Math.floor(next() * maxExclusive);
    },
  };
}

/** Построить SeedSet из мастер-seed. */
export function createSeedSet(master: number): SeedSet {
  const normalized = master >>> 0;
  const streams = {} as Record<RngStream, number>;
  for (const stream of RNG_STREAMS) streams[stream] = deriveSeed(normalized, stream);
  return { master: normalized, streams };
}

/** Проверить, что объект похож на SeedSet (для JSON-сценариев). */
export function isSeedSet(value: unknown): value is SeedSet {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Partial<SeedSet>;
  if (typeof candidate.master !== "number" || !Number.isFinite(candidate.master)) return false;
  const streams = candidate.streams;
  if (typeof streams !== "object" || streams === null) return false;
  return RNG_STREAMS.every((stream) => typeof streams[stream] === "number");
}

/**
 * Случайный мастер-seed для хоста (браузер/CLI).
 *
 * В геймплейном коде вызывать нельзя: seed — часть входных данных сценария.
 */
export function createRandomSeed(): number {
  const cryptoApi = (globalThis as { crypto?: Crypto }).crypto;
  if (cryptoApi && typeof cryptoApi.getRandomValues === "function") {
    return cryptoApi.getRandomValues(new Uint32Array(1))[0] >>> 0;
  }
  return Date.now() >>> 0;
}

/** Детерминированный набор потоков с подсчётом бросков. */
export interface RngStreams {
  readonly seeds: SeedSet;
  /** Поток по имени (создаётся лениво). */
  rng(stream: RngStream): Rng;
  /** Сколько чисел выдал поток с последнего reset(). */
  draws(stream: RngStream): number;
  /** Счётчики всех потоков (для снапшотов). */
  drawCounts(): Record<RngStream, number>;
  /** Вернуть все потоки в исходное состояние и обнулить счётчики. */
  reset(): void;
}

/**
 * Создать набор потоков с подсчётом бросков.
 *
 * Каждый поток — стабильный объект: `reset()` пересоздаёт только внутренний
 * генератор, поэтому системы, захватившие `Rng` в конструкторе, продолжают
 * работать и после сброса мира.
 */
export function createRngStreams(seeds: SeedSet): RngStreams {
  const counts = emptyCounts();
  const owners = new Map<RngStream, () => void>();
  const cache = new Map<RngStream, Rng>();

  const build = (stream: RngStream): Rng => {
    const seed = seeds.streams[stream];
    let raw = createRngStream(seed);
    owners.set(stream, () => {
      raw = createRngStream(seed);
    });
    return {
      next(): number {
        counts[stream]++;
        return raw.next();
      },
      range(a: number, b: number): number {
        counts[stream]++;
        return raw.range(a, b);
      },
      int(maxExclusive: number): number {
        counts[stream]++;
        return raw.int(maxExclusive);
      },
    };
  };

  return {
    seeds,
    rng(stream: RngStream): Rng {
      const cached = cache.get(stream);
      if (cached) return cached;
      const created = build(stream);
      cache.set(stream, created);
      return created;
    },
    draws(stream: RngStream): number {
      return counts[stream];
    },
    drawCounts(): Record<RngStream, number> {
      return { ...counts };
    },
    reset(): void {
      for (const key of RNG_STREAMS) counts[key] = 0;
      for (const resetOne of owners.values()) resetOne();
    },
  };
}

function emptyCounts(): Record<RngStream, number> {
  const counts = {} as Record<RngStream, number>;
  for (const stream of RNG_STREAMS) counts[stream] = 0;
  return counts;
}
