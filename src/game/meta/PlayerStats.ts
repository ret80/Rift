/**
 * Карьерная статистика — то, что копится между забегами и не сбрасывается
 * смертью. На ней держатся достижения, открывающие оружие и дронов.
 */

import { STORAGE_KEYS } from "../core/storageKeys";
import type { PersistencePort } from "../core/PersistencePort";

export interface CareerStats {
  /** Завершённых забегов (смерть или выход в меню). */
  runs: number;
  /** Всего убитых врагов. */
  kills: number;
  /** Всего убитых боссов. */
  bossKills: number;
  /** Лучшая дошедшая волна. */
  bestWave: number;
}

/** Статистика нового игрока. */
export function emptyCareerStats(): CareerStats {
  return { runs: 0, kills: 0, bossKills: 0, bestWave: 1 };
}

/** Загрузить статистику; битый JSON — пустая карьера. */
export function loadCareerStats(storage: PersistencePort): CareerStats {
  const raw = storage.get(STORAGE_KEYS.career);
  if (!raw) return emptyCareerStats();
  try {
    const parsed = JSON.parse(raw) as Partial<CareerStats>;
    const read = (value: unknown): number =>
      typeof value === "number" && Number.isFinite(value) && value > 0
        ? Math.floor(value)
        : 0;
    return {
      runs: read(parsed.runs),
      kills: read(parsed.kills),
      bossKills: read(parsed.bossKills),
      bestWave: Math.max(1, read(parsed.bestWave)),
    };
  } catch {
    return emptyCareerStats();
  }
}

export function saveCareerStats(storage: PersistencePort, stats: CareerStats): void {
  storage.set(STORAGE_KEYS.career, JSON.stringify(stats));
}

/** Итог забега для карьеры. */
export interface CareerRun {
  kills: number;
  bossKills: number;
  wave: number;
}

/** Учесть забег и сохранить статистику. */
export function recordCareerRun(
  storage: PersistencePort,
  run: CareerRun,
): CareerStats {
  const previous = loadCareerStats(storage);
  const next: CareerStats = {
    runs: previous.runs + 1,
    kills: previous.kills + Math.max(0, Math.floor(run.kills)),
    bossKills: previous.bossKills + Math.max(0, Math.floor(run.bossKills)),
    bestWave: Math.max(previous.bestWave, Math.max(1, Math.floor(run.wave))),
  };
  saveCareerStats(storage, next);
  return next;
}
