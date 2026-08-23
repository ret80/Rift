import type { BannerData, CountData, PopupData, StatsData, ToastData } from "./game";

/**
 * Resets all transient game state to pre-game defaults.
 * Used by both `startGame()` and `toMenu()` to avoid duplication.
 */
export function resetGameState(dispatch: {
  setStats: (s: StatsData | null) => void;
  setBanner: (b: (BannerData & { id: number }) | null) => void;
  setToast: (t: (ToastData & { id: number }) | null) => void;
  setCountdown: (c: CountData | null) => void;
  setPopups: (p: PopupData[]) => void;
}): void {
  dispatch.setStats(null);
  dispatch.setBanner(null);
  dispatch.setToast(null);
  dispatch.setCountdown(null);
  dispatch.setPopups([]);
}
