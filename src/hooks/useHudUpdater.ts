import { useCallback } from "react";
import type { LoadoutSlotData } from "../game/balance/loadout";
import type { HudRefs } from "../ui/hudRefs";

export type { HudRefs } from "../ui/hudRefs";

export interface HudData {
  wave: number;
  killed: number;
  total: number;
  guns: number;
  drones: number;
  hp: number;
  maxHp: number;
  time: number;
  score: number;
  best: number;
  comboMult: number;
  minerals: number;
  parts: number;
  /** Weapon + bonus slots rendered in the HUD loadout row. */
  loadout: LoadoutSlotData[];
}

type UpdateCallback = (data: Partial<HudData>) => void;

/**
 * Creates a callback that updates HUD DOM elements from game data.
 * Replaces imperative DOM manipulation with a memoised function.
 */
export function useHudUpdater(
  refs: HudRefs,
  t: (key: string, params?: Record<string, string | number>) => string
): UpdateCallback {
  return useCallback(
    (data: Partial<HudData>) => {
      const r = refs;

      if (r.wave.current) {
        r.wave.current.textContent = String(data.wave ?? 0).padStart(2, "0");
      }
      if (r.minerals.current) {
        const glyph = r.minerals.current.querySelector("svg");
        r.minerals.current.textContent = ` ${(data.minerals ?? 0).toString()}`;
        if (glyph) r.minerals.current.prepend(glyph);
      }
      if (r.parts.current) {
        r.parts.current.textContent = String(data.parts ?? 0);
      }
      if (r.progress.current && data.total !== undefined) {
        r.progress.current.style.width = `${
          data.total > 0 ? Math.min(100, ((data.killed ?? 0) / data.total) * 100) : 0
        }%`;
      }
      if (r.status.current) {
        r.status.current.textContent = t("hud.status", {
          g: String(data.guns ?? 0),
          d: String(data.drones ?? 0),
        });
      }
      if (r.hpFill.current && data.hp !== undefined && data.maxHp !== undefined) {
        const f = Math.max(0, data.hp / data.maxHp);
        const color = f > 0.5 ? "#5ef2ff" : f > 0.25 ? "#ffb84d" : "#ff3b52";
        r.hpFill.current.style.width = `${f * 100}%`;
        r.hpFill.current.style.background = color;
        r.hpFill.current.style.boxShadow = `0 0 7px ${color}`;
      }
      if (r.time.current && data.time !== undefined) {
        r.time.current.textContent = `T+${formatTime(data.time)}`;
      }
      if (r.score.current) {
        r.score.current.textContent = String(data.score ?? 0).padStart(6, "0");
      }
      if (r.best.current) {
        r.best.current.textContent = t("hud.best", { v: data.best ?? 0 });
      }
      if (r.combo.current && data.comboMult !== undefined) {
        if (data.comboMult > 1.01) {
          r.combo.current.style.opacity = "1";
          r.combo.current.textContent = `×${data.comboMult.toFixed(1)}`;
        } else {
          r.combo.current.style.opacity = "0";
        }
      }
      if (r.loadoutBar.current && data.loadout) {
        r.loadoutBar.current.update(data.loadout);
      }
    },
    [refs, t]
  );
}

/* Keep formatTime local — it's tiny and avoids circular imports */
function formatTime(s: number): string {
  const m = Math.floor(s / 60);
  const ss = Math.floor(s % 60);
  return `${m}:${ss < 10 ? "0" : ""}${ss}`;
}
