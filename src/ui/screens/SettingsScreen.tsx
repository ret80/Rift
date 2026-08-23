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
      <div className="w-[min(400px,94vw)]">
        <div className="hud-panel p-6 sm:p-8">
          <div className="hud-label mb-4 text-center">{t("settings.title")}</div>
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
              <div className="hud-label mb-2">{t("settings.language")}</div>
              <div className="flex gap-2">
                <LangButton code="ru" label="РУС" active={lang === "ru"} />
                <LangButton code="en" label="ENG" active={lang === "en"} />
              </div>
            </div>

            <div className="flex items-center justify-between gap-3">
              <GameButton onClick={props.onTest} variant="amber" small>
                {t("settings.test")}
              </GameButton>
              <GameButton onClick={props.onBack} small>
                {t("settings.back")}
              </GameButton>
            </div>

            <div className="border-t border-[#ff3b52]/20 pt-3">
              <GameButton onClick={props.onReset} variant="red" small>
                {t("settings.resetProgress")}
              </GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
