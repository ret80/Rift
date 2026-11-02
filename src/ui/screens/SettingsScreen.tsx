import { useEffect, useState, type MutableRefObject } from "react";
import type { Volumes } from "../../game/audio";
import type { CombatTrackId, MenuTrackId, TrackId } from "../../game/audio/tracks";
import { ALL_TRACK_IDS, TRACK_NAMES, isMenuTrackId } from "../../game/audio/tracks";
import type {
    PhysicsEngineId,
} from "../../game/physics";
import { PHYSICS_ENGINE_IDS } from "../../game/physics";
import { useGamepadFocus } from "../../hooks/useGamepadFocus";
import { useLang, useT } from "../../i18n";
import type { GamepadNavHandlers } from "../ScreenRouter";
import GameButton from "../components/GameButton";
import LangButton from "../components/LangButton";
import SliderRow from "../components/SliderRow";

const PHYSICS_ENGINE_LABELS: Record<PhysicsEngineId, string> = {
  planck: "Planck.js",
  custom: "Custom",
  p2: "p2-es",
};

/**
 * SettingsScreen — экран настроек.
 *
 * Gamepad-навигация:
 *   - D-pad up/down + стик → перемещение по пунктам меню
 *   - Слайдер: D-pad left/right + стик → регулировка
 *   - Выпадающий список: A → открыть, B → закрыть
 *   - Навигация по открытому списку: D-pad up/down
 *   - Подтверждение выбора: A
 */

export default function SettingsScreen(props: {
  vols: Volumes;
  onChange: (v: Volumes) => void;
  menuTrack: MenuTrackId;
  combatTrack: CombatTrackId;
  onMenuTrackChange: (v: MenuTrackId) => void;
  onCombatTrackChange: (v: CombatTrackId) => void;
  onPreviewTrack: (id: MenuTrackId | CombatTrackId) => void;
  physicsEngine: PhysicsEngineId;
  onPhysicsEngineChange: (v: PhysicsEngineId) => void;
  onTest: () => void;
  onReset: () => void;
  onBack: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
  onGamepadCancel: () => void;
}) {
  const t = useT();
  const lang = useLang();

  // Общий список всех треков: выбранный пункт запоминается локально,
  // а при выборе сразу назначается как трек меню или боевой трек.
  const [selectedTrack, setSelectedTrack] = useState<TrackId>(props.menuTrack);
  const [showTrackDropdown, setShowTrackDropdown] = useState(false);
  const [showPhysicsDropdown, setShowPhysicsDropdown] = useState(false);

  const selectTrack = (id: TrackId) => {
    setSelectedTrack(id);
    setShowTrackDropdown(false);
    if (isMenuTrackId(id)) {
      props.onMenuTrackChange(id);
    } else {
      props.onCombatTrackChange(id);
    }
  };

  const { onNavUp, onNavDown, onNavLeft, onNavRight } = useGamepadFocus({
    count: 6, // кол-во пунктов настроек
    initialIndex: 0,
  });

  // Регистрируем навигацию в общий ref.
  useEffect(() => {
    props.gamepadNavRef.current = {
      up: onNavUp,
      down: onNavDown,
      left: onNavLeft,
      right: onNavRight,
      confirm: null,
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {}, confirm: null,
      };
    };
  }, [onNavUp, onNavDown, onNavLeft, onNavRight, props.gamepadNavRef]);

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
                <div className="hud-label mb-2">{t("settings.musicTrack")}</div>
                <div className="flex gap-2">
                  <select
                    className="music-select w-full"
                    value={selectedTrack}
                    onChange={(e) => selectTrack(e.target.value as TrackId)}
                    aria-label={t("settings.musicTrack")}
                  >
                    {ALL_TRACK_IDS.map((id) => (
                      <option key={id} value={id}>{t(TRACK_NAMES[id])}</option>
                    ))}
                  </select>
                  <GameButton
                    onClick={() => props.onPreviewTrack(selectedTrack)}
                    variant="cyan"
                    small
                    className="shrink-0 px-4"
                  >
                    {t("settings.listen")}
                  </GameButton>
                </div>
              </div>

              <div>
                <GameButton onClick={props.onTest} variant="amber" small className="w-full">
                  {t("settings.test")}
                </GameButton>
              </div>

              <div>
                <div className="hud-label mb-2">{t("settings.physicsEngine")}</div>
                <select
                  className="music-select w-full"
                  value={props.physicsEngine}
                  onChange={(e) => props.onPhysicsEngineChange(e.target.value as PhysicsEngineId)}
                  aria-label={t("settings.physicsEngine")}
                >
                  {PHYSICS_ENGINE_IDS.map((id) => (
                    <option key={id} value={id}>{PHYSICS_ENGINE_LABELS[id]}</option>
                  ))}
                </select>
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
