/**
 * Тестовый профиль игрока.
 *
 * Набор покупок (линии корабля, арсенал и дроны), который игрок собирает
 * в ангаре из меню отладки. Тестовая волна стартует уже с этим набором,
 * поэтому не нужно каждый раз покупать оружие и прокачивать корабль.
 *
 * Профиль хранится отдельно от забега и переживает перезапуск страницы:
 * это отладочный инструмент, а не часть прогресса.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { STORAGE_KEYS } from "../core/storageKeys";
import { writeJson } from "../core/storage";
import type { RunSeed } from "../systems/UpgradeSystem";

/** Состояние тестового профиля: тот же формат, что и стартовый seed забега. */
export type TestProfile = RunSeed;

/** Загрузить профиль; null — профиля ещё нет или он повреждён. */
export function loadTestProfile(storage: PersistencePort): TestProfile | null {
  const raw = storage.get(STORAGE_KEYS.debugTestProfile);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object") return null;
    return parsed as TestProfile;
  } catch {
    return null;
  }
}

export function saveTestProfile(storage: PersistencePort, profile: TestProfile): void {
  writeJson(storage, STORAGE_KEYS.debugTestProfile, profile);
}

/** Сбросить профиль: следующий старт — с базового корабля. */
export function clearTestProfile(storage: PersistencePort): void {
  storage.remove(STORAGE_KEYS.debugTestProfile);
}
