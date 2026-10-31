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
import type { EnemyKind } from "../game/balance";
import type { MenuTrackId, CombatTrackId } from "../game/audio/tracks";
import type { PhysicsEngineId } from "../game/physics";
import type { HudStore } from "../ui/hud/HudStore";
import { readUrlParam } from "../game/core/env";

/** Начальные настройки, применяемые к новому экземпляру игры. */
export interface GameInitialSettings {
  volumes: { master: number; sfx: number; music: number };
  menuTrack: MenuTrackId;
  combatTrack: CombatTrackId;
  physicsEngine: PhysicsEngineId;
  debugGod: boolean;
  /** null — включены все виды врагов. */
  enabledEnemies: EnemyKind[] | null;
  urlDebug: boolean;
  urlWave: number | null;
}

/** События, которые игра отправляет в React. */
export interface GameLifecycleCallbacks {
  onBanner: (b: (BannerData & { id: number }) | null) => void;
  onToast: (t: (ToastData & { id: number }) | null) => void;
  onCountdown: (c: CountData | null) => void;
  onStats: (s: StatsData | null) => void;
  onPause: (p: boolean) => void;
  /** Игра создана и готова принимать команды. */
  onReady: (game: Game) => void;
  /** URL-параметр `?wave` запустил забег — нужно открыть игровой экран. */
  onAutoStart: () => void;
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
      onGameOver: () => {
        // Итоги придут через onStats после перехода dying → over.
      },
    }, storage);

    game.setVolumes(initial.volumes);
    game.setEnabledEnemies(initial.enabledEnemies);
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
    if (initial.urlWave) {
      game.setStartWave(initial.urlWave);
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
