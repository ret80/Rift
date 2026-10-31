import { useEffect, useState } from "react";
import { createLocalStoragePort } from "../game/core/PersistencePort";
import {
  readBoolean,
  readJson,
  readNumber,
  readString,
  writeBoolean,
  writeJson,
  writeNumber,
  writeString,
} from "../game/core/storage";

const port = createLocalStoragePort();

/**
 * Прочитать сохранённое значение с нормализацией по типу значения
 * по умолчанию. Понимает как JSON, так и старые «сырые» записи.
 */
function readPersisted<T>(key: string, defaultValue: T): T {
  if (typeof defaultValue === "boolean") {
    return readBoolean(port, key, defaultValue) as T;
  }
  if (typeof defaultValue === "number") {
    return readNumber(port, key, defaultValue) as T;
  }
  if (typeof defaultValue === "string") {
    return readString(port, key, defaultValue) as T;
  }
  return readJson(port, key, defaultValue);
}

/** Записать значение в том же формате, что и остальные настройки. */
function writePersisted<T>(key: string, value: T): void {
  if (typeof value === "boolean") {
    writeBoolean(port, key, value);
  } else if (typeof value === "number") {
    writeNumber(port, key, value);
  } else if (typeof value === "string") {
    writeString(port, key, value);
  } else {
    writeJson(port, key, value);
  }
}

/**
 * Persisted state hook — synchronises React state with localStorage.
 * Replaces inline localStorage boilerplate across the codebase.
 */
export function usePersistedState<T>(
  key: string,
  defaultValue: T
): [T, (value: T | ((prev: T) => T)) => void] {
  const [state, setState] = useState<T>(() => readPersisted(key, defaultValue));

  useEffect(() => {
    writePersisted(key, state);
  }, [key, state]);

  return [state, setState];
}
