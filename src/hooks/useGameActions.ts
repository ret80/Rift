/**
 * useGameActions — команды UI к игре и навигация по экранам.
 *
 * Собирает обработчики, которые раньше жили прямо в `App.tsx`: старт/выход
 * из забега, настройки, отладка, переходы между меню и обработку ESC.
 */

import { useCallback, useEffect, useRef, type Dispatch, type MutableRefObject } from "react";
import { t } from "../i18n";
import { resetGameState } from "../game/resetGameState";
import { resetMetaProgress } from "../game/meta/MetaStorage";
import type { Game } from "../game/game";
import type { PersistencePort } from "../game/core/PersistencePort";
import type { PersistentSettings } from "./usePersistentSettings";
import type { AppAction, Screen } from "../ui/appState";
import type { PickupKind } from "../game/balance";
import type { EnemyKind } from "../game/balance/enemies";
import { ALL_PICKUP_KINDS } from "../game/balance/drops";
import type { MenuTrackId, CombatTrackId } from "../game/audio/tracks";
import type { PhysicsEngineId } from "../game/physics";
import type { DroneOrder } from "../game/ecs/components/AllyDroneComponent";

export interface GameActions {
  startGame(): void;
  /** Запустить выбранный в отладке уровень с отладочным списком врагов. */
  startTestLevel(): void;
  /** Вернуть тестовый уровень в меню отладки после зачистки/смерти. */
  finishTestLevel(): void;
  toMenu(): void;
  /** Начать/остановить запись забега (`?record`). */
  toggleRecording(): void;
  /** Войти в тактический режим или выйти из него. */
  toggleTactical(): void;
  /** Приказ рою дронов в тактическом режиме. */
  setDroneOrder(order: DroneOrder): void;
  changeVols(v: { master: number; sfx: number; music: number }): void;
  changeMenuTrack(id: MenuTrackId): void;
  changeCombatTrack(id: CombatTrackId): void;
  changePhysicsEngine(id: PhysicsEngineId): void;
  previewTrack(id: MenuTrackId | CombatTrackId): void;
  testSound(): void;
  resetProgress(): void;
  openMenu(): void;
  openHelp(): void;
  openDebug(): void;
  openSettings(from: "menu" | "pause"): void;
  closeSettings(): void;
  /** Открыть ангар между волнами (игрок сейчас в забеге). */
  openHangar(): void;
  /** Закрыть ангар и продолжить забег. */
  closeHangar(): void;
  openMeta(): void;
  closeMeta(): void;
  toggleEnemy(kind: EnemyKind): void;
  togglePickup(kind: PickupKind): void;
  toggleDebugFps(): void;
  toggleDebugGod(): void;
  changeDebugWave(n: number): void;
  /** Отладочная скорость игрока в процентах (−50…+50), только тестовые уровни. */
  changeDebugSpeed(n: number): void;
  changeDebugZone(n: number): void;
  toggleDebugDetails(): void;
}

export interface GameActionsOptions {
  screen: Screen;
  gameRef: MutableRefObject<Game | null>;
  storage: PersistencePort;
  settings: PersistentSettings;
  setBest: (value: number) => void;
  dispatch: Dispatch<AppAction>;
}

export function useGameActions(options: GameActionsOptions): GameActions {
  const { screen, gameRef, storage, settings, setBest, dispatch } = options;
  const settingsFromRef = useRef<"menu" | "pause">("menu");

  const closeSettings = () => dispatch({
    type: "SET_SCREEN",
    screen: settingsFromRef.current === "pause" ? "game" : "menu",
  });

  const openHangar = useCallback(() => {
    gameRef.current?.openHangar();
    dispatch({ type: "SET_SCREEN", screen: "hangar" });
  }, [gameRef, dispatch]);

  const closeHangar = useCallback(() => {
    gameRef.current?.closeHangar();
    dispatch({ type: "SET_SCREEN", screen: "game" });
  }, [gameRef, dispatch]);

  const resetOverlays = () => resetGameState({
    setStats: (s) => dispatch({ type: "SET_STATS", stats: s }),
    setBanner: (b) => dispatch({ type: "SET_BANNER", banner: b }),
    setToast: (toast) => dispatch({ type: "SET_TOAST", toast }),
    setCountdown: (c) => dispatch({ type: "SET_COUNTDOWN", countdown: c }),
  });

  const startGame = () => {
    const game = gameRef.current;
    if (!game) return;
    game.audio.init();
    game.audio.startMusic();
    // Обычный забег всегда начинает с доступной волны и со всеми врагами:
    // отладочный список не должен влиять на реальную игру.
    game.setStartWave(1);
    game.setTestMode(false);
    game.setEnabledEnemies(null);
    resetOverlays();
    dispatch({ type: "SET_SCREEN", screen: "game" });
    game.startRun();
  };

  const startTestLevel = () => {
    const game = gameRef.current;
    if (!game) return;
    game.audio.init();
    game.audio.startMusic();
    game.setTestSpeed(settings.debugSpeed);
    game.setTestZone(settings.debugZone);
    game.startTestLevel(settings.debugWave, settings.enabledEnemies);
    resetOverlays();
    dispatch({ type: "SET_SCREEN", screen: "game" });
  };

  const finishTestLevel = () => {
    gameRef.current?.toMenu();
    resetOverlays();
    dispatch({ type: "SET_SCREEN", screen: "debug" });
  };

  const toMenu = () => {
    gameRef.current?.toMenu();
    resetOverlays();
    dispatch({ type: "SET_SCREEN", screen: "menu" });
  };

  // При открытии отладки применяем актуальные наборы врагов/пикапов.
  useEffect(() => {
    if (screen !== "debug") return;
    gameRef.current?.setEnabledEnemies(settings.enabledEnemies);
    gameRef.current?.setEnabledPickups(
      settings.enabledPickups.length === ALL_PICKUP_KINDS.length
        ? null
        : settings.enabledPickups
    );
  }, [screen, gameRef, settings.enabledEnemies, settings.enabledPickups]);

  // ESC закрывает меню с кнопкой «Назад», не снимая паузу. Ловим на фазе
  // capture — раньше игрового слушателя.
  useEffect(() => {
    const isMenuWithBack =
      screen === "settings" || screen === "help" || screen === "debug" || screen === "meta" || screen === "hangar";
    if (!isMenuWithBack) return;

    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      e.stopPropagation();
      if (screen === "settings") {
        dispatch({
          type: "SET_SCREEN",
          screen: settingsFromRef.current === "pause" ? "game" : "menu",
        });
      } else if (screen === "hangar") {
        // Esc в ангаре = «продолжить»: забег не прерывается.
        closeHangar();
      } else {
        dispatch({ type: "SET_SCREEN", screen: "menu" });
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [screen, dispatch, closeHangar]);

  return {
    startGame,
    startTestLevel,
    finishTestLevel,
    toMenu,
    changeVols: (v) => {
      settings.setVols(v);
      gameRef.current?.setVolumes(v);
    },
    changeMenuTrack: (id) => {
      settings.setMenuTrack(id);
      gameRef.current?.audio.setMenuTrack(id);
    },
    changeCombatTrack: (id) => {
      settings.setCombatTrack(id);
      gameRef.current?.audio.setCombatTrack(id);
    },
    changePhysicsEngine: (id) => {
      settings.setPhysicsEngine(id);
      gameRef.current?.setPhysicsEngine(id);
    },
    previewTrack: (id) => {
      const game = gameRef.current;
      if (!game) return;
      game.audio.init();
      game.audio.previewTrack(id);
    },
    testSound: () => {
      const game = gameRef.current;
      if (!game) return;
      game.audio.init();
      game.audio.playWaveClear();
    },
    resetProgress: () => {
      if (!window.confirm(t("settings.resetConfirm"))) return;
      resetMetaProgress(storage);
      gameRef.current?.refreshUpgrades();
      setBest(0);
    },
    openMenu: () => dispatch({ type: "SET_SCREEN", screen: "menu" }),
    openHelp: () => dispatch({ type: "SET_SCREEN", screen: "help" }),
    openDebug: () => dispatch({ type: "SET_SCREEN", screen: "debug" }),
    openSettings: (from) => {
      settingsFromRef.current = from;
      dispatch({ type: "SET_SCREEN", screen: "settings" });
    },
    closeSettings,
    openHangar,
    closeHangar,
    openMeta: () => dispatch({ type: "SET_SCREEN", screen: "meta" }),
    closeMeta: () => {
      // Эхо Разлома открывается из меню или с экрана смерти: после него
      // забег уже завершён, поэтому возвращаемся в меню.
      gameRef.current?.toMenu();
      resetOverlays();
      dispatch({ type: "SET_SCREEN", screen: "menu" });
    },
    toggleEnemy: (kind) => {
      settings.setEnabledEnemies((prev) => {
        const next = prev.includes(kind)
          ? prev.filter((k) => k !== kind)
          : [...prev, kind];
        gameRef.current?.setEnabledEnemies(next);
        return next;
      });
    },
    togglePickup: (kind) => {
      settings.setEnabledPickups((prev) => {
        const next = prev.includes(kind)
          ? prev.filter((k) => k !== kind)
          : [...prev, kind];
        gameRef.current?.setEnabledPickups(
          next.length === ALL_PICKUP_KINDS.length ? null : next
        );
        return next;
      });
    },
    toggleDebugFps: () => settings.setDebugFps(!settings.debugFps),
    toggleDebugGod: () => {
      const next = !settings.debugGod;
      settings.setDebugGod(next);
      gameRef.current?.setDebugGod(next);
    },
    changeDebugWave: (n) => {
      settings.setDebugWave(n);
      gameRef.current?.setStartWave(n);
    },
    changeDebugSpeed: (n) => {
      settings.setDebugSpeed(n);
      gameRef.current?.setTestSpeed(n);
    },
    changeDebugZone: (n) => {
      settings.setDebugZone(n);
      gameRef.current?.setTestZone(n);
    },
    toggleRecording: () => gameRef.current?.toggleRecording(),
    toggleTactical: () => gameRef.current?.toggleTactical(),
    setDroneOrder: (order) => gameRef.current?.setDroneOrder(order),
    toggleDebugDetails: () => settings.setDebugDetails(!settings.debugDetails),
  };
}
