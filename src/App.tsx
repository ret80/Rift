import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import type { PickupKind } from "./game/balance";
import { ALL_PICKUP_KINDS } from "./game/balance/drops";
import { EnemyKind, ENEMY_KIND_COUNT } from "./game/balance/enemies";
import type {
    BannerData,
    CountData,
    StatsData,
    ToastData
} from "./game/types/ui";

import { Game } from "./game/game";
import { resetGameState } from "./game/resetGameState";
import { resetUpgrades } from "./game/upgrades";
import { createLocalStoragePort } from "./game/core/PersistencePort";
import type { PersistencePort } from "./game/core/PersistencePort";
import { useHudUpdater } from "./hooks/useHudUpdater";
import { usePersistentSettings } from "./hooks/usePersistentSettings";
import { t } from "./i18n";
import {
    DebugScreen,
    GameOverScreen,
    HelpScreen,
    HudLayer,
    HudRefs,
    MainMenu,
    PauseOverlay,
    SettingsScreen,
} from "./ui/Screens";
import TouchControls from "./ui/TouchControls";
import { UpgradeScreen } from "./ui/UpgradeScreen";
import type { LoadoutBarHandle } from "./ui/components/LoadoutBar";
import ScreenDimmer from "./ui/components/ScreenDimmer";

type Screen = "menu" | "settings" | "help" | "debug" | "upgrade" | "game";

/* ======================== Reducer types ======================== */

interface AppState {
  screen: Screen;
  paused: boolean;
  stats: StatsData | null;
  banner: (BannerData & { id: number }) | null;
  toast: (ToastData & { id: number }) | null;
  countdown: CountData | null;
}

type AppAction =
  | { type: "SET_SCREEN"; screen: Screen }
  | { type: "SET_PAUSED"; paused: boolean }
  | { type: "SET_STATS"; stats: StatsData | null }
  | { type: "SET_BANNER"; banner: (BannerData & { id: number }) | null }
  | { type: "SET_TOAST"; toast: (ToastData & { id: number }) | null }
  | { type: "SET_COUNTDOWN"; countdown: CountData | null };

const initState: AppState = {
  screen: "menu",
  paused: false,
  stats: null,
  banner: null,
  toast: null,
  countdown: null,
};

/* ======================== URL params ======================== */

function parseUrlParams(): { debug: boolean; wave: number | null } {
  if (typeof window === "undefined") return { debug: false, wave: null };
  const params = new URLSearchParams(window.location.search);
  const debug = params.has("debug");
  const waveParam = params.get("wave");
  const wave = waveParam !== null ? parseInt(waveParam, 10) : null;
  return { debug, wave: wave && wave > 0 ? wave : null };
}

function appReducer(state: AppState, action: AppAction): AppState {
  switch (action.type) {
    case "SET_SCREEN":
      return { ...state, screen: action.screen };
    case "SET_PAUSED":
      return { ...state, paused: action.paused };
    case "SET_STATS":
      return { ...state, stats: action.stats };
    case "SET_BANNER":
      return { ...state, banner: action.banner };
    case "SET_TOAST":
      return { ...state, toast: action.toast };
    case "SET_COUNTDOWN":
      return { ...state, countdown: action.countdown };
    default:
      return state;
  }
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const fpsTextRef = useRef<HTMLDivElement | null>(null);
  const storageRef = useRef<PersistencePort | null>(null);
  if (!storageRef.current) {
    storageRef.current = createLocalStoragePort();
  }

  const [state, dispatch] = useReducer(appReducer, initState);
  const { screen, paused, stats, banner, toast, countdown } = state;

  /* Persisted state — настройки вынесены в отдельный хук */
  const {
    vols, setVols,
    debugFps, setDebugFps,
    debugGod, setDebugGod,
    debugWave, setDebugWave,
    debugDetails, setDebugDetails,
    enabledEnemies, setEnabledEnemies,
    enabledPickups, setEnabledPickups,
  } = usePersistentSettings();

  /* Touch detection (runtime only, not persisted) */
  const [isTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );

  /* URL params */
  const urlParams = useMemo(() => parseUrlParams(), []);
  const { debug: urlDebug, wave: urlWave } = urlParams;

  /* Перехват ESC для экранов с кнопкой "Назад" — чтобы закрывать меню,
      а не снимать паузу. Ловим на фазе capture (до игрового слушателя). */
  useEffect(() => {
    const isMenuWithBack = screen === "settings" || screen === "help" || screen === "debug" || screen === "upgrade";
    if (!isMenuWithBack) return;

    const handler = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        e.stopPropagation();
        // Определяем куда возвращаться
        if (screen === "settings") {
          dispatch({ type: "SET_SCREEN", screen: settingsFromRef.current === "pause" ? "game" : "menu" });
        } else if (screen === "upgrade") {
          dispatch({ type: "SET_SCREEN", screen: upgradeFromRef.current === "gameover" ? "game" : "menu" });
        } else {
          // help, debug — всегда в меню
          dispatch({ type: "SET_SCREEN", screen: "menu" });
        }
      }
    };
    window.addEventListener("keydown", handler, { capture: true });
    return () => window.removeEventListener("keydown", handler, { capture: true });
  }, [screen, dispatch]);

  /* Best score — persisted separately at game end */
  const [best, setBest] = useState(0);

  const hudRefs: HudRefs = {
    wave: useRef<HTMLDivElement | null>(null),
    progress: useRef<HTMLDivElement | null>(null),
    status: useRef<HTMLDivElement | null>(null),
    hullPanel: useRef<HTMLDivElement | null>(null),
    hpFill: useRef<HTMLDivElement | null>(null),
    time: useRef<HTMLDivElement | null>(null),
    score: useRef<HTMLDivElement | null>(null),
    best: useRef<HTMLDivElement | null>(null),
    combo: useRef<HTMLDivElement | null>(null),
    minerals: useRef<HTMLDivElement | null>(null),
    parts: useRef<HTMLDivElement | null>(null),
    loadoutBar: useRef<LoadoutBarHandle | null>(null),
  };

  const onHud = useHudUpdater(hudRefs, t);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Destroy any existing game instance (e.g. from HMR re-run)
    if (gameRef.current) {
      gameRef.current.destroy();
      gameRef.current = null;
    }

    let bannerId = 0;
    let toastId = 0;
    const storage = storageRef.current!;
    const game = new Game(canvas, {
      onHud,
      onBanner: (b) => dispatch({ type: "SET_BANNER", banner: b ? { ...b, id: bannerId++ } : null }),
      onToast: (t) => dispatch({ type: "SET_TOAST", toast: t ? { ...t, id: toastId++ } : null }),
      onCountdown: (c) => dispatch({ type: "SET_COUNTDOWN", countdown: c }),
      onStats: (s) => {
        dispatch({ type: "SET_STATS", stats: s });
        setBest(s.best);
      },
      onPause: (p) => dispatch({ type: "SET_PAUSED", paused: p }),
      onGameOver: () => {
        // Stats will be set via onStats when dying → over transition completes
      },
    }, storage);
    game.setVolumes(vols);
    game.setEnabledEnemies(enabledEnemies.length === ENEMY_KIND_COUNT ? null : enabledEnemies);
    gameRef.current = game;
    setBest(Number(localStorage.getItem("rift9_best")) || 0);

    // apply persisted god mode silently
    try {
      if (localStorage.getItem("rift9_debug_god") === "1") game.setDebugGod(true);
    } catch {
      /* ignore */
    }

    // Apply URL debug param
    if (urlDebug) {
      game.setDebugGod(true);
    }

    // Apply URL wave param — auto-start game at specified wave
    if (urlWave) {
      game.setStartWave(urlWave);
      game.audio.init();
      game.audio.startMusic();
      game.startRun();
      dispatch({ type: "SET_SCREEN", screen: "game" });
    }

    // Arm audio as early as possible so it unlocks on the first gesture.
    const bootAudio = () => {
      const g = gameRef.current;
      if (!g) return;
      g.audio.init();
      g.audio.startMusic();
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ---------------- dev tools ---------------- */

  const toggleDebugFps = () => setDebugFps(!debugFps);

  const toggleDebugGod = () => {
    const nv = !debugGod;
    setDebugGod(nv);
    gameRef.current?.setDebugGod(nv);
  };

  const changeDebugWave = (n: number) => {
    setDebugWave(n);
    gameRef.current?.setStartWave(n);
  };

  const toggleDebugDetails = () => setDebugDetails(!debugDetails);

  // Sync enabled enemies/pickups to game when changing from persisted state
  useEffect(() => {
    if (screen === "debug") {
      gameRef.current?.setEnabledEnemies(
        enabledEnemies.length === ENEMY_KIND_COUNT ? null : enabledEnemies
      );
      gameRef.current?.setEnabledPickups(
        enabledPickups.length === ALL_PICKUP_KINDS.length ? null : enabledPickups
      );
    }
  }, [screen, enabledEnemies, enabledPickups]);

  const toggleEnemy = (kind: EnemyKind) => {
    setEnabledEnemies((prev) => {
      const next = prev.includes(kind)
        ? prev.filter((k) => k !== kind)
        : [...prev, kind];
      // Update game immediately if running
      gameRef.current?.setEnabledEnemies(
        next.length === ENEMY_KIND_COUNT ? null : next
      );
      return next;
    });
  };

  const togglePickup = (kind: PickupKind) => {
    setEnabledPickups((prev) => {
      const next = prev.includes(kind)
        ? prev.filter((k) => k !== kind)
        : [...prev, kind];
      gameRef.current?.setEnabledPickups(
        next.length === ALL_PICKUP_KINDS.length ? null : next
      );
      return next;
    });
  };

  // poll the engine's smoothed frame rate while the overlay is visible
  useEffect(() => {
    if (!debugFps) return;
    const id = window.setInterval(() => {
      const g = gameRef.current;
      if (g && fpsTextRef.current) {
        fpsTextRef.current.textContent = String(Math.round(g.fps()));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [debugFps]);

  /* ---------------- actions ---------------- */

  const startGame = () => {
    const g = gameRef.current;
    if (!g) return;
    g.audio.init();
    g.audio.startMusic();
    g.setStartWave(debugWave);
    g.setEnabledEnemies(enabledEnemies.length === ENEMY_KIND_COUNT ? null : enabledEnemies);
    resetGameState({
      setStats: (s) => dispatch({ type: "SET_STATS", stats: s }),
      setBanner: (b) => dispatch({ type: "SET_BANNER", banner: b }),
      setToast: (t) => dispatch({ type: "SET_TOAST", toast: t }),
      setCountdown: (c) => dispatch({ type: "SET_COUNTDOWN", countdown: c }),
    });
    dispatch({ type: "SET_SCREEN", screen: "game" });
    g.startRun();
  };

  const toMenu = () => {
    gameRef.current?.toMenu();
    resetGameState({
      setStats: (s) => dispatch({ type: "SET_STATS", stats: s }),
      setBanner: (b) => dispatch({ type: "SET_BANNER", banner: b }),
      setToast: (t) => dispatch({ type: "SET_TOAST", toast: t }),
      setCountdown: (c) => dispatch({ type: "SET_COUNTDOWN", countdown: c }),
    });
    dispatch({ type: "SET_SCREEN", screen: "menu" });
  };

  const changeVols = (v: typeof vols) => {
    setVols(v);
    gameRef.current?.setVolumes(v);
  };

  // remember which menu opened Settings so "Back" returns there
  const settingsFromRef = useRef<"menu" | "pause">("menu");
  const openSettings = (from: "menu" | "pause") => {
    settingsFromRef.current = from;
    dispatch({ type: "SET_SCREEN", screen: "settings" });
  };

  // remember where we opened Upgrade from
  const upgradeFromRef = useRef<"menu" | "gameover">("menu");
  const openUpgrade = (from: "menu" | "gameover") => {
    upgradeFromRef.current = from;
    dispatch({ type: "SET_SCREEN", screen: "upgrade" });
  };

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04070d]">
      <canvas ref={canvasRef} className="game-canvas" aria-label="Game canvas" role="img" />

      {screen === "menu" && (
        <MainMenu
          best={best}
          onPlay={startGame}
          onSettings={() => openSettings("menu")}
          onHelp={() => dispatch({ type: "SET_SCREEN", screen: "help" })}
          onDebug={() => dispatch({ type: "SET_SCREEN", screen: "debug" })}
          onUpgrade={() => openUpgrade("menu")}
          showDebug={urlDebug}
        />
      )}

      {screen === "settings" && (
        <SettingsScreen
          vols={vols}
          onChange={changeVols}
          onTest={() => {
            const g = gameRef.current;
            if (g) {
              g.audio.init();
              g.audio.playWaveClear();
            }
          }}
          onReset={() => {
            if (window.confirm(t("settings.resetConfirm"))) {
              resetUpgrades(storageRef.current!);
              if (gameRef.current) {
                gameRef.current.refreshUpgrades();
              }
              setBest(0);
            }
          }}
          onBack={() => dispatch({
            type: "SET_SCREEN",
            screen: settingsFromRef.current === "pause" ? "game" : "menu",
          })}
        />
      )}

      {screen === "help" && <HelpScreen onBack={() => dispatch({ type: "SET_SCREEN", screen: "menu" })} />}

      {screen === "debug" && (
        <DebugScreen
          fpsOn={debugFps}
          godOn={debugGod}
          startWave={debugWave}
          detailsOn={debugDetails}
          enabledEnemies={enabledEnemies}
          onToggleEnemy={toggleEnemy}
          enabledPickups={enabledPickups}
          onTogglePickup={togglePickup}
          onToggleFps={toggleDebugFps}
          onToggleGod={toggleDebugGod}
          onChangeWave={changeDebugWave}
          onToggleDetails={toggleDebugDetails}
          onBack={() => dispatch({ type: "SET_SCREEN", screen: "menu" })}
        />
      )}

      {screen === "upgrade" && (
        <UpgradeScreen
          game={gameRef.current}
          detailsOn={debugDetails}
          from={upgradeFromRef.current}
          onBack={() => dispatch({ type: "SET_SCREEN", screen: upgradeFromRef.current === "gameover" ? "game" : "menu" })}
        />
      )}

      {screen === "game" && <HudLayer r={hudRefs} godOn={debugGod} />}

      {screen === "game" && countdown && (
        <div className="pointer-events-none absolute inset-0 z-30">
          <div className="absolute top-[30%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            <div
              className="font-display text-lg tracking-[0.42em] whitespace-nowrap text-white sm:text-2xl"
              style={{ marginRight: "-0.42em" }}
            >
              {countdown.label}
            </div>
            <div
              key={countdown.id}
              className="anim-count font-display mt-1 text-4xl text-[#eaffff] text-glow-cyan sm:text-5xl"
            >
              {countdown.value}
            </div>
          </div>
        </div>
      )}

      {screen === "game" && banner && (
        <div key={banner.id} className="pointer-events-none absolute inset-0 z-30">
          <div className="anim-banner absolute top-[26%] left-1/2 -translate-x-1/2 -translate-y-1/2 text-center">
            {/* same type treatment as the pre-wave "ВОЛНА: XX" label */}
            <div
              className="font-display text-lg tracking-[0.42em] whitespace-nowrap text-white sm:text-2xl"
              style={{ marginRight: "-0.42em" }}
            >
              {banner.title}
            </div>
          </div>
        </div>
      )}

      {screen === "game" && toast && (
        <div key={toast.id} className="pointer-events-none absolute inset-0 z-30">
          <div className="anim-toast absolute bottom-[16%] left-1/2 -translate-x-1/2">
            <div
              className="max-w-[92vw] border px-3 py-1.5 text-center text-[10px] tracking-[0.16em] sm:px-5 sm:py-2 sm:text-[12px] sm:tracking-[0.3em]"
              style={{
                color: toast.color ?? "#5ef2ff",
                borderColor: `${toast.color ?? "#5ef2ff"}55`,
                background: "rgba(6,12,24,0.75)",
                boxShadow: `0 0 18px ${toast.color ?? "#5ef2ff"}22`,
              }}
            >
              {toast.text}
            </div>
          </div>
        </div>
      )}

      {/* затемнение фона при любом меню в игре */}
      {(paused || stats) && <ScreenDimmer />}

      {screen === "game" && paused && !stats && (
        <PauseOverlay
          onResume={() => gameRef.current?.togglePause()}
          onSettings={() => openSettings("pause")}
          onMenu={toMenu}
        />
      )}

      {screen === "game" && stats && (
        <GameOverScreen
          stats={stats}
          onRetry={startGame}
          onUpgrade={() => openUpgrade("gameover")}
          onMenu={toMenu}
        />
      )}

      {screen === "game" && !stats && !paused && isTouch && (
        <TouchControls
          onVector={(a, x, y) => gameRef.current?.setTouch(a, x, y)}
          onPause={() => gameRef.current?.togglePause()}
        />
      )}

      {/* FPS dev overlay */}
      {debugFps && (
        <div
          className="pointer-events-none absolute z-30 border border-[#7dff9e]/40 bg-[#07130c]/80 px-2 py-0.5 font-mono text-[10px] tracking-[0.15em] text-[#7dff9e]"
          style={{
            left: "12px",
            bottom: "calc(env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <span ref={fpsTextRef}>60</span> FPS
        </div>
      )}

      <div className="scanlines" />
    </div>
  );
}

