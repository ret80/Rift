import React from "react";
import GameButton from "../components/GameButton";
import { useT } from "../../i18n";

type EnemyKind = "drone" | "hunter" | "fighter" | "cruiser" | "carrier";
type PickupKind = "heal" | "rate" | "gun" | "drone" | "mineral";

function EnemyIcon(props: { kind: EnemyKind }) {
  const col =
    props.kind === "drone"
      ? "#ff5d7e"
      : props.kind === "hunter"
        ? "#d8ff3e"
        : props.kind === "fighter"
          ? "#ff8c42"
          : props.kind === "cruiser"
            ? "#b06bff"
            : "#ff5da2";
  const pts =
    props.kind === "drone"
      ? "12,2 22,12 12,22 2,12"
      : props.kind === "hunter"
        ? "2,12 22,6 16,12 22,18"
        : props.kind === "fighter"
          ? "2,12 22,4 15,12 22,20"
          : props.kind === "cruiser"
            ? "2,12 8,4 20,4 22,12 20,20 8,20"
            : "2,12 7,3 21,3 23,12 21,21 7,21";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0">
      <polygon points={pts} fill="none" stroke={col} strokeWidth="1.6" />
    </svg>
  );
}

function PickupIcon(props: { kind: PickupKind }) {
  const col =
    props.kind === "heal"
      ? "#7dffb8"
      : props.kind === "rate"
        ? "#ff8c42"
        : props.kind === "gun"
          ? "#5ef2ff"
          : props.kind === "mineral"
            ? "#7dffb8"
            : "#9dffe8";
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" className="shrink-0" fill="none" stroke={col} strokeWidth="1.6">
      {props.kind === "heal" && (
        <>
          <line x1="12" y1="5" x2="12" y2="19" />
          <line x1="5" y1="12" x2="19" y2="12" />
        </>
      )}
      {props.kind === "rate" && (
        <polyline points="13,3 7,13 12,13 11,21 17,11 12,11" />
      )}
      {props.kind === "gun" && (
        <>
          <line x1="4" y1="9" x2="20" y2="9" />
          <line x1="4" y1="15" x2="20" y2="15" />
          <line x1="4" y1="9" x2="4" y2="15" />
        </>
      )}
      {props.kind === "drone" && (
        <>
          <polygon points="12,4 20,16 12,13 4,16" />
          <circle cx="12" cy="12" r="9" strokeOpacity="0.4" />
        </>
      )}
      {props.kind === "mineral" && (
        <>
          <polygon points="12,3 19,8 16,20 8,20 5,8" />
          <line x1="12" y1="3" x2="12" y2="20" strokeOpacity="0.4" />
        </>
      )}
    </svg>
  );
}

export default function HelpScreen(props: { onBack: () => void }) {
  const t = useT();
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="flex max-h-[92vh] w-[min(560px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
          <div className="hud-label mb-5 text-center">{t("help.title")}</div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.controls")}
          </div>
          <div className="mb-5 space-y-2 text-[13px] text-[#9db4d6]">
            <div className="flex items-center gap-2">
              <span className="kbd">W</span>
              <span className="kbd">A</span>
              <span className="kbd">S</span>
              <span className="kbd">D</span>
              <span className="text-[#6f86a8]">/</span>
              <span className="kbd">←</span>
              <span className="kbd">↑</span>
              <span className="kbd">↓</span>
              <span className="kbd">→</span>
              <span>— {t("help.move")}</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="kbd">P</span>
              <span className="kbd">Esc</span>
              <span>— {t("help.pause")}</span>
            </div>
            <div className="text-[12px] text-[#6f86a8]">{t("help.touch")}</div>
          </div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.objective")}
          </div>
          <p className="mb-5 text-[13px] leading-5 text-[#9db4d6]">{t("help.item")}</p>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.enemies")}
          </div>
          <div className="mb-5 space-y-2">
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="drone" />
              <span>{t("help.drone")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="hunter" />
              <span>{t("help.hunter")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="fighter" />
              <span>{t("help.fighter")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="cruiser" />
              <span>{t("help.cruiser")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <EnemyIcon kind="carrier" />
              <span>{t("help.carrier")}</span>
            </div>
          </div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.bonuses")}
          </div>
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="heal" />
              <span>{t("help.heal")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="rate" />
              <span>{t("help.rate")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="gun" />
              <span>{t("help.gun")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="drone" />
              <span>{t("help.allyDrone")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <PickupIcon kind="mineral" />
              <span>{t("help.asteroid")}</span>
            </div>
          </div>
          </div>

          {/* fixed footer — always visible, no scrolling needed to exit */}
          <div className="shrink-0 border-t border-[#5ef2ff]/15 bg-[#060d1a]/60 p-4">
            <div className="flex justify-center">
              <GameButton onClick={props.onBack}>{t("help.back")}</GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
