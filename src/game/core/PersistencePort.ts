/**
 * PersistencePort — абстракция хранилища (DIP).
 * Домены зависят от порта, а не от globalThis.localStorage напрямую.
 */

export interface PersistencePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/** Реализация поверх localStorage (браузер). */
export function createLocalStoragePort(): PersistencePort {
  return {
    get: (key) => {
      try {
        return localStorage.getItem(key);
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        localStorage.setItem(key, value);
      } catch {
        /* приватный режим/переполнение — молча */
      }
    },
    remove: (key) => {
      try {
        localStorage.removeItem(key);
      } catch {
        /* приватный режим/переполнение — молча */
      }
    },
  };
}