import React from "react";
import GameButton from "../components/GameButton";
import { useT } from "../../i18n";

export default function PauseOverlay(props: {
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
}) {
  const t = useT();
  return (
    <div className="anim-overlay absolute inset-0 z-30 flex items-center justify-center bg-[#04070d]/70 p-4 backdrop-blur-[2px]">
      <div className="w-[min(360px,92vw)]">
        <div className="hud-panel p-7 text-center">
          <div className="font-display mb-6 text-2xl tracking-[0.3em] text-[#eaffff] text-glow-cyan">
            {t("pause.title")}
          </div>
          <div className="flex flex-col gap-3">
            <GameButton onClick={props.onResume} autoFocus>
              {t("pause.resume")}
            </GameButton>
            <GameButton onClick={props.onSettings} variant="amber">
              {t("pause.settings")}
            </GameButton>
            <GameButton onClick={props.onMenu} variant="red">
              {t("pause.menu")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
