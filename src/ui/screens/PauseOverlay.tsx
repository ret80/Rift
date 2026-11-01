import React from "react";
import GameButton from "../components/GameButton";
import { useT } from "../../i18n";

export default function PauseOverlay(props: {
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
  isGamepad: boolean;
}) {
  const t = useT();
  return (
    <div
      className="anim-overlay absolute inset-0 z-30 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("pause.title")}
    >
      <div className="w-[min(360px,92vw)]">
        <div className="hud-panel p-7 text-center">
          <div className="font-display mb-6 text-2xl tracking-[0.3em] text-[#eaffff] text-glow-cyan">
            {t("pause.title")}
          </div>
          <div className="flex flex-col gap-3">
            <GameButton onClick={props.onResume} autoFocus>
              {t("pause.resume")}
              {props.isGamepad && (
                <span className="ml-2 inline-block rounded border border-[#5ef2ff]/40 px-1.5 py-0.5 text-[10px] tracking-wider text-[#5ef2ff]">
                  ✕
                </span>
              )}
            </GameButton>
            <GameButton onClick={props.onSettings} variant="amber">
              {t("pause.settings")}
              {props.isGamepad && (
                <span className="ml-2 inline-block rounded border border-[#ffb800]/40 px-1.5 py-0.5 text-[10px] tracking-wider text-[#ffb800]">
                  ✕
                </span>
              )}
            </GameButton>
            <GameButton onClick={props.onMenu} variant="red">
              {t("pause.menu")}
              {props.isGamepad && (
                <span className="ml-2 inline-block rounded border border-[#ff3b52]/40 px-1.5 py-0.5 text-[10px] tracking-wider text-[#ff3b52]">
                  ○
                </span>
              )}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
