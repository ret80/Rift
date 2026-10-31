/**
 * useGameActions — команды UI к игре и навигация по экранам.
 *
 * Собирает обработчики, которые раньше жили прямо в `App.tsx`: старт/выход
 * из забега, настройки, отладка, переходы между меню и обработку ESC.
 */

import { useEffect, useRef, type Dispatch, type MutableRefObject } from "react";
import { t } from "../i18n";
import { resetGameState } from "../game/resetGameState";
import { resetUpgrades } from "../game/upgrades";
import type { Game } from "../game/game";
import type { PersistencePort } from "../game/core/PersistencePort";
import type { PersistentSettings } from "./usePersistentSettings";
import type { AppAction, Screen } from "../ui/appState";
import type { PickupKind } from "../game/balance";
import type { EnemyKind } from "../game/balance/enemies";
import { ALL_PICKUP_KINDS } from "../game/balance/drops";
import { ENEMY_KIND_COUNT } from "../game/balance/enemies";
import type { MenuTrackId, CombatTrackId } from "../game/audio/tracks";
import type { PhysicsEngineId } from "../game/physics";

export interface GameActions {
  startGame(): void;
  toMenu(): void;
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
  openUpgrade(from: "menu" | "gameover"): void;
  closeUpgrade(): void;
  toggleEnemy(kind: EnemyKind): void;
  togglePickup(kind: PickupKind): void;
  toggleDebugFps(): void;
  toggleDebugGod(): void;
  changeDebugWave(n: number): void;
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
  const upgradeFromRef = useRef<"menu" | "gameover">("menu");

  const closeSettings = () => dispatch({
    type: "SET_SCREEN",
    screen: settingsFromRef.current === "pause" ? "game" : "menu",
  });

  const closeUpgrade = () => dispatch({
    type: "SET_SCREEN",
    screen: upgradeFromRef.current === "gameover" ? "game" : "menu",
  });

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
    game.setStartWave(settings.debugWave);
    game.setEnabledEnemies(
      settings.enabledEnemies.length === ENEMY_KIND_COUNT
        ? null
        : settings.enabledEnemies
    );
    resetOverlays();
    dispatch({ type: "SET_SCREEN", screen: "game" });
    game.startRun();
  };

  const toMenu = () => {
    gameRef.current?.toMenu();
    resetOverlays();
    dispatch({ type: "SET_SCREEN", screen: "menu" });
  };

  // При открытии отладки применяем актуальные наборы врагов/пикапов.
  useEffect(() => {
    if (screen !== "debug") return;
    gameRef.current?.setEnabledEnemies(
      settings.enabledEnemies.length === ENEMY_KIND_COUNT
        ? null
        : settings.enabledEnemies
    );
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
      screen === "settings" || screen === "help" || screen === "debug" || screen === "upgrade";
    if (!isMenuWithBack) return;

    const handler = (e: KeyboardEvent) => {
      if (e.code !== "Escape") return;
      e.stopPropagation();
      if (screen === "settings") {
        dispatch({
          type: "SET_SCREEN",
          screen: settingsFromRef.current === "pause" ? "game" : "menu",
        });
      } else if (screen === "upgrade") {
        dispatch({
          type: "SET_SCREEN",
          screen: upgradeFromRef.current === "gameover" ? "game" : "menu",
        });
      } else {
        dispatch({ type: "SET_SCREEN", screen: "menu" });
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [screen, dispatch]);

  return {
    startGame,
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
      resetUpgrades(storage);
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
    openUpgrade: (from) => {
      upgradeFromRef.current = from;
      dispatch({ type: "SET_SCREEN", screen: "upgrade" });
    },
    closeUpgrade,
    toggleEnemy: (kind) => {
      settings.setEnabledEnemies((prev) => {
        const next = prev.includes(kind)
          ? prev.filter((k) => k !== kind)
          : [...prev, kind];
        gameRef.current?.setEnabledEnemies(
          next.length === ENEMY_KIND_COUNT ? null : next
        );
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
    toggleDebugDetails: () => settings.setDebugDetails(!settings.debugDetails),
  };
}
