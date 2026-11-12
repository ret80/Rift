/**
 * GameOverlays — игровые оверлеи поверх канваса.
 *
 * Здесь всё, что не является экраном меню: отсчёт, баннер, тост, пауза,
 * итоги забега, сенсорное управление, FPS-счётчик и финальные scanlines.
 */

import type { MutableRefObject } from "react";
import { useEffect, useRef } from "react";
import { useT } from "../i18n";
import type { HudStore } from "./hud/HudStore";
import type { BannerData, CountData, StatsData, ToastData } from "../game/types/ui";
import type { Screen } from "./appState";
import ScreenDimmer from "./components/ScreenDimmer";
import type { GamepadNavHandlers } from "./ScreenRouter";
import GameOverScreen from "./screens/GameOverScreen";
import PauseOverlay from "./screens/PauseOverlay";
import TouchControls from "./components/TouchControls";

export interface GameOverlaysProps {
  screen: Screen;
  paused: boolean;
  stats: StatsData | null;
  banner: (BannerData & { id: number }) | null;
  toast: (ToastData & { id: number }) | null;
  countdown: CountData | null;
  isTouch: boolean;
  isGamepad: boolean;
  debugFps: boolean;
  /** Текущий сглаженный FPS из игры. */
  getFps: () => number;
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
  onRetry: () => void;
  onMeta: () => void;
  /** Открыть ангар во время отсчёта между волнами. */
  onOpenHangar?: () => void;
  onVector: (active: boolean, x: number, y: number) => void;
  onPause: () => void;
  /** Рывок с тач-кнопки. */
  onDash: () => void;
  /** Хранилище HUD (для индикации рывка на тач-кнопке). */
  store?: HudStore;
  /** Ref для навигации геймпада (общий с ScreenRouter). */
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}

export function GameOverlays(props: GameOverlaysProps) {
  const t = useT();
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

  const { screen, paused, stats, banner, toast, countdown, isGamepad } = props;

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
          {props.onOpenHangar && (
            <div
              className="pointer-events-auto absolute bottom-10 left-1/2 -translate-x-1/2 sm:bottom-12"
              style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            >
              <button
                type="button"
                onClick={props.onOpenHangar}
                className={
                  "border border-[#5ef2ff]/50 bg-[#071019]/80 px-6 py-2 font-display " +
                  "text-xs tracking-[0.28em] text-[#eaffff] shadow-[0_0_18px_rgba(94,242,255,0.18)] " +
                  "transition hover:border-[#5ef2ff] hover:bg-[#0b1a28]/90 sm:text-sm"
                }
              >
                {t("upgrade.hangarTitle")}
              </button>
            </div>
          )}
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
          isGamepad={isGamepad}
          gamepadNavRef={props.gamepadNavRef}
        />
      )}

      {screen === "game" && stats && (
        <GameOverScreen
          stats={stats}
          onRetry={props.onRetry}
          onMeta={props.onMeta}
          onMenu={props.onMenu}
          isGamepad={isGamepad}
          gamepadNavRef={props.gamepadNavRef}
        />
      )}

      {screen === "game" && !stats && !paused && props.isTouch && (
        <TouchControls
          onVector={props.onVector}
          onPause={props.onPause}
          onDash={props.onDash}
          store={props.store!}
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
