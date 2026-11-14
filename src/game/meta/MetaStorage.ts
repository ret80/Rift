/**
 * Загрузка/сохранение мета-прогрессии.
 *
 * Мета — единственный постоянный слой Механики 3: кредиты и таланты
 * Эха Разлома. Прокачка забега (детали, линии, арсенал, дроны) не
 * сохраняется и в хранилище не попадает.
 */

import { STORAGE_KEYS } from "../core/storageKeys";
import type { PersistencePort } from "../core/PersistencePort";
import type { MetaTreeState } from "./types";

export function loadMetaTree(storage: PersistencePort): MetaTreeState {
  const raw = storage.get(STORAGE_KEYS.metaTree);
  if (!raw) return { talents: {} };
  try {
    const parsed = JSON.parse(raw) as Partial<MetaTreeState>;
    return { talents: parsed.talents ?? {} };
  } catch {
    return { talents: {} };
  }
}

export function saveMetaTree(storage: PersistencePort, state: MetaTreeState): void {
  storage.set(STORAGE_KEYS.metaTree, JSON.stringify(state));
}

export function loadCredits(storage: PersistencePort): number {
  return Number(storage.get(STORAGE_KEYS.credits)) || 0;
}

export function saveCredits(storage: PersistencePort, amount: number): void {
  storage.set(STORAGE_KEYS.credits, String(Math.max(0, Math.floor(amount))));
}

/** Выбранная доктрина; null — играть без доктрины. */
export function loadSelectedDoctrine(storage: PersistencePort): string | null {
  return storage.get(STORAGE_KEYS.doctrine);
}

export function saveSelectedDoctrine(storage: PersistencePort, id: string | null): void {
  if (id === null) {
    storage.remove(STORAGE_KEYS.doctrine);
    return;
  }
  storage.set(STORAGE_KEYS.doctrine, id);
}

/** Выбранный уровень угрозы; отсутствие ключа — обычная сложность. */
export function loadThreatLevel(storage: PersistencePort): number {
  return Number(storage.get(STORAGE_KEYS.threatLevel)) || 0;
}

export function saveThreatLevel(storage: PersistencePort, level: number): void {
  if (level <= 0) {
    storage.remove(STORAGE_KEYS.threatLevel);
    return;
  }
  storage.set(STORAGE_KEYS.threatLevel, String(Math.floor(level)));
}

/** Выбранные модификаторы Асценсии; пусто — обычная сложность. */
export function loadAscensionSelection(storage: PersistencePort): string[] {
  const raw = storage.get(STORAGE_KEYS.ascension);
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    return [];
  }
}

export function saveAscensionSelection(storage: PersistencePort, ids: readonly string[]): void {
  if (ids.length === 0) {
    storage.remove(STORAGE_KEYS.ascension);
    return;
  }
  storage.set(STORAGE_KEYS.ascension, JSON.stringify(ids));
}

/** Полный сброс мета-прогресса: кредиты, таланты и рекорды. */
export function resetMetaProgress(storage: PersistencePort): void {
  storage.remove(STORAGE_KEYS.credits);
  storage.remove(STORAGE_KEYS.metaTree);
  storage.remove(STORAGE_KEYS.doctrine);
  storage.remove(STORAGE_KEYS.legacy);
  storage.remove(STORAGE_KEYS.threatLevel);
  storage.remove(STORAGE_KEYS.ascension);
  storage.remove(STORAGE_KEYS.career);
  storage.remove(STORAGE_KEYS.best);
  storage.remove(STORAGE_KEYS.bestWave);
}
