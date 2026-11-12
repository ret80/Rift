/**
 * Загрузка/сохранение мета-прогрессии.
 *
 * Мета — единственный постоянный слой Механики 3: кредиты и таланты
 * Зеркала Ночи. Прокачка забега (детали, линии, арсенал, дроны) не
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

/** Полный сброс мета-прогресса: кредиты, таланты и рекорды. */
export function resetMetaProgress(storage: PersistencePort): void {
  storage.remove(STORAGE_KEYS.credits);
  storage.remove(STORAGE_KEYS.metaTree);
  storage.remove(STORAGE_KEYS.best);
  storage.remove(STORAGE_KEYS.bestWave);
}
