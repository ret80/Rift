/**
 * Общие операции чтения/записи настроек через PersistencePort.
 *
 * Формат хранения — JSON. Для старых «сырых» значений (число/строка/флаг
 * без кавычек) чтение остаётся совместимым: помощники сначала пробуют
 * JSON.parse, затем интерпретируют строку напрямую. Это позволяет
 * мигрировать сохранения без потери данных.
 */

import type { PersistencePort } from "./PersistencePort";

/** Прочитать JSON-значение; при ошибке вернуть fallback. */
export function readJson<T>(
  storage: PersistencePort,
  key: string,
  fallback: T,
): T {
  const raw = storage.get(key);
  if (raw === null) return fallback;
  try {
    const parsed = JSON.parse(raw) as unknown;
    return (parsed ?? fallback) as T;
  } catch {
    return fallback;
  }
}

/** Записать значение в JSON-формате. */
export function writeJson(
  storage: PersistencePort,
  key: string,
  value: unknown,
): void {
  try {
    storage.set(key, JSON.stringify(value));
  } catch {
    /* приватный режим/переполнение — молча */
  }
}

/**
 * Прочитать число. Понимает и JSON-число, и старое сырое `"123"`.
 */
export function readNumber(
  storage: PersistencePort,
  key: string,
  fallback: number,
): number {
  const raw = storage.get(key);
  if (raw === null) return fallback;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Записать число в JSON-формате. */
export function writeNumber(
  storage: PersistencePort,
  key: string,
  value: number,
): void {
  writeJson(storage, key, value);
}

/**
 * Прочитать строку. Понимает JSON-строку (`"ru"`) и старое сырое `ru`.
 */
export function readString(
  storage: PersistencePort,
  key: string,
  fallback: string,
): string {
  const raw = storage.get(key);
  if (raw === null) return fallback;
  if (raw.startsWith('"')) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      return typeof parsed === "string" ? parsed : fallback;
    } catch {
      return fallback;
    }
  }
  return raw;
}

/** Записать строку в JSON-формате. */
export function writeString(
  storage: PersistencePort,
  key: string,
  value: string,
): void {
  writeJson(storage, key, value);
}

/**
 * Прочитать boolean. Понимает JSON (`true`/`false`), числа (`1`/`0`)
 * и старые строковые флаги (`"1"`/`"0"`, `"true"`/`"false"`).
 */
export function readBoolean(
  storage: PersistencePort,
  key: string,
  fallback: boolean,
): boolean {
  const raw = storage.get(key);
  if (raw === null) return fallback;
  if (raw === "1" || raw === '"1"') return true;
  if (raw === "0" || raw === '"0"') return false;
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed === "boolean") return parsed;
    if (parsed === 1) return true;
    if (parsed === 0) return false;
    if (parsed === "true") return true;
    if (parsed === "false") return false;
  } catch {
    /* не JSON — ниже попробуем как строку */
  }
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

/** Записать boolean в JSON-формате. */
export function writeBoolean(
  storage: PersistencePort,
  key: string,
  value: boolean,
): void {
  writeJson(storage, key, value);
}
