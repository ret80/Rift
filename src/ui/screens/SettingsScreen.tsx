import React from "react";
import type { Volumes } from "../../game/audio";
import GameButton from "../components/GameButton";
import SliderRow from "../components/SliderRow";
import LangButton from "../components/LangButton";
import { useT, useLang } from "../../i18n";

export default function SettingsScreen(props: {
  vols: Volumes;
  onChange: (v: Volumes) => void;
  onTest: () => void;
  onReset: () => void;
  onBack: () => void;
}) {
  const t = useT();
  const lang = useLang();
  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("settings.title")}
    >
      <div className="flex max-h-[92vh] w-[min(400px,94vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col">
          {/* Header — fixed */}
          <div className="shrink-0 border-b border-[#5ef2ff]/15 px-5 pb-3 pt-5 sm:px-7 sm:pt-7">
            <div className="hud-label text-center">{t("settings.title")}</div>
          </div>

          {/* Settings — scrollable */}
          <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-5">
              <SliderRow
                label={t("settings.volume")}
                value={props.vols.master}
                onChange={(v) => props.onChange({ ...props.vols, master: v })}
              />
              <SliderRow
                label={t("settings.sfx")}
                value={props.vols.sfx}
                onChange={(v) => props.onChange({ ...props.vols, sfx: v })}
              />
              <SliderRow
                label={t("settings.music")}
                value={props.vols.music}
                onChange={(v) => props.onChange({ ...props.vols, music: v })}
              />

              <div>
                <GameButton onClick={props.onTest} variant="amber" small className="w-full">
                  {t("settings.test")}
                </GameButton>
              </div>

              <div>
                <div className="hud-label mb-2">{t("settings.language")}</div>
                <div className="flex gap-2">
                  <LangButton code="ru" label="РУС" active={lang === "ru"} />
                  <LangButton code="en" label="ENG" active={lang === "en"} />
                </div>
              </div>

              <div className="border-t border-[#ff3b52]/20 pt-3">
                <GameButton onClick={props.onReset} variant="red" small className="w-full">
                  {t("settings.resetProgress")}
                </GameButton>
              </div>
            </div>
          </div>

          {/* Footer — fixed */}
          <div className="shrink-0 border-t border-[#5ef2ff]/15 bg-[#060d1a]/60 p-4">
            <div className="flex justify-center">
              <GameButton onClick={props.onBack}>{t("settings.back")}</GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
