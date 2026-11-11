import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PersistencePort } from "./game/core/PersistencePort";
import { createLocalStoragePort } from "./game/core/PersistencePort";
import { useGameActions } from "./hooks/useGameActions";
import { useGameLifecycle } from "./hooks/useGameLifecycle";
import { usePersistentSettings } from "./hooks/usePersistentSettings";
import { appReducer, INITIAL_APP_STATE, parseUrlParams } from "./ui/appState";
import { GameOverlays } from "./ui/GameOverlays";
import { HudStore } from "./ui/hud/HudStore";
import { HudLayer } from "./ui/HudLayer";

import type { GamepadNavHandlers } from "./ui/ScreenRouter";
import { ScreenRouter } from "./ui/ScreenRouter";

/**
 * App — композиция UI: состояние экранов, настройки и два независимых
 * контура — экраны (`ScreenRouter`) и игровые оверлеи (`GameOverlays`).
 *
 * Жизненный цикл движка — в `useGameLifecycle`, команды — в `useGameActions`,
 * HUD-данные — в `HudStore`.
 */
export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const storageRef = useRef<PersistencePort | null>(null);
  if (!storageRef.current) {
    storageRef.current = createLocalStoragePort();
  }
  const hudStoreRef = useRef<HudStore | null>(null);
  if (!hudStoreRef.current) {
    hudStoreRef.current = new HudStore();
  }
  const storage = storageRef.current;
  const hudStore = hudStoreRef.current;

  const [state, dispatch] = useReducer(appReducer, INITIAL_APP_STATE);
  const { screen, paused, stats, banner, toast, countdown } = state;

  const settings = usePersistentSettings();
  const [best, setBest] = useState(0);
  const [isGamepadConnected, setIsGamepadConnected] = useState(false);

  /* Touch detection (runtime only, not persisted) */
  const [isTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );

  const { debug: urlDebug, wave: urlWave, waveOverride, record: urlRecord } = useMemo(
    () => parseUrlParams(),
    []
  );

  /* Refs для доступа к actions/gameRef из замыканий. */
  const actionsRef = useRef<any>(null);
  const gameRef = useGameLifecycle(
    canvasRef,
    storage,
    hudStore,
    {
      volumes: settings.vols,
      menuTrack: settings.menuTrack,
      combatTrack: settings.combatTrack,
      physicsEngine: settings.physicsEngine,
      debugGod: settings.debugGod,
      urlDebug,
      urlWave,
      waveOverride,
    },
    {
      onBanner: (b) => dispatch({ type: "SET_BANNER", banner: b }),
      onToast: (nextToast) => dispatch({ type: "SET_TOAST", toast: nextToast }),
      onCountdown: (c) => dispatch({ type: "SET_COUNTDOWN", countdown: c }),
      onStats: (s) => {
        dispatch({ type: "SET_STATS", stats: s });
        if (s) setBest(s.best);
      },
      onPause: (p) => dispatch({ type: "SET_PAUSED", paused: p }),
      onTactical: (active) => dispatch({ type: "SET_TACTICAL", tactical: active }),
      onTestRunEnd: () => actionsRef.current?.finishTestLevel(),
      onReady: (game) => setBest(game.getBest()),
      onAutoStart: () => dispatch({ type: "SET_SCREEN", screen: "game" }),
      onGamepadConfirm: () => gamepadConfirmRef.current(),
      onGamepadCancel: () => gamepadCancelRef.current(),
      onGamepadNavUp: () => gamepadNavRef.current.up(),
      onGamepadNavDown: () => gamepadNavRef.current.down(),
      onGamepadNavLeft: () => gamepadNavRef.current.left(),
      onGamepadNavRight: () => gamepadNavRef.current.right(),
      onGamepadTabLeft: () => gamepadNavRef.current.tabLeft?.(),
      onGamepadTabRight: () => gamepadNavRef.current.tabRight?.(),
    },
  );

  /* Actions создаются после gameRef. */
  const actions = useGameActions({
    screen,
    gameRef,
    storage,
    settings,
    setBest,
    dispatch,
  });
  actionsRef.current = actions;

  /* ===== Gamepad navigation callbacks ===== */

  /** Ref, в который активный экран регистрирует свои навигационные функции. */
  const gamepadNavRef = useRef<GamepadNavHandlers>({
    up: () => {},
    down: () => {},
    left: () => {},
    right: () => {},
    confirm: null,
  });

  /** Ref для актуального обработчика cancel (избегает stale closure в game engine). */
  const gamepadCancelRef = useRef<() => void>(() => {});
  /** Ref для актуального обработчика confirm. */
  const gamepadConfirmRef = useRef<() => void>(() => {});

  const gamepadConfirm = useCallback(() => {
    // Если экран зарегистрировал свой confirm — используем его.
    const screenConfirm = gamepadNavRef.current.confirm;
    if (screenConfirm) {
      screenConfirm();
      return;
    }
    // Иначе — fallback-логика по экранам.
    const act = actionsRef.current;
    if (!act) return;
    switch (screen) {
      case "settings":
      case "help":
      case "debug":
      case "upgrade":
        if (screen === "settings") {
          act.closeSettings();
        } else if (screen === "upgrade") {
          act.closeUpgrade();
        } else {
          act.openMenu();
        }
        break;
      case "game":
        if (paused) {
          gameRef.current?.togglePause();
        } else if (stats) {
          act.startGame();
        }
        break;
    }
  }, [screen, paused, stats, gameRef]);
  gamepadConfirmRef.current = gamepadConfirm;

  const gamepadCancel = useCallback(() => {
    // Экран может перехватить B (например, чтобы закрыть выпадающий список).
    const screenCancel = gamepadNavRef.current.cancel;
    if (screenCancel) {
      screenCancel();
      return;
    }
    const act = actionsRef.current;
    if (!act) return;
    switch (screen) {
      case "menu":
        break;
      case "settings":
      case "help":
      case "debug":
      case "upgrade":
        if (screen === "settings") {
          act.closeSettings();
        } else if (screen === "upgrade") {
          act.closeUpgrade();
        } else {
          act.openMenu();
        }
        break;
      case "game":
        if (paused) {
          act.toMenu();
        }
        break;
    }
  }, [screen, paused]);
  gamepadCancelRef.current = gamepadCancel;

  /* Gamepad connection state */
  useEffect(() => {
    const game = gameRef.current;
    if (!game) return;
    setIsGamepadConnected(game.isGamepadConnected);
    const id = window.setInterval(() => {
      setIsGamepadConnected(game.isGamepadConnected);
    }, 500);
    return () => window.clearInterval(id);
  }, [gameRef]);

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04070d]">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Game canvas" role="img" />

      <ScreenRouter
        screen={screen}
        best={best}
        urlDebug={urlDebug}
        gameRef={gameRef}
        settings={settings}
        actions={actions}
        isGamepad={isGamepadConnected}
        gamepadNavRef={gamepadNavRef}
      />

      {screen === "game" && (
        <HudLayer
          store={hudStore}
          godOn={settings.debugGod}
          recordEnabled={urlRecord}
          onToggleRecord={actions.toggleRecording}
          onSetDroneOrder={actions.setDroneOrder}
        />
      )}

      <GameOverlays
        screen={screen}
        paused={paused}
        stats={stats}
        banner={banner}
        toast={toast}
        countdown={countdown}
        isTouch={isTouch}
        isGamepad={isGamepadConnected}
        debugFps={settings.debugFps}
        getFps={() => gameRef.current?.fps() ?? 60}
        onResume={() => gameRef.current?.togglePause()}
        onSettings={() => actions.openSettings("pause")}
        onMenu={actions.toMenu}
        onRetry={actions.startGame}
        onUpgrade={() => actions.openUpgrade("gameover")}
        onVector={(active, x, y) => gameRef.current?.setTouch(active, x, y)}
        onPause={() => gameRef.current?.togglePause()}
        onDash={() => gameRef.current?.requestDash()}
        store={hudStore}
        gamepadNavRef={gamepadNavRef}
      />
    </div>
  );
}
