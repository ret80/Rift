/**
 * Состояние корневого React-приложения.
 *
 * Здесь только экран, пауза и транзиентные оверлеи. Настройки живут в
 * `usePersistentSettings`, игровые данные — в `Game`/`HudStore`.
 */

import type { BannerData, CountData, StatsData, ToastData } from "../game/types/ui";
import { readUrlParam } from "../game/core/env";
import { EnemyKind } from "../game/balance/enemies";
import type { WaveCompositionOverride } from "../game/balance/waves";

export type Screen = "menu" | "settings" | "help" | "debug" | "hangar" | "meta" | "game";

export interface AppState {
  screen: Screen;
  paused: boolean;
  /** Тактический режим: мир замер, открыт оверлей приказов дронам. */
  tactical: boolean;
  stats: StatsData | null;
  banner: (BannerData & { id: number }) | null;
  toast: (ToastData & { id: number }) | null;
  countdown: CountData | null;
}

export type AppAction =
  | { type: "SET_SCREEN"; screen: Screen }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_TACTICAL"; tactical: boolean }
  | { type: "SET_STATS"; stats: StatsData | null }
  | { type: "SET_BANNER"; banner: (BannerData & { id: number }) | null }
  | { type: "SET_TOAST"; toast: (ToastData & { id: number }) | null }
  | { type: "SET_COUNTDOWN"; countdown: CountData | null };

export const INITIAL_APP_STATE: AppState = {
  screen: "menu",
  paused: false,
  tactical: false,
  stats: null,
  banner: null,
  toast: null,
  countdown: null,
};

export function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SCREEN":
      return { ...state, screen: action.screen };
    case "SET_PAUSED":
      return { ...state, paused: action.paused };
    case "SET_TACTICAL":
      return { ...state, tactical: action.tactical };
    case "SET_STATS":
      return { ...state, stats: action.stats };
    case "SET_BANNER":
      return { ...state, banner: action.banner };
    case "SET_TOAST":
      return { ...state, toast: action.toast };
    case "SET_COUNTDOWN":
      return { ...state, countdown: action.countdown };
    default:
      return state;
  }
}

/**
 * Разобрать `?test=drone:10,hunter:2` в состав волны.
 *
 * Битые пары и неизвестные виды игнорируются: параметр не должен ломать
 * обычный запуск игры. Ограничение суммы — защита от случайного
 * `?test=drone:999999`.
 */
function parseWaveOverride(raw: string | null): WaveCompositionOverride | null {
  if (!raw) return null;
  const known = new Set<string>(Object.values(EnemyKind));
  const result: WaveCompositionOverride = {};
  let total = 0;
  for (const part of raw.split(",")) {
    const [kindRaw, countRaw] = part.split(":");
    const kind = kindRaw?.trim();
    const count = Number.parseInt(countRaw ?? "", 10);
    if (!kind || !known.has(kind) || !Number.isFinite(count) || count <= 0) continue;
    const left = 200 - total;
    if (left <= 0) break;
    const clamped = Math.min(count, left);
    result[kind as EnemyKind] = (result[kind as EnemyKind] ?? 0) + clamped;
    total += clamped;
  }
  return total > 0 ? result : null;
}

/** Разбор `?debug`, `?wave=N`, `?record` и `?test=<вид>:<кол-во>,...` из URL. */
export function parseUrlParams(): {
  debug: boolean;
  wave: number | null;
  waveOverride: WaveCompositionOverride | null;
  /** Показывать кнопку записи: сам факт параметра важен, значение — нет. */
  record: boolean;
} {
  const debug = readUrlParam("debug") !== null;
  const waveParam = readUrlParam("wave");
  const wave = waveParam !== null ? parseInt(waveParam, 10) : null;
  const waveOverride = parseWaveOverride(readUrlParam("test"));
  const record = readUrlParam("record") !== null;
  return { debug, wave: wave && wave > 0 ? wave : null, waveOverride, record };
}
