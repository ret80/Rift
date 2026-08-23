import React from "react";
import GameButton from "../components/GameButton";
import { useT } from "../../i18n";

export default function MainMenu(props: {
  best: number;
  onPlay: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onDebug: () => void;
  onUpgrade: () => void;
}) {
  const t = useT();
  return (
    <div className="anim-overlay absolute inset-0 z-20 flex flex-col items-center justify-center">
      <div>
        <div className="mb-2 text-[10px] tracking-[0.5em] text-[#6f86a8] sm:text-xs">
          {t("app.subtitle")}
        </div>
        <h1 className="font-display anim-title text-6xl leading-none text-[#eaffff] sm:text-8xl">
          {t("app.title")}
        </h1>
        <div className="mx-auto mt-3 h-[2px] w-44 bg-gradient-to-r from-transparent via-[#5ef2ff] to-transparent sm:w-72" />
        {props.best > 0 && (
          <div className="mt-3 text-[11px] tracking-[0.3em] text-[#ffb84d]">
            {t("hud.best", { v: props.best })}
          </div>
        )}
      </div>

      <div
        className="mt-10 flex w-[min(300px,80vw)] flex-col gap-3"
        style={{ animationDelay: "0.12s" }}
      >
        <GameButton onClick={props.onPlay} autoFocus>
          {t("menu.play")}
        </GameButton>
        <GameButton onClick={props.onUpgrade}>{t("menu.upgrade")}</GameButton>
        <GameButton onClick={props.onSettings}>{t("menu.settings")}</GameButton>
        <GameButton onClick={props.onHelp}>{t("menu.help")}</GameButton>
      </div>

      <button
        onClick={props.onDebug}
        className="mt-6 cursor-pointer border border-dashed border-[#7dff9e]/30 bg-transparent px-4 py-1 font-mono text-[10px] tracking-[0.3em] text-[#7dff9e]/60 transition-colors hover:border-[#7dff9e]/70 hover:text-[#7dff9e]"
        style={{ animationDelay: "0.2s" }}
      >
        &gt; {t("menu.debug")}
      </button>

      <div className="absolute bottom-5 text-center text-[9px] tracking-[0.3em] text-[#4d5f7d]">
        {t("menu.hint")}
      </div>
    </div>
  );
}
