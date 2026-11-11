/**
 * Загрузка/сохранение мета-прогрессии (Зеркало Ночи).
 */

import { STORAGE_KEYS } from "../core/storageKeys";
import type { PersistencePort } from "../core/PersistencePort";
import type { MetaTreeState } from "./types";

export function loadMetaTree(storage: PersistencePort): MetaTreeState {
  const raw = storage.get(STORAGE_KEYS.metaTree);
  if (!raw) return { talents: {}, credits: 0 };
  try {
    const parsed = JSON.parse(raw) as MetaTreeState;
    return {
      talents: parsed.talents ?? {},
      credits: parsed.credits ?? 0,
    };
  } catch {
    return { talents: {}, credits: 0 };
  }
}

export function saveMetaTree(storage: PersistencePort, state: MetaTreeState): void {
  storage.set(STORAGE_KEYS.metaTree, JSON.stringify(state));
}

export function loadCredits(storage: PersistencePort): number {
  return Number(storage.get(STORAGE_KEYS.credits)) || 0;
}

export function saveCredits(storage: PersistencePort, amount: number): void {
  storage.set(STORAGE_KEYS.credits, String(amount));
}
