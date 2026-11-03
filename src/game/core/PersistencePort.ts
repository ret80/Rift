/**
 * PersistencePort — абстракция хранилища (DIP).
 * Домены зависят от порта, а не от globalThis.localStorage напрямую.
 */

export interface PersistencePort {
  get(key: string): string | null;
  set(key: string, value: string): void;
  remove(key: string): void;
}

/**
 * Реализация поверх localStorage (браузер).
 *
 * Доступ идёт через `window.localStorage`: в Node/DOM-free среде `window`
 * отсутствует, и глобальный `localStorage` (в Node он экспериментальный)
 * не трогается вообще — иначе headless-прогон получает предупреждение
 * рантайма на импорте.
 */
export function createLocalStoragePort(): PersistencePort {
  const storage = (): Storage | null => {
    if (typeof window === "undefined") return null;
    try {
      return window.localStorage ?? null;
    } catch {
      return null;
    }
  };

  return {
    get: (key) => {
      try {
        return storage()?.getItem(key) ?? null;
      } catch {
        return null;
      }
    },
    set: (key, value) => {
      try {
        storage()?.setItem(key, value);
      } catch {
        /* приватный режим/переполнение — молча */
      }
    },
    remove: (key) => {
      try {
        storage()?.removeItem(key);
      } catch {
        /* приватный режим/переполнение — молча */
      }
    },
  };
}
