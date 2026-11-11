import React, { useRef } from "react";
import { useT } from "../i18n";
import { useHudData, type HudStore } from "./hud/HudStore";

export interface TouchControlsProps {
  onVector: (active: boolean, x: number, y: number) => void;
  onPause: () => void;
  /** Рывок: без тач-кнопки базовый глагол недоступен на телефоне. */
  onDash: () => void;
  /** HUD-хранилище для индикации готовности рывка. */
  store: HudStore;
}

export default function TouchControls({ onVector, onPause, onDash, store }: TouchControlsProps) {
  const dashData = useHudData(store);
  const t = useT();
  const baseRef = useRef<HTMLDivElement | null>(null);
  const knobRef = useRef<HTMLDivElement | null>(null);
  const hintRef = useRef<HTMLDivElement | null>(null);
  const activeId = useRef<number | null>(null);
  const origin = useRef({ x: 0, y: 0 });
  const R = 56;

  const place = (
    el: HTMLDivElement | null,
    x: number,
    y: number,
    show: boolean
  ) => {
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
    onVector(true, 0, 0);
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
    onVector(true, dx / R, dy / R);
  };

  const onEnd = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.pointerId !== activeId.current) return;
    activeId.current = null;
    place(baseRef.current, 0, 0, false);
    place(knobRef.current, 0, 0, false);
    if (hintRef.current) hintRef.current.style.opacity = "1";
    onVector(false, 0, 0);
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
          className={
            "pointer-events-none absolute h-32 w-32 -translate-x-1/2 -translate-y-1/2 " +
            "opacity-0 transition-opacity duration-150"
          }
        >
          <svg viewBox="0 0 128 128" className="h-full w-full" fill="none">
            <circle
              cx="64"
              cy="64"
              r="62"
              stroke="#5ef2ff"
              strokeOpacity="0.35"
              strokeDasharray="10 7"
            />
            <circle cx="64" cy="64" r="34" stroke="#5ef2ff" strokeOpacity="0.15" />
          </svg>
        </div>
        <div
          ref={knobRef}
          className={
            "pointer-events-none absolute h-14 w-14 -translate-x-1/2 -translate-y-1/2 " +
            "opacity-0 transition-opacity duration-150"
          }
        >
          <div
            className={
              "h-full w-full rotate-45 border-2 border-[#5ef2ff] bg-[#5ef2ff]/10 " +
              "shadow-[0_0_18px_rgba(94,242,255,0.45)]"
            }
          />
        </div>
        <div
          ref={hintRef}
          className={
            "pointer-events-none absolute left-1/2 -translate-x-1/2 text-[8px] " +
            "tracking-[0.22em] whitespace-nowrap text-[#6f86a8]/75 transition-opacity"
          }
          style={{ bottom: "calc(env(safe-area-inset-bottom) + 58px)" }}
        >
          {t("help.touch")}
        </div>
      </div>
      <button
        className={
          "absolute z-[35] flex h-14 w-14 flex-col items-center justify-center border " +
          "font-mono text-[8px] font-bold tracking-[0.08em] transition-colors " +
          (dashData?.dashReady
            ? "border-[#5ef2ff]/70 bg-[#5ef2ff]/15 text-[#9df1ff] " +
              "shadow-[0_0_14px_rgba(94,242,255,0.55)] active:bg-[#5ef2ff]/25"
            : "border-[#6f86a8]/30 bg-[#050b16]/65 text-[#6f86a8] " +
              "active:bg-[#6f86a8]/20")
        }
        style={{
          right: "calc(env(safe-area-inset-right) + 70px)",
          bottom: "calc(env(safe-area-inset-bottom) + 84px)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onDash()}
        aria-label={t("hud.dash")}
        type="button"
      >
        <svg width="18" height="18" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.6">
          <polyline points="7,1 3,7 6,7 5,11 9,5 6,5" />
        </svg>
        <span className="mt-0.5 leading-none">
          {dashData?.dashReady ? t("hud.dash") : `${(dashData?.dashCooldown ?? 0).toFixed(1)}s`}
        </span>
      </button>
      <button
        className={
          "absolute z-[35] flex h-11 w-11 items-center justify-center " +
          "border border-[#5ef2ff]/30 bg-[#050b16]/65 text-[#9df1ff] active:bg-[#5ef2ff]/20"
        }
        style={{
          right: "calc(env(safe-area-inset-right) + 12px)",
          bottom: "calc(env(safe-area-inset-bottom) + 12px)",
        }}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={() => onPause()}
        aria-label="Pause"
        type="button"
      >
        <svg width="14" height="16" viewBox="0 0 14 16" fill="currentColor">
          <rect x="1" y="1" width="4" height="14" />
          <rect x="9" y="1" width="4" height="14" />
        </svg>
      </button>
    </>
  );
}
