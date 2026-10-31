/**
 * WaveComposition — чистые пороги и состав волны.
 *
 * Здесь сосредоточены правила «сколько врагов, каких и сколько разломов»,
 * без состояния и без рендера. SpawnSystem только раскладывает результат
 * по разломам, а случайность приходит через RandomSource.
 */

import {
  pickKindFor,
  pickKindForEnabled,
  waveTotalFor,
  zoneRadiusFor,
  type EnemyKind,
} from "../balance";
import type { RandomSource } from "../math";

/** Доля врагов стартового залпа. */
export const WAVE_START_SPAWN_PCT = 0.3;
/** Доля убитых для создания подкрепления. */
export const WAVE_KILL_THRESHOLD_PCT = 0.1;
/** Доля расширения зоны, после которой можно начинать волну. */
export const WAVE_RIFT_THRESHOLD = 0.9;
/** Доля врагов в одном подкреплении. */
const WAVE_REINFORCEMENT_PCT = 0.1;

/** Общее количество врагов на волне. */
export function waveTotal(wave: number): number {
  return waveTotalFor(wave);
}

/** Радиус зоны волны. */
export function zoneRadius(wave: number): number {
  return zoneRadiusFor(wave);
}

/** Количество стартовых разломов на волне. */
export function riftCountFor(wave: number, random: RandomSource = Math.random): number {
  if (wave === 1) return 2;
  if (wave < 6) return 3;
  if (wave < 12) return 4;
  if (wave < 20) return 4 + (random() < 0.5 ? 1 : 0);
  return 5;
}

/** Сколько врагов выходит в стартовом залпе. */
export function startSpawnCount(total: number): number {
  return Math.ceil(total * WAVE_START_SPAWN_PCT);
}

/** Сколько врагов добавляет одно подкрепление. */
export function reinforcementCount(total: number, spawned: number): number {
  return Math.min(Math.ceil(total * WAVE_REINFORCEMENT_PCT), total - spawned);
}

/** Порог убитых для следующего подкрепления. */
export function killThreshold(total: number): number {
  return Math.ceil(total * WAVE_KILL_THRESHOLD_PCT);
}

/** Собрать очередь врагов волны (с учётом включённых видов). */
export function buildWaveQueue(
  count: number,
  wave: number,
  enabledEnemies: EnemyKind[] | null,
  random: RandomSource = Math.random,
): EnemyKind[] {
  const queue: EnemyKind[] = [];
  for (let i = 0; i < count; i++) {
    queue.push(
      enabledEnemies && enabledEnemies.length > 0
        ? pickKindForEnabled(wave, enabledEnemies, random)
        : pickKindFor(wave, random),
    );
  }
  return queue;
}
