import { useMemo, useReducer, useRef, useState } from "react";
import { ENEMY_KIND_COUNT } from "./game/balance/enemies";
import { createLocalStoragePort } from "./game/core/PersistencePort";
import type { PersistencePort } from "./game/core/PersistencePort";
import { useGameActions } from "./hooks/useGameActions";
import { useGameLifecycle } from "./hooks/useGameLifecycle";
import { usePersistentSettings } from "./hooks/usePersistentSettings";
import { HudLayer } from "./ui/HudLayer";
import { HudStore } from "./ui/hud/HudStore";
import { ScreenRouter } from "./ui/ScreenRouter";
import { GameOverlays } from "./ui/GameOverlays";
import { appReducer, INITIAL_APP_STATE, parseUrlParams } from "./ui/appState";

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

  /* Touch detection (runtime only, not persisted) */
  const [isTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );

  const { debug: urlDebug, wave: urlWave } = useMemo(() => parseUrlParams(), []);

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
      enabledEnemies: settings.enabledEnemies.length === ENEMY_KIND_COUNT
        ? null
        : settings.enabledEnemies,
      urlDebug,
      urlWave,
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
      onReady: (game) => setBest(game.getBest()),
      onAutoStart: () => dispatch({ type: "SET_SCREEN", screen: "game" }),
    },
  );

  const actions = useGameActions({
    screen,
    gameRef,
    storage,
    settings,
    setBest,
    dispatch,
  });

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
      />

      {screen === "game" && <HudLayer store={hudStore} godOn={settings.debugGod} />}

      <GameOverlays
        screen={screen}
        paused={paused}
        stats={stats}
        banner={banner}
        toast={toast}
        countdown={countdown}
        isTouch={isTouch}
        debugFps={settings.debugFps}
        getFps={() => gameRef.current?.fps() ?? 60}
        onResume={() => gameRef.current?.togglePause()}
        onSettings={() => actions.openSettings("pause")}
        onMenu={actions.toMenu}
        onRetry={actions.startGame}
        onUpgrade={() => actions.openUpgrade("gameover")}
        onVector={(active, x, y) => gameRef.current?.setTouch(active, x, y)}
        onPause={() => gameRef.current?.togglePause()}
      />
    </div>
  );
}

