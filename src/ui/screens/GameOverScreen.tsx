import React from "react";
import type { StatsData } from "../../game/game";
import GameButton from "../components/GameButton";
import { formatTime } from "../utils/formatTime";
import { useT } from "../../i18n";

export default function GameOverScreen(props: {
  stats: StatsData;
  onRetry: () => void;
  onUpgrade: () => void;
  onMenu: () => void;
}) {
  const t = useT();
  const s = props.stats;
  return (
    <div
      className="anim-overlay absolute inset-0 z-30 flex items-center justify-center bg-[#0a0408]/70 p-4 backdrop-blur-[2px]"
      role="dialog"
      aria-modal="true"
      aria-label={t("over.title")}
    >
      <div className="w-[min(460px,94vw)]">
        <div className="hud-panel panel-red p-5 text-center sm:p-8">
          <div className="hud-label anim-red-pulse mb-1 !text-[#ff5c54]">
            {t("over.sub")}
          </div>
          <h2 className="font-display text-[26px] tracking-[0.1em] text-[#ff3b52] text-glow-red sm:text-4xl sm:tracking-[0.18em]">
            {t("over.title")}
          </h2>
          {s.isBest && (
            <div className="font-display mt-2 text-xs tracking-[0.24em] text-[#ffb84d] sm:text-sm sm:tracking-[0.3em]">
              ★ {t("game.newRecord")} ★
            </div>
          )}
          <div className="mx-auto mt-4 grid w-full grid-cols-2 gap-x-4 gap-y-2 text-left sm:mt-6 sm:gap-x-6 sm:gap-y-3">
            <div>
              <div className="hud-label">{t("over.score")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">{s.score}</div>
            </div>
            <div>
              <div className="hud-label">{t("over.best")}</div>
              <div className="font-display text-lg text-[#5ef2ff] sm:text-2xl">{s.best}</div>
            </div>
            <div>
              <div className="hud-label">{t("over.wave")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">{s.wave}</div>
            </div>
            <div>
              <div className="hud-label">{t("over.kills")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">{s.kills}</div>
            </div>
            <div className="col-span-2">
              <div className="hud-label">{t("over.time")}</div>
              <div className="font-display text-lg text-[#eaffff] sm:text-2xl">
                {formatTime(s.time)}
              </div>
            </div>
          </div>
          <div className="mt-5 flex flex-col items-center justify-center gap-2.5 sm:mt-7">
            <div className="flex w-full gap-3">
              <GameButton onClick={props.onRetry} autoFocus className="flex-1">
                {t("over.retry")}
              </GameButton>
              <GameButton onClick={props.onMenu} variant="amber" className="flex-1">
                {t("over.menu")}
              </GameButton>
            </div>
            <GameButton onClick={props.onUpgrade} variant="cyan" className="w-full">
              {t("over.upgrade")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
