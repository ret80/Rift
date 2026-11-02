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
  /** Нажатие кнопки подтверждения геймпада (A/Cross). */
  onGamepadConfirm?: () => void;
  /** Нажатие кнопки отмены геймпада (B/Circle). */
  onGamepadCancel?: () => void;
  /** Навигация геймпада: вверх (D-pad up / стик вверх). */
  onGamepadNavUp?: () => void;
  /** Навигация геймпада: вниз (D-pad down / стик вниз). */
  onGamepadNavDown?: () => void;
  /** Навигация геймпада: влево (D-pad left / стик влево). */
  onGamepadNavLeft?: () => void;
  /** Навигация геймпада: вправо (D-pad right / стик вправо). */
  onGamepadNavRight?: () => void;
}
