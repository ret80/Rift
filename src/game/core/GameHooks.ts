/**
 * GameHooks — контракт публичного интерфейса Game с React-UI.
 * Хуки прокидываются из App.tsx в Game без изменений; внутренние
 * слои (GameListeners, GameRender, GameStart) пишут в них данные.
 */

import type { BannerData, CountData, HudData, StatsData, ToastData } from "../types/ui";

export interface Hooks {
  onHud: (h: HudData) => void;
  onBanner: (b: BannerData | null) => void;
  onToast: (toast: ToastData | null) => void;
  onCountdown: (c: CountData | null) => void;
  onStats: (s: StatsData) => void;
  onPause: (p: boolean) => void;
  onGameOver: () => void;
}