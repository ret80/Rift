import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  Game,
  HudData,
  BannerData,
  ToastData,
  PopupData,
  CountData,
  StatsData,
} from "./game/game";
import { t, useT } from "./i18n";
import {
  MainMenu,
  SettingsScreen,
  HelpScreen,
  DebugScreen,
  PauseOverlay,
  GameOverScreen,
  HudLayer,
  HudRefs,
} from "./ui/Screens";
import { UpgradeScreen } from "./ui/UpgradeScreen";
import { resetUpgrades } from "./game/upgrades";

type Screen = "menu" | "settings" | "help" | "debug" | "upgrade" | "game";

function formatTime(s: number) {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const gameRef = useRef<Game | null>(null);
  const [screen, setScreen] = useState<Screen>("menu");
  const [paused, setPaused] = useState(false);
  const [stats, setStats] = useState<StatsData | null>(null);
  const [banner, setBanner] = useState<(BannerData & { id: number }) | null>(null);
  const [toast, setToast] = useState<(ToastData & { id: number }) | null>(null);
  const [countdown, setCountdown] = useState<CountData | null>(null);
  const [popups, setPopups] = useState<PopupData[]>([]);
  const [best, setBest] = useState(0);
  const [vols, setVols] = useState(() => {
    try {
      const raw = localStorage.getItem("rift9_volumes");
      if (raw) return JSON.parse(raw);
    } catch {
      /* ignore */
    }
    return { master: 0.8, sfx: 0.8, music: 0.55 };
  });

  /* dev tools state (persisted) */
  const [debugFps, setDebugFps] = useState(() => {
    try {
      return localStorage.getItem("rift9_debug_fps") === "1";
    } catch {
      return false;
    }
  });
  const [debugGod, setDebugGodState] = useState(() => {
    try {
      return localStorage.getItem("rift9_debug_god") === "1";
    } catch {
      return false;
    }
  });
  const [debugWave, setDebugWave] = useState(() => {
    try {
      const v = Number(localStorage.getItem("rift9_debug_wave"));
      return v >= 1 && v <= 50 ? v : 1;
    } catch {
      return 1;
    }
  });
  const fpsTextRef = useRef<HTMLDivElement | null>(null);

  const [isTouch] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches
  );

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
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const mqCompact = window.matchMedia("(max-width: 639px)");

    const onHud = (h: HudData) => {
      const r = hudRefs;
      const compact = mqCompact.matches;
      if (r.wave.current) r.wave.current.textContent = String(h.wave).padStart(2, "0");
      if (r.minerals.current) {
        const glyph = r.minerals.current.querySelector("svg");
        r.minerals.current.textContent = ` ${h.minerals}`;
        if (glyph) r.minerals.current.prepend(glyph);
      }
      if (r.parts.current) {
        r.parts.current.textContent = String(h.parts);
      }
      if (r.progress.current)
        r.progress.current.style.width = `${h.total > 0 ? Math.min(100, (h.killed / h.total) * 100) : 0}%`;
      if (r.status.current)
        r.status.current.textContent = t("hud.status", { g: h.guns, d: h.drones });
      if (r.hpFill.current) {
        const f = Math.max(0, h.hp / h.maxHp);
        r.hpFill.current.style.width = `${f * 100}%`;
        r.hpFill.current.style.background =
          f > 0.5 ? "#5ef2ff" : f > 0.25 ? "#ffb84d" : "#ff3b52";
        r.hpFill.current.style.boxShadow = `0 0 7px ${f > 0.5 ? "#5ef2ff" : f > 0.25 ? "#ffb84d" : "#ff3b52"}`;
      }
      if (r.time.current) r.time.current.textContent = `T+${formatTime(h.time)}`;
      if (r.score.current) r.score.current.textContent = String(h.score).padStart(6, "0");
      if (r.best.current) r.best.current.textContent = t("hud.best", { v: h.best });
      if (r.combo.current) {
        if (h.comboMult > 1.01) {
          r.combo.current.style.opacity = "1";
          r.combo.current.textContent = `×${h.comboMult.toFixed(1)}`;
        } else {
          r.combo.current.style.opacity = "0";
        }
      }
    };

    let bannerId = 0;
    let toastId = 0;
    const game = new Game(canvas, {
      onHud,
      onBanner: (b) => setBanner(b ? { ...b, id: bannerId++ } : null),
      onToast: (toast) => setToast(toast ? { ...toast, id: toastId++ } : null),
      onCountdown: (c) => setCountdown(c),
      onPopup: (p) => {
        setPopups((prev) => [...prev.slice(-24), p]);
        window.setTimeout(() => {
          setPopups((prev) => prev.filter((x) => x.id !== p.id));
        }, 950);
      },
      onStats: (s) => {
        setStats(s);
        setBest(s.best);
      },
      onPause: (p) => setPaused(p),
      onGameOver: () => {
        // Stats will be set via onStats when dying → over transition completes
      },
    });
    game.setVolumes(vols);
    gameRef.current = game;
    setBest(Number(localStorage.getItem("rift9_best")) || 0);

    // apply persisted god mode silently
    try {
      if (localStorage.getItem("rift9_debug_god") === "1") game.setDebugGod(true);
    } catch {
      /* ignore */
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

  const toggleDebugFps = () => {
    setDebugFps((v) => {
      const nv = !v;
      try {
        localStorage.setItem("rift9_debug_fps", nv ? "1" : "0");
      } catch {
        /* ignore */
      }
      return nv;
    });
  };

  const toggleDebugGod = () => {
    setDebugGodState((v) => {
      const nv = !v;
      try {
        localStorage.setItem("rift9_debug_god", nv ? "1" : "0");
      } catch {
        /* ignore */
      }
      gameRef.current?.setDebugGod(nv);
      return nv;
    });
  };

  const changeDebugWave = (n: number) => {
    setDebugWave(n);
    try {
      localStorage.setItem("rift9_debug_wave", String(n));
    } catch {
      /* ignore */
    }
    gameRef.current?.setStartWave(n);
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
    setStats(null);
    setBanner(null);
    setToast(null);
    setCountdown(null);
    setPopups([]);
    setScreen("game");
    g.startRun();
  };

  const toMenu = () => {
    gameRef.current?.toMenu();
    setStats(null);
    setBanner(null);
    setToast(null);
    setCountdown(null);
    setScreen("menu");
  };

  const changeVols = (v: typeof vols) => {
    setVols(v);
    gameRef.current?.setVolumes(v);
  };

  // remember which menu opened Settings so "Back" returns there
  const settingsFromRef = useRef<"menu" | "pause">("menu");
  const openSettings = (from: "menu" | "pause") => {
    settingsFromRef.current = from;
    setScreen("settings");
  };

  const popupsEl = useMemo(
    () => popups.map((p) => <FloatingPopup key={p.id} p={p} game={gameRef.current} />),
    [popups]
  );

  return (
    <div className="fixed inset-0 overflow-hidden bg-[#04070d]">
      <canvas ref={canvasRef} className="game-canvas" />

      {screen === "menu" && (
        <MainMenu
          best={best}
          onPlay={startGame}
          onSettings={() => openSettings("menu")}
          onHelp={() => setScreen("help")}
          onDebug={() => setScreen("debug")}
          onUpgrade={() => setScreen("upgrade")}
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
              g.audio.waveClear();
            }
          }}
          onReset={() => {
            if (window.confirm(t("settings.resetConfirm"))) {
              resetUpgrades(); // clear localStorage
              if (gameRef.current) {
                gameRef.current.forceReloadUpgrades();
              }
              setBest(0);
            }
          }}
          onBack={() => setScreen(settingsFromRef.current === "pause" ? "game" : "menu")}
        />
      )}

      {screen === "help" && <HelpScreen onBack={() => setScreen("menu")} />}

      {screen === "debug" && (
        <DebugScreen
          fpsOn={debugFps}
          godOn={debugGod}
          startWave={debugWave}
          onToggleFps={toggleDebugFps}
          onToggleGod={toggleDebugGod}
          onChangeWave={changeDebugWave}
          onBack={() => setScreen("menu")}
        />
      )}

      {screen === "upgrade" && (
        <UpgradeScreen
          game={gameRef.current}
          onBack={() => setScreen("menu")}
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

      {/* floating score popups (world → screen space) */}
      {screen === "game" && popupsEl}

      {screen === "game" && paused && !stats && (
        <PauseOverlay
          onResume={() => gameRef.current?.togglePause()}
          onSettings={() => openSettings("pause")}
          onMenu={toMenu}
        />
      )}

      {screen === "game" && stats && (
        <GameOverScreen stats={stats} onRetry={startGame} onMenu={toMenu} />
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
            right: "12px",
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

/* world→screen projected floating popup */
function FloatingPopup(props: { p: PopupData; game: Game | null }) {
  const [pos, setPos] = useState({ x: -100, y: -100 });
  useEffect(() => {
    const g = props.game as unknown as {
      camX: number;
      camY: number;
      zoom: number;
    } | null;
    if (!g) return;
    const w = window.innerWidth;
    const h = window.innerHeight;
    const x = w / 2 + (props.p.x - g.camX) * g.zoom;
    const y = h / 2 + (props.p.y - g.camY) * g.zoom;
    setPos({ x, y });
  }, [props.p, props.game]);
  return (
    <div
      className="anim-popup pointer-events-none absolute z-30 font-display text-sm"
      style={{ left: pos.x, top: pos.y, color: props.p.color }}
    >
      {props.p.text}
    </div>
  );
}

/* ---------------- virtual joystick (touch devices) ---------------- */

function TouchControls(props: {
  onVector: (active: boolean, x: number, y: number) => void;
  onPause: () => void;
}) {
  const t = useT();
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const activeId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const R = 56;

  const place = (el: HTMLDivElement | null, x: number, y: number, show: boolean) => {
    if (!el) return;
    el.style.left = `${x}px`;
    el.style.top = `${y}px`;
    el.style.opacity = show ? "1" : "0";
  };

  const onDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (activeId.current !== null || e.pointerType !== "touch") return;
    activeId.current = e.pointerId;
    origin.current = { x: e.clientX, y: e.clientY };
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* noop */
    }
    place(baseRef.current, e.clientX, e.clientY, true);
    place(knobRef.current, e.clientX, e.clientY, true);
    if (hintRef.current) hintRef.current.style.opacity = "0";
    props.onVector(true, 0, 0);
  };

  const onMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeId.current) return;
    let dx = e.clientX - origin.current.x;
    let dy = e.clientY - origin.current.y;
    const d = Math.hypot(dx, dy);
    if (d > R) {
      dx = (dx / d) * R;
      dy = (dy / d) * R;
    }
    place(knobRef.current, origin.current.x + dx, origin.current.y + dy, true);
    props.onVector(true, dx / R, dy / R);
  };

  const onEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeId.current) return;
    activeId.current = null;
    place(baseRef.current, 0, 0, false);
    place(knobRef.current, 0, 0, false);
    if (hintRef.current) hintRef.current.style.opacity = "1";
    props.onVector(false, 0, 0);
  };

  return (
    <>
      <div
        className="absolute inset-0 z-10 select-none"
        style={{ touchAction: "none" }}
        onContextMenu={(e) => e.preventDefault()}
        onPointerDown={onDown}
        onPointerMove={onMove}
        onPointerUp={onEnd}
        onPointerCancel={onEnd}
      >
        <div
          ref={baseRef}
          className="pointer-events-none absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150"
        >
          <svg viewBox="0 0 128 128" className="h-full w-full" fill="none">
            <circle cx="64" cy="64" r="62" stroke="#5ef2ff" strokeOpacity="0.35" strokeDasharray="10 7" />
            <circle cx="64" cy="64" r="34" stroke="#5ef2ff" strokeOpacity="0.15" />
          </svg>
        </div>
        <div
          ref={knobRef}
          className="pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 opacity-0 transition-opacity duration-150"
        >
          <div className="h-full w-full rotate-45 border-2 border-[#5ef2ff] bg-[#5ef2ff]/10 shadow-[0_0_18px_rgba(94,242,255,0.45)]" />
        </div>
        <div
          ref={hintRef}
          className="pointer-events-none absolute left-1/2 -translate-x-1/2 text-[8px] tracking-[0.22em] whitespace-nowrap text-[#6f86a8]/75 transition-opacity"
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 58px)" }}
        >
          {t("help.touch")}
        </div>
      </div>
      <button
        className="absolute z-[35] flex h-11 w-11 items-center justify-center border border-[#5ef2ff]/30 bg-[#050b16]/65 text-[#9df1ff] active:bg-[#5ef2ff]/20"
        style={{
          right: "calc(env(safe-area-inset-right) + 12px)",
          bottom: "calc(env(safe-area-inset-bottom) + 12px)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => props.onPause()}
        aria-label="Pause"
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
          <rect x="1" y="1" width="4" height="14" />
          <rect x="9" y="1" width="4" height="14" />
        </svg>
      </button>
    </>
  );
}
