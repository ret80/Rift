import React from "react";
import GameButton from "../components/GameButton";
import { useT } from "../../i18n";

function DevToggle(props: {
  label: string;
  desc: string;
  on: boolean;
  onClick: () => void;
}) {
  const t = useT();
  return (
    <button
      type="button"
      aria-pressed={props.on}
      onClick={props.onClick}
      className="group flex w-full cursor-pointer items-center gap-3 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3 text-left transition-colors hover:border-[#7dff9e]/50 hover:bg-[#0a1c11]/80"
    >
      <span
        className="h-3 w-3 shrink-0 transition-all"
        style={{
          background: props.on ? "#7dff9e" : "rgba(125,255,158,0.12)",
          boxShadow: props.on ? "0 0 10px rgba(125,255,158,0.8)" : "none",
        }}
      />
      <span className="min-w-0 flex-1">
        <span className="block font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
          {props.label}
        </span>
        <span className="block font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
          {props.desc}
        </span>
      </span>
      <span
        className={
          "shrink-0 border px-2 py-0.5 font-mono text-[10px] tracking-[0.2em] " +
          (props.on
            ? "border-[#7dff9e]/60 text-[#7dff9e]"
            : "border-[#5f8f70]/40 text-[#5f8f70]")
        }
      >
        {props.on ? t("debug.on") : t("debug.off")}
      </span>
    </button>
  );
}

export default function DebugScreen(props: {
  fpsOn: boolean;
  godOn: boolean;
  startWave: number;
  onToggleFps: () => void;
  onToggleGod: () => void;
  onChangeWave: (n: number) => void;
  onToggleDetails: () => void;
  detailsOn: boolean;
  onBack: () => void;
}) {
  const t = useT();
  const pct = ((props.startWave - 1) / 49) * 100;
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4" role="dialog" aria-modal="true">
      <div className="w-[min(420px,94vw)]">
        <div className="flex items-center gap-2 border border-b-0 border-[#7dff9e]/30 bg-[#07130c] px-4 py-2">
          <span className="h-2 w-2 bg-[#ff5c54]" />
          <span className="h-2 w-2 bg-[#ffb84d]" />
          <span className="h-2 w-2 bg-[#7dff9e]" />
          <span className="ml-2 font-mono text-[10px] tracking-[0.3em] text-[#7dff9e]/80">
            rift9 — {t("debug.title")}
          </span>
        </div>
        <div className="border border-[#7dff9e]/30 bg-[#050d08]/95 p-4 shadow-[0_0_30px_rgba(125,255,158,0.08)]">
          <div className="mb-3 font-mono text-[9px] tracking-[0.25em] text-[#5f8f70]">
            {"// "}{t("debug.note")}
          </div>
          <div className="flex flex-col gap-2">
            <DevToggle
              label={t("debug.fps")}
              desc={t("debug.fpsDesc")}
              on={props.fpsOn}
              onClick={props.onToggleFps}
            />
            <DevToggle
              label={t("debug.god")}
              desc={t("debug.godDesc")}
              on={props.godOn}
              onClick={props.onToggleGod}
            />
            <DevToggle
              label={t("debug.details")}
              desc={t("debug.detailsDesc")}
              on={props.detailsOn}
              onClick={props.onToggleDetails}
            />
          </div>

          <div className="mt-4 border border-[#7dff9e]/15 bg-[#07130c]/70 px-4 py-3">
            <div className="flex items-baseline justify-between">
              <span className="font-mono text-[13px] font-bold tracking-[0.12em] text-[#d9ffe4]">
                {t("debug.wave")}
              </span>
              <span className="font-mono text-lg font-bold text-[#7dff9e]">
                {String(props.startWave).padStart(2, "0")}
              </span>
            </div>
            <input
              type="range"
              min={1}
              max={50}
              value={props.startWave}
              onChange={(e) => props.onChangeWave(Number(e.target.value))}
              className="vol-dev mt-2 w-full"
              style={{ ["--fill" as string]: `${pct}%` }}
            />
            <div className="flex justify-between font-mono text-[9px] tracking-[0.2em] text-[#5f8f70]">
              <span>01</span>
              <span>25</span>
              <span>50</span>
            </div>
            <div className="mt-1 font-mono text-[10px] tracking-[0.04em] text-[#5f8f70]">
              {t("debug.waveDesc")}
            </div>
          </div>

          <div className="mt-4 flex justify-end">
            <GameButton onClick={props.onBack} variant="amber" small>
              {t("debug.back")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
