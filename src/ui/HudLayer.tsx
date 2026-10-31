import React from "react";
import { useT } from "../i18n";
import { LoadoutBar } from "./components/LoadoutBar";
import { useHudData, type HudStore } from "./hud/HudStore";
import { formatTime } from "./utils/formatTime";

/** Доля прочности с цветом: норма → предупреждение → критично. */
function hullColor(fraction: number): string {
  if (fraction > 0.5) return "#5ef2ff";
  if (fraction > 0.25) return "#ffb84d";
  return "#ff3b52";
}

function PartsGlyph() {
  return (
    <svg width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="#ffb84d" strokeWidth="1.2">
      <polygon points="6,1 11,4 10,10 2,10 1,4" />
      <line x1="6" y1="1" x2="6" y2="10" strokeOpacity="0.5" />
      <line x1="2" y1="10" x2="10" y2="10" strokeOpacity="0.5" />
    </svg>
  );
}

/**
 * HudLayer — верхняя панель игры.
 *
 * Читает снимки из `HudStore` (≈15 Гц), поэтому перерисовывается только
 * само дерево HUD, а не всё приложение.
 */
export function HudLayer(props: { store: HudStore; godOn: boolean }) {
  const t = useT();
  const data = useHudData(props.store);

  const hpFraction = data && data.maxHp > 0
    ? Math.max(0, Math.min(1, data.hp / data.maxHp))
    : 1;
  const hpColor = hullColor(hpFraction);
  const progress = data && data.total > 0
    ? Math.min(100, ((data.killed ?? 0) / data.total) * 100)
    : 0;
  const comboMult = data?.comboMult ?? 1;
  const comboVisible = comboMult > 1.01;

  return (
    <div className="pointer-events-none absolute inset-0 z-20">
      {/* single unified top bar: hull | wave | score */}
      <div
        className="absolute left-2 right-2 top-0 sm:left-4 sm:right-4"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 10px)" }}
      >
        <div className="hud-panel flex h-[46px] items-center gap-3 px-3 sm:h-[52px] sm:gap-4 sm:px-4">
          {/* LEFT — hull + parts */}
          <div className="flex min-w-0 flex-1 flex-col justify-center gap-1">
            <div className="flex items-center gap-2">
              <span className="hud-label shrink-0 !text-[7px] sm:!text-[9px]">{t("hud.hull")}</span>
              <div className="h-[7px] min-w-0 flex-1 bg-[#ff3b52]/15">
                <div
                  className="h-full w-full transition-[width] duration-200"
                  style={{
                    width: `${hpFraction * 100}%`,
                    background: hpColor,
                    boxShadow: `0 0 7px ${hpColor}`,
                  }}
                />
              </div>
            </div>
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <div
                  className={
                    "parts-display flex items-center gap-1 text-[9px] font-bold " +
                    "tracking-[0.08em] text-[#ffb84d] sm:text-[10px]"
                  }
                  aria-label={t("upgrade.partsLabel")}
                >
                  <PartsGlyph /> <span>{data?.parts ?? 0}</span>
                </div>
              </div>
              <div className="text-[8px] tracking-[0.14em] text-[#6f86a8] sm:text-[9px]">
                T+{formatTime(data?.time ?? 0)}
              </div>
            </div>
          </div>

          {/* CENTER — wave */}
          <div className="flex shrink-0 flex-col items-center leading-none">
            <span className="hud-label !text-[7px] sm:!text-[9px]">{t("hud.wave")}</span>
            <div className="font-display mt-0.5 text-xl text-[#eaffff] sm:text-[26px]">
              {String(data?.wave ?? 0).padStart(2, "0")}
            </div>
            <div className="mt-1 h-[3px] w-[64px] bg-[#5ef2ff]/10 sm:w-[90px]">
              <div
                className="h-full bg-[#5ef2ff] shadow-[0_0_5px_#5ef2ff]"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>

          {/* RIGHT — score */}
          <div className="flex min-w-0 flex-1 flex-col items-end justify-center gap-0.5 text-right">
            <span className="hud-label !text-[7px] sm:!text-[9px]">{t("hud.scoreLabel")}</span>
            <div className="font-display text-lg leading-none text-[#eaffff] sm:text-[24px]">
              {String(data?.score ?? 0).padStart(6, "0")}
            </div>
            <div className="flex items-center gap-2">
              <div
                className="font-display text-[11px] leading-none text-[#ffb84d] sm:text-xs"
                style={{ opacity: comboVisible ? 1 : 0 }}
              >
                ×{comboMult.toFixed(1)}
              </div>
              <div
                className={
                  "hidden text-[7px] tracking-[0.08em] text-[#ffb84d]/80 " +
                  "sm:block sm:text-[8px]"
                }
              >
                {t("hud.best", { v: data?.best ?? 0 })}
              </div>
            </div>
          </div>
        </div>

        {/* loadout row — weapon & bonus icons with their timers */}
        <LoadoutBar slots={data?.loadout ?? []} />

        {/* secondary status line under the bar */}
        <div className="mt-1 px-1 text-center text-[7px] tracking-[0.06em] text-[#6f86a8] sm:text-[8px]">
          {t("hud.status", { g: String(data?.guns ?? 0), d: String(data?.drones ?? 0) })}
        </div>
      </div>

      {/* god-mode chip */}
      {props.godOn && (
        <div
          className={
            "absolute left-1/2 -translate-x-1/2 border border-[#ffb84d]/50 " +
            "bg-[#ffb84d]/10 px-3 py-0.5 font-mono text-[9px] tracking-[0.25em] text-[#ffb84d]"
          }
          style={{ top: "calc(env(safe-area-inset-top) + 108px)" }}
        >
          ◈ {t("hud.godChip")}
        </div>
      )}
    </div>
  );
}
