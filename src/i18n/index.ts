/**
 * Локализация: доменные словари RU/EN, интерполяция `{param}`,
 * сохранение выбранного языка и React-подписка на переключение.
 *
 * Словари живут в `dicts/` по доменам; здесь они сплющиваются в плоские
 * ключи (`upgrade.weapon.reload`), поэтому `TKey` остаётся строгим
 * литеральным объединением, а игровой код читает тексты через `t()`.
 */

import { useSyncExternalStore } from "react";
import { createLocalStoragePort } from "../game/core/PersistencePort";
import { STORAGE_KEYS } from "../game/core/storageKeys";
import { readString, writeString } from "../game/core/storage";
import { enNested, ruNested } from "./dicts/index.ts";

export type Lang = "ru" | "en";

/** Развернуть вложенный словарь в плоские ключи через точку. */
function flatten(source: Record<string, unknown>, prefix = ""): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [key, value] of Object.entries(source)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (typeof value === "string") {
      out[path] = value;
    } else if (value !== null && typeof value === "object") {
      Object.assign(out, flatten(value as Record<string, unknown>, path));
    }
  }
  return out;
}

/** Путь к каждому листу вложенного словаря — литеральное объединение. */
type FlattenKeys<T, Prefix extends string = ""> = {
  [K in keyof T & string]: T[K] extends string
    ? `${Prefix}${K}`
    : FlattenKeys<T[K], `${Prefix}${K}.`>;
}[keyof T & string];

/** Строгий тип ключей локализации — литералы RU-словаря. */
export type TKey = FlattenKeys<typeof ruNested>;

/** Оба словаря обязаны иметь ровно те же ключи (проверяется типом EN). */
const ru: Record<string, string> = flatten(ruNested as Record<string, unknown>);
const en: Record<string, string> = flatten(enNested as Record<string, unknown>);

const dicts: Record<Lang, Record<string, string>> = { ru, en };

const LS_KEY = STORAGE_KEYS.lang;
const storage = createLocalStoragePort();

let lang: Lang = "ru";
const savedLang = readString(storage, LS_KEY, "ru");
if (savedLang === "ru" || savedLang === "en") lang = savedLang;

const listeners = new Set<() => void>();

/** Текущий язык интерфейса. */
export function getLang(): Lang {
  return lang;
}

/** Переключить язык и сохранить выбор. */
export function setLang(l: Lang): void {
  if (lang === l) return;
  lang = l;
  writeString(storage, LS_KEY, l);
  listeners.forEach((f) => f());
}

/** Текст по ключу с подстановкой `{param}`. */
export function t(key: TKey, params?: Record<string, string | number>): string {
  let s = dicts[lang][key] ?? dicts.ru[key] ?? key;
  if (params) {
    for (const k of Object.keys(params)) {
      s = s.split(`{${k}}`).join(String(params[k]));
    }
  }
  return s;
}

/** Подписка на смену языка. */
export function useLang(): Lang {
  return useSyncExternalStore(
    (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    () => lang
  );
}

/** Перерисовывает компонент при смене языка и возвращает `t`. */
export function useT() {
  useLang();
  return t;
}
