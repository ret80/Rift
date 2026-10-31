/**
 * GameOverlays — игровые оверлеи поверх канваса.
 *
 * Здесь всё, что не является экраном меню: отсчёт, баннер, тост, пауза,
 * итоги забега, сенсорное управление, FPS-счётчик и финальные scanlines.
 */

import { useEffect, useRef } from "react";
import type { BannerData, CountData, StatsData, ToastData } from "../game/types/ui";
import type { Screen } from "./appState";
import PauseOverlay from "./screens/PauseOverlay";
import GameOverScreen from "./screens/GameOverScreen";
import TouchControls from "./TouchControls";
import ScreenDimmer from "./components/ScreenDimmer";

export interface GameOverlaysProps {
  screen: Screen;
  paused: boolean;
  stats: StatsData | null;
  banner: (BannerData & { id: number }) | null;
  toast: (ToastData & { id: number }) | null;
  countdown: CountData | null;
  isTouch: boolean;
  debugFps: boolean;
  /** Текущий сглаженный FPS из игры. */
  getFps: () => number;
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
  onRetry: () => void;
  onUpgrade: () => void;
  onVector: (active: boolean, x: number, y: number) => void;
  onPause: () => void;
}

export function GameOverlays(props: GameOverlaysProps) {
  const fpsTextRef = useRef<HTMLSpanElement | null>(null);
  const getFpsRef = useRef(props.getFps);
  getFpsRef.current = props.getFps;

  // Показываем сглаженный FPS, пока включён отладочный счётчик.
  useEffect(() => {
    if (!props.debugFps) return;
    const id = window.setInterval(() => {
      if (fpsTextRef.current) {
        fpsTextRef.current.textContent = String(Math.round(getFpsRef.current()));
      }
    }, 250);
    return () => window.clearInterval(id);
  }, [props.debugFps]);

  const { screen, paused, stats, banner, toast, countdown } = props;

  return (
    <>
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
              key={`countdown-${countdown.id}`}
              className="anim-count font-display mt-1 text-4xl text-[#eaffff] text-glow-cyan sm:text-5xl"
            >
              {countdown.value}
            </div>
          </div>
        </div>
      )}

      {screen === "game" && banner && (
        <div key={`banner-${banner.id}`} className="pointer-events-none absolute inset-0 z-30">
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
        <div key={`toast-${toast.id}`} className="pointer-events-none absolute inset-0 z-30">
          <div className="anim-toast absolute bottom-[16%] left-1/2 -translate-x-1/2">
            <div
              className={
                "max-w-[92vw] border px-3 py-1.5 text-center text-[10px] " +
                "tracking-[0.16em] sm:px-5 sm:py-2 sm:text-[12px] sm:tracking-[0.3em]"
              }
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
          onResume={props.onResume}
          onSettings={props.onSettings}
          onMenu={props.onMenu}
        />
      )}

      {screen === "game" && stats && (
        <GameOverScreen
          stats={stats}
          onRetry={props.onRetry}
          onUpgrade={props.onUpgrade}
          onMenu={props.onMenu}
        />
      )}

      {screen === "game" && !stats && !paused && props.isTouch && (
        <TouchControls
          onVector={props.onVector}
          onPause={props.onPause}
        />
      )}

      {/* FPS dev overlay */}
      {props.debugFps && (
        <div
          className={
            "pointer-events-none absolute z-30 border border-[#7dff9e]/40 " +
            "bg-[#07130c]/80 px-2 py-0.5 font-mono text-[10px] tracking-[0.15em] text-[#7dff9e]"
          }
          style={{
            left: "12px",
            bottom: "calc(env(safe-area-inset-bottom) + 12px)",
          }}
        >
          <span ref={fpsTextRef}>60</span> FPS
        </div>
      )}

      <div className="scanlines" />
    </>
  );
}
