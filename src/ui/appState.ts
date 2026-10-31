/**
 * Состояние корневого React-приложения.
 *
 * Здесь только экран, пауза и транзиентные оверлеи. Настройки живут в
 * `usePersistentSettings`, игровые данные — в `Game`/`HudStore`.
 */

import type { BannerData, CountData, StatsData, ToastData } from "../game/types/ui";
import { readUrlParam } from "../game/core/env";

export type Screen = "menu" | "settings" | "help" | "debug" | "upgrade" | "game";

export interface AppState {
  screen: Screen;
  paused: boolean;
  stats: StatsData | null;
  banner: (BannerData & { id: number }) | null;
  toast: (ToastData & { id: number }) | null;
  countdown: CountData | null;
}

export type AppAction =
  | { type: "SET_SCREEN"; screen: Screen }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_STATS"; stats: StatsData | null }
  | { type: "SET_BANNER"; banner: (BannerData & { id: number }) | null }
  | { type: "SET_TOAST"; toast: (ToastData & { id: number }) | null }
  | { type: "SET_COUNTDOWN"; countdown: CountData | null };

export const INITIAL_APP_STATE: AppState = {
  screen: "menu",
  paused: false,
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

/** Разбор `?debug` и `?wave=N` из URL. */
export function parseUrlParams(): { debug: boolean; wave: number | null } {
  const debug = readUrlParam("debug") !== null;
  const waveParam = readUrlParam("wave");
  const wave = waveParam !== null ? parseInt(waveParam, 10) : null;
  return { debug, wave: wave && wave > 0 ? wave : null };
}
