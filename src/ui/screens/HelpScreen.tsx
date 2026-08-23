import React from "react";
import GameButton from "../components/GameButton";
import { Icon } from "../components/Icon";
import { useT } from "../../i18n";

export default function HelpScreen(props: { onBack: () => void }) {
  const t = useT();
  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("help.title")}
    >
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
              <Icon kind="enemy-drone" />
              <span>{t("help.drone")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="enemy-hunter" />
              <span>{t("help.hunter")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="enemy-fighter" />
              <span>{t("help.fighter")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="enemy-cruiser" />
              <span>{t("help.cruiser")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="enemy-carrier" />
              <span>{t("help.carrier")}</span>
            </div>
          </div>

          <div className="mb-2 text-[11px] tracking-[0.25em] text-[#5ef2ff]">
            {"// "}{t("help.bonuses")}
          </div>
          <div className="mb-6 space-y-2">
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="pickup-heal" />
              <span>{t("help.heal")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="pickup-rate" />
              <span>{t("help.rate")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="pickup-gun" />
              <span>{t("help.gun")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="pickup-drone" />
              <span>{t("help.allyDrone")}</span>
            </div>
            <div className="flex items-center gap-3 text-[13px] text-[#9db4d6]">
              <Icon kind="pickup-mineral" />
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
