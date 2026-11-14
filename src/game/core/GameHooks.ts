/**
 * GameHooks — контракт публичного интерфейса Game с React-UI.
 * Хуки прокидываются из App.tsx в Game без изменений; внутренние
 * слои (GameWorld, GameRender, GameStart) пишут в них данные.
 */

import type { DoctrineOffer } from "../meta/doctrines";
import type { LegacyAward } from "../meta/legacy";
import type { BannerData, CountData, HudData, StatsData, ToastData } from "../types/ui";

export interface Hooks {
  onHud: (h: HudData) => void;
  onBanner: (b: BannerData | null) => void;
  onToast: (toast: ToastData | null) => void;
  onCountdown: (c: CountData | null) => void;
  onStats: (s: StatsData) => void;
  onPause: (p: boolean) => void;
  /** Тактический режим включён/выключен (мир стоит, доступны приказы). */
  onTactical?: (active: boolean) => void;
  onGameOver: () => void;
  /** Волна зачищена — хост открывает ангар между волнами. */
  onWaveCleared?: (wave: number) => void;
  /** Награда за босс-волну: выбор доктрины (null — выбор закрыт). */
  onDoctrineOffer?: (offer: DoctrineOffer | null) => void;
  /** Награда за первую зачищенную волну: карточка артефакта (null — закрыта). */
  onLegacyAward?: (award: LegacyAward | null) => void;
  /** Тестовая волна завершена (зачистка или смерть) — вернуть в отладку. */
  onTestRunEnd?: (reason: "cleared" | "died") => void;
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
  /** Переключение вкладок влево (LB/L1). */
  onGamepadTabLeft?: () => void;
  /** Переключение вкладок вправо (RB/R1). */
  onGamepadTabRight?: () => void;
}
