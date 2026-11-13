/**
 * Отладочные флаги «бесконечных» ресурсов.
 *
 * Флаги живут в настройках отладки и читаются двумя независимыми
 * владельцами кошельков: игровым миром (детали и кредиты забега) и
 * экраном Эха Разлома (постоянные кредиты). Оба смотрят на один ключ.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { STORAGE_KEYS } from "../core/storageKeys";
import { readBoolean } from "../core/storage";

/** Включены ли бесконечные детали. */
export function loadInfiniteParts(storage: PersistencePort): boolean {
  return readBoolean(storage, STORAGE_KEYS.debugInfiniteParts, false);
}

/** Включены ли бесконечные кредиты. */
export function loadInfiniteCredits(storage: PersistencePort): boolean {
  return readBoolean(storage, STORAGE_KEYS.debugInfiniteCredits, false);
}
