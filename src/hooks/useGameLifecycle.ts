/**
 * useGameLifecycle — создание и уничтожение игрового движка.
 *
 * Держит в одном месте всё, что связано с жизненным циклом `Game`:
 *   • создание/уничтожение экземпляра (включая повторный HMR-прогон);
 *   • первичное применение настроек (звук, треки, физика, отладка);
 *   • разбор URL-параметров `?debug` / `?wave`;
 *   • разблокировку аудио по первому жесту пользователя.
 */

import { useEffect, useRef, type MutableRefObject, type RefObject } from "react";
import { Game } from "../game/game";
import type { PersistencePort } from "../game/core/PersistencePort";
import type { BannerData, CountData, StatsData, ToastData } from "../game/types/ui";
import type { MenuTrackId, CombatTrackId } from "../game/audio/tracks";
import type { PhysicsEngineId } from "../game/physics";
import type { HudStore } from "../ui/hud/HudStore";
import { readUrlParam } from "../game/core/env";
import type { WaveCompositionOverride } from "../game/balance/waves";
import type { DoctrineOffer } from "../game/meta/doctrines";
import type { LegacyAward } from "../game/meta/legacy";

/** Начальные настройки, применяемые к новому экземпляру игры. */
export interface GameInitialSettings {
  volumes: { master: number; sfx: number; music: number };
  menuTrack: MenuTrackId;
  combatTrack: CombatTrackId;
  physicsEngine: PhysicsEngineId;
  debugGod: boolean;
  urlDebug: boolean;
  urlWave: number | null;
  /** Состав тестовой волны из `?test=...`; null — обычные волны. */
  waveOverride: WaveCompositionOverride | null;
}

/** События, которые игра отправляет в React. */
export interface GameLifecycleCallbacks {
  onBanner: (b: (BannerData & { id: number }) | null) => void;
  onToast: (t: (ToastData & { id: number }) | null) => void;
  onCountdown: (c: CountData | null) => void;
  onStats: (s: StatsData | null) => void;
  onPause: (p: boolean) => void;
  /** Тактический режим включён/выключен. */
  onTactical: (active: boolean) => void;
  /** Волна зачищена — открыть ангар между волнами. */
  onWaveCleared: (wave: number) => void;
  /** Награда за босс-волну: выбор доктрины (null — выбор закрыт). */
  onDoctrineOffer: (offer: DoctrineOffer | null) => void;
  /** Награда за первую волну: карточка артефакта Наследия (null — закрыта). */
  onLegacyAward: (award: LegacyAward | null) => void;
  /** Одиночный тест уровня завершён — вернуть в меню отладки. */
  onTestRunEnd?: (reason: "cleared" | "died") => void;
  /** Игра создана и готова принимать команды. */
  onReady: (game: Game) => void;
  /** URL-параметр `?wave` запустил забег — нужно открыть игровой экран. */
  onAutoStart: () => void;
  /** Нажатие кнопки подтверждения геймпада (A/Cross). */
  onGamepadConfirm?: () => void;
  /** Нажатие кнопки отмены геймпада (B/Circle). */
  onGamepadCancel?: () => void;
  /** Навигация геймпада: вверх. */
  onGamepadNavUp?: () => void;
  /** Навигация геймпада: вниз. */
  onGamepadNavDown?: () => void;
  /** Навигация геймпада: влево. */
  onGamepadNavLeft?: () => void;
  /** Навигация геймпада: вправо. */
  onGamepadNavRight?: () => void;
  /** Переключение вкладок влево (LB/L1). */
  onGamepadTabLeft?: () => void;
  /** Переключение вкладок вправо (RB/R1). */
  onGamepadTabRight?: () => void;
}

export function useGameLifecycle(
  canvasRef: RefObject<HTMLCanvasElement | null>,
  storage: PersistencePort,
  hudStore: HudStore,
  settings: GameInitialSettings,
  callbacks: GameLifecycleCallbacks,
): MutableRefObject<Game | null> {
  const gameRef = useRef<Game | null>(null);
  // Эффект одноразовый: используем последние значения на момент запуска.
  const configRef = useRef({ settings, callbacks });
  configRef.current = { settings, callbacks };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Уничтожаем старый экземпляр (например, после HMR).
    if (gameRef.current) {
      gameRef.current.destroy();
      gameRef.current = null;
    }

    const { settings: initial, callbacks: events } = configRef.current;
    let bannerId = 0;
    let toastId = 0;

    const game = new Game(canvas, {
      onHud: hudStore.push,
      onBanner: (b) =>
        events.onBanner(b ? { ...b, id: bannerId++ } : null),
      onToast: (toast) =>
        events.onToast(toast ? { ...toast, id: toastId++ } : null),
      onCountdown: events.onCountdown,
      onStats: events.onStats,
      onPause: events.onPause,
      onTactical: events.onTactical,
      onWaveCleared: events.onWaveCleared,
      onDoctrineOffer: events.onDoctrineOffer,
      onLegacyAward: events.onLegacyAward,
      onTestRunEnd: events.onTestRunEnd,
      onGameOver: () => {
        // Итоги придут через onStats после перехода dying → over.
      },
      onGamepadConfirm: events.onGamepadConfirm,
      onGamepadCancel: events.onGamepadCancel,
      onGamepadNavUp: events.onGamepadNavUp,
      onGamepadNavDown: events.onGamepadNavDown,
      onGamepadNavLeft: events.onGamepadNavLeft,
      onGamepadNavRight: events.onGamepadNavRight,
      onGamepadTabLeft: events.onGamepadTabLeft,
      onGamepadTabRight: events.onGamepadTabRight,
    }, storage);

    game.setVolumes(initial.volumes);
    game.audio.setMenuTrack(initial.menuTrack);
    game.audio.setCombatTrack(initial.combatTrack);
    // Применить сохранённый физический движок. Конструктор стартует с
    // Planck, поэтому без этого вызова настройка терялась бы. URL-параметр
    // ?physics=<id> имеет приоритет (отладка).
    if (!readUrlParam("physics")) {
      game.setPhysicsEngine(initial.physicsEngine);
    }

    gameRef.current = game;
    events.onReady(game);

    // Восстановить god mode из персистентных настроек.
    game.setDebugGod(initial.debugGod);

    if (initial.urlDebug) {
      game.setDebugGod(true);
    }

    // ?wave — сразу запустить забег с нужной волны.
    if (initial.urlWave || initial.waveOverride) {
      if (initial.waveOverride) game.setWaveOverride(initial.waveOverride);
      if (initial.urlWave) game.setStartWave(initial.urlWave);
      game.audio.init();
      game.audio.startMusic();
      game.startRun();
      events.onAutoStart();
    }

    // Аудио разблокируется первым жестом пользователя.
    const bootAudio = () => {
      const current = gameRef.current;
      if (!current) return;
      current.audio.init();
      current.audio.startMusic();
    };
    bootAudio();
    const onFirstGesture = () => {
      bootAudio();
      window.removeEventListener("pointerdown", onFirstGesture, true);
      window.removeEventListener("keydown", onFirstGesture, true);
    };
    window.addEventListener("pointerdown", onFirstGesture, true);
    window.addEventListener("keydown", onFirstGesture, true);

    return () => {
      window.removeEventListener("pointerdown", onFirstGesture, true);
      window.removeEventListener("keydown", onFirstGesture, true);
      game.destroy();
      gameRef.current = null;
    };
  }, [canvasRef, storage, hudStore]);

  return gameRef;
}
