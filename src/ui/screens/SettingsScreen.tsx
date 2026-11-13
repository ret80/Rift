import { useEffect, useRef, useState, type CSSProperties, type MutableRefObject } from "react";
import type { Volumes } from "../../game/audio";
import type { CombatTrackId, MenuTrackId, TrackId } from "../../game/audio/tracks";
import { ALL_TRACK_IDS, TRACK_NAMES, isMenuTrackId } from "../../game/audio/tracks";
import { useGamepadFocus } from "../../hooks/useGamepadFocus";
import { setLang, useLang, useT } from "../../i18n";
import type { GamepadNavHandlers } from "../ScreenRouter";
import GameButton from "../components/GameButton";
import SliderRow from "../components/SliderRow";

/** Варианты языка для выпадающего списка. */
const LANG_OPTIONS = [
  { id: "ru", label: "РУС" },
  { id: "en", label: "ENG" },
] as const;

type LangId = (typeof LANG_OPTIONS)[number]["id"];

/** Порядок пунктов на экране. Индекс = позиция фокуса геймпада. */
const ITEM = {
  master: 0,
  sfx: 1,
  music: 2,
  track: 3,
  listen: 4,
  test: 5,
  language: 6,
  reset: 7,
  back: 8,
} as const;

const ITEM_COUNT = 9;

/** Визуальная подсветка текущего пункта. */
function focusStyle(active: boolean): CSSProperties | undefined {
  if (!active) return undefined;
  return {
    outline: "2px solid #ffb84d",
    outlineOffset: "2px",
    borderRadius: 6,
    boxShadow: "0 0 14px rgba(255, 184, 77, 0.35)",
  };
}

/** Заголовок группы настроек. */
function GroupLabel(props: { children: React.ReactNode }) {
  return (
    <div className="mb-3 border-b border-[#5ef2ff]/15 pb-1.5 font-mono text-[10px] tracking-[0.25em] text-[#5ef2ff]/70">
      {props.children}
    </div>
  );
}

/**
 * SettingsScreen — экран настроек.
 *
 * Gamepad-навигация:
 *   - D-pad up/down + стик → перемещение по пунктам меню
 *   - Слайдер: D-pad left/right + стик → регулировка
 *   - Выпадающий список: A → открыть, B → закрыть
 *   - Навигация по открытому списку: D-pad up/down
 *   - Подтверждение выбора: A
 *   - Назад: B с любого пункта
 */
export default function SettingsScreen(props: {
  vols: Volumes;
  onChange: (v: Volumes) => void;
  menuTrack: MenuTrackId;
  combatTrack: CombatTrackId;
  onMenuTrackChange: (v: MenuTrackId) => void;
  onCombatTrackChange: (v: CombatTrackId) => void;
  onPreviewTrack: (id: MenuTrackId | CombatTrackId) => void;
  onTest: () => void;
  onReset: () => void;
  onBack: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const lang = useLang();

  // Общий список всех треков: выбранный пункт запоминается локально,
  // а при выборе сразу назначается как трек меню или боевой трек.
  const [selectedTrack, setSelectedTrack] = useState<TrackId>(props.menuTrack);
  const [openDropdown, setOpenDropdown] = useState<"track" | "language" | null>(null);
  const [dropdownIndex, setDropdownIndex] = useState(0);

  const bodyRef = useRef<HTMLDivElement | null>(null);
  /** Актуальные обработчики для навигации (без пересоздания эффекта). */
  const navHandlersRef = useRef<GamepadNavHandlers | null>(null);

  const { focusIndex, setFocusIndex, onNavUp, onNavDown } = useGamepadFocus({
    count: ITEM_COUNT,
    initialIndex: ITEM.master,
  });

  const selectTrack = (id: TrackId) => {
    setSelectedTrack(id);
    setOpenDropdown(null);
    if (isMenuTrackId(id)) {
      props.onMenuTrackChange(id);
    } else {
      props.onCombatTrackChange(id);
    }
  };

  const selectLanguage = (id: LangId) => {
    setLang(id);
    setOpenDropdown(null);
  };

  const isFocused = (index: number) => props.isGamepad && focusIndex === index;

  const updateVolume = (key: "master" | "sfx" | "music", delta: number) => {
    const value = Math.max(0, Math.min(1, props.vols[key] + delta));
    props.onChange({ ...props.vols, [key]: value });
  };

  const moveTrack = (delta: number) => {
    const current = ALL_TRACK_IDS.indexOf(selectedTrack);
    const next = ((current + delta) % ALL_TRACK_IDS.length + ALL_TRACK_IDS.length)
      % ALL_TRACK_IDS.length;
    const id = ALL_TRACK_IDS[next];
    if (id) selectTrack(id);
  };

  const moveLanguage = (delta: number) => {
    const current = LANG_OPTIONS.findIndex((option) => option.id === lang);
    const next = ((current + delta) % LANG_OPTIONS.length + LANG_OPTIONS.length)
      % LANG_OPTIONS.length;
    const option = LANG_OPTIONS[next];
    if (option) selectLanguage(option.id);
  };

  const openTrackDropdown = () => {
    const index = ALL_TRACK_IDS.indexOf(selectedTrack);
    setDropdownIndex(index < 0 ? 0 : index);
    setOpenDropdown("track");
  };

  const openLanguageDropdown = () => {
    const index = LANG_OPTIONS.findIndex((option) => option.id === lang);
    setDropdownIndex(index < 0 ? 0 : index);
    setOpenDropdown("language");
  };

  const moveDropdown = (delta: number) => {
    const count = openDropdown === "track"
      ? ALL_TRACK_IDS.length
      : openDropdown === "language"
        ? LANG_OPTIONS.length
        : 0;
    if (count <= 0) return;
    setDropdownIndex((prev) => ((prev + delta) % count + count) % count);
  };

  const confirmDropdown = () => {
    if (openDropdown === "track") {
      const id = ALL_TRACK_IDS[dropdownIndex];
      if (id) selectTrack(id);
    } else if (openDropdown === "language") {
      const option = LANG_OPTIONS[dropdownIndex];
      if (option) selectLanguage(option.id);
    }
    setOpenDropdown(null);
  };

  const confirmItem = () => {
    switch (focusIndex) {
      case ITEM.track:
        if (openDropdown === "track") confirmDropdown();
        else openTrackDropdown();
        break;
      case ITEM.listen:
        props.onPreviewTrack(selectedTrack);
        break;
      case ITEM.test:
        props.onTest();
        break;
      case ITEM.language:
        if (openDropdown === "language") confirmDropdown();
        else openLanguageDropdown();
        break;
      case ITEM.reset:
        props.onReset();
        break;
      case ITEM.back:
        props.onBack();
        break;
      default:
        break;
    }
  };

  const adjustItem = (delta: number) => {
    if (openDropdown) {
      moveDropdown(delta);
      return;
    }
    switch (focusIndex) {
      case ITEM.master:
        updateVolume("master", delta * 0.05);
        break;
      case ITEM.sfx:
        updateVolume("sfx", delta * 0.05);
        break;
      case ITEM.music:
        updateVolume("music", delta * 0.05);
        break;
      case ITEM.track:
        moveTrack(delta);
        break;
      case ITEM.language:
        moveLanguage(delta);
        break;
      default:
        break;
    }
  };

  navHandlersRef.current = {
    up: () => {
      if (openDropdown) moveDropdown(-1);
      else onNavUp();
    },
    down: () => {
      if (openDropdown) moveDropdown(1);
      else onNavDown();
    },
    left: () => adjustItem(-1),
    right: () => adjustItem(1),
    confirm: confirmItem,
    cancel: () => {
      if (openDropdown) setOpenDropdown(null);
      else props.onBack();
    },
  };

  // Регистрируем стабильные обёртки: они всегда читают актуальные обработчики.
  useEffect(() => {
    const ref = props.gamepadNavRef;
    ref.current = {
      up: () => navHandlersRef.current?.up(),
      down: () => navHandlersRef.current?.down(),
      left: () => navHandlersRef.current?.left(),
      right: () => navHandlersRef.current?.right(),
      confirm: () => navHandlersRef.current?.confirm?.(),
      cancel: () => navHandlersRef.current?.cancel?.(),
    };
    return () => {
      ref.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {},
        confirm: null, cancel: null,
      };
    };
  }, [props.gamepadNavRef]);

  // При смене фокуса — прокрутить пункт в видимую область.
  useEffect(() => {
    if (!props.isGamepad) return;
    bodyRef.current
      ?.querySelector<HTMLElement>('[data-gamepad-focused="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [focusIndex, props.isGamepad]);

  // При навигации внутри открытого списка — прокрутить активную опцию.
  useEffect(() => {
    if (!openDropdown) return;
    bodyRef.current
      ?.querySelector<HTMLElement>('[data-dropdown-active="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [dropdownIndex, openDropdown]);

  const trackOptions = ALL_TRACK_IDS.map((id) => ({ id, label: t(TRACK_NAMES[id]) }));
  const currentLangLabel = lang === "ru" ? "РУС" : "ENG";

  const dropdownButtonClass =
    "music-select flex w-full items-center justify-between text-left";

  const openDropdownButton = (kind: "track" | "language", onOpen: () => void) => {
    setFocusIndex(kind === "track" ? ITEM.track : ITEM.language);
    if (openDropdown === kind) setOpenDropdown(null);
    else onOpen();
  };

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
          <div ref={bodyRef} className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-7">
            <div className="flex flex-col gap-5">
              {/* ===== Звук ===== */}
              <div>
                <GroupLabel>{t("settings.groupAudio")}</GroupLabel>
                <div className="flex flex-col gap-4">
                  <div
                    data-gamepad-focused={isFocused(ITEM.master) ? "true" : undefined}
                    style={focusStyle(isFocused(ITEM.master))}
                    onPointerDown={() => setFocusIndex(ITEM.master)}
                  >
                    <SliderRow
                      label={t("settings.volume")}
                      value={props.vols.master}
                      onChange={(v) => props.onChange({ ...props.vols, master: v })}
                    />
                  </div>
                  <div
                    data-gamepad-focused={isFocused(ITEM.sfx) ? "true" : undefined}
                    style={focusStyle(isFocused(ITEM.sfx))}
                    onPointerDown={() => setFocusIndex(ITEM.sfx)}
                  >
                    <SliderRow
                      label={t("settings.sfx")}
                      value={props.vols.sfx}
                      onChange={(v) => props.onChange({ ...props.vols, sfx: v })}
                    />
                  </div>
                  <div
                    data-gamepad-focused={isFocused(ITEM.music) ? "true" : undefined}
                    style={focusStyle(isFocused(ITEM.music))}
                    onPointerDown={() => setFocusIndex(ITEM.music)}
                  >
                    <SliderRow
                      label={t("settings.music")}
                      value={props.vols.music}
                      onChange={(v) => props.onChange({ ...props.vols, music: v })}
                    />
                  </div>

                  <div
                    data-gamepad-focused={isFocused(ITEM.track) ? "true" : undefined}
                    style={focusStyle(isFocused(ITEM.track))}
                    onPointerDown={() => setFocusIndex(ITEM.track)}
                  >
                    <div className="hud-label mb-2">{t("settings.musicTrack")}</div>
                    <button
                      type="button"
                      className={dropdownButtonClass}
                      onClick={() => openDropdownButton("track", openTrackDropdown)}
                      aria-haspopup="listbox"
                      aria-expanded={openDropdown === "track"}
                      aria-label={t("settings.musicTrack")}
                    >
                      <span>{t(TRACK_NAMES[selectedTrack])}</span>
                      <span aria-hidden="true">{openDropdown === "track" ? "▲" : "▼"}</span>
                    </button>
                    {openDropdown === "track" && (
                      <div
                        className="mt-1 max-h-44 overflow-y-auto border border-[#5ef2ff]/30 bg-[#060d1a]"
                        role="listbox"
                        aria-label={t("settings.musicTrack")}
                      >
                        {trackOptions.map((option, index) => (
                          <button
                            key={option.id}
                            type="button"
                            role="option"
                            aria-selected={option.id === selectedTrack}
                            data-dropdown-active={index === dropdownIndex ? "true" : undefined}
                            onClick={() => selectTrack(option.id)}
                            className={
                              "block w-full px-3 py-1.5 text-left font-mono text-[11px] " +
                              "tracking-[0.1em] transition-colors " +
                              (index === dropdownIndex
                                ? "bg-[#ffb84d]/20 text-[#ffe0a3]"
                                : "text-[#9db4d6] hover:bg-[#5ef2ff]/10")
                            }
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div
                    data-gamepad-focused={isFocused(ITEM.listen) ? "true" : undefined}
                    style={focusStyle(isFocused(ITEM.listen))}
                    onPointerDown={() => setFocusIndex(ITEM.listen)}
                  >
                    <GameButton
                      onClick={() => {
                        setFocusIndex(ITEM.listen);
                        props.onPreviewTrack(selectedTrack);
                      }}
                      variant="cyan"
                      small
                      className="w-full"
                      gamepadFocused={isFocused(ITEM.listen)}
                    >
                      {t("settings.listen")}
                    </GameButton>
                  </div>

                  <div
                    data-gamepad-focused={isFocused(ITEM.test) ? "true" : undefined}
                    style={focusStyle(isFocused(ITEM.test))}
                    onPointerDown={() => setFocusIndex(ITEM.test)}
                  >
                    <GameButton
                      onClick={() => {
                        setFocusIndex(ITEM.test);
                        props.onTest();
                      }}
                      variant="amber"
                      small
                      className="w-full"
                      gamepadFocused={isFocused(ITEM.test)}
                    >
                      {t("settings.test")}
                    </GameButton>
                  </div>
                </div>
              </div>

              {/* ===== Интерфейс ===== */}
              <div>
                <GroupLabel>{t("settings.groupInterface")}</GroupLabel>
                <div
                  data-gamepad-focused={isFocused(ITEM.language) ? "true" : undefined}
                  style={focusStyle(isFocused(ITEM.language))}
                  onPointerDown={() => setFocusIndex(ITEM.language)}
                >
                  <div className="hud-label mb-2">{t("settings.language")}</div>
                  <button
                    type="button"
                    className={dropdownButtonClass}
                    onClick={() => openDropdownButton("language", openLanguageDropdown)}
                    aria-haspopup="listbox"
                    aria-expanded={openDropdown === "language"}
                    aria-label={t("settings.language")}
                  >
                    <span>{currentLangLabel}</span>
                    <span aria-hidden="true">{openDropdown === "language" ? "▲" : "▼"}</span>
                  </button>
                  {openDropdown === "language" && (
                    <div
                      className="mt-1 border border-[#5ef2ff]/30 bg-[#060d1a]"
                      role="listbox"
                      aria-label={t("settings.language")}
                    >
                      {LANG_OPTIONS.map((option, index) => (
                        <button
                          key={option.id}
                          type="button"
                          role="option"
                          aria-selected={lang === option.id}
                          data-dropdown-active={index === dropdownIndex ? "true" : undefined}
                          onClick={() => selectLanguage(option.id)}
                          className={
                            "block w-full px-3 py-1.5 text-left font-mono text-[11px] " +
                            "tracking-[0.1em] transition-colors " +
                            (index === dropdownIndex
                              ? "bg-[#ffb84d]/20 text-[#ffe0a3]"
                              : "text-[#9db4d6] hover:bg-[#5ef2ff]/10")
                          }
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ===== Прогресс ===== */}
              <div>
                <GroupLabel>{t("settings.groupProgress")}</GroupLabel>
                <div
                  data-gamepad-focused={isFocused(ITEM.reset) ? "true" : undefined}
                  style={focusStyle(isFocused(ITEM.reset))}
                  onPointerDown={() => setFocusIndex(ITEM.reset)}
                >
                  <GameButton
                    onClick={() => {
                      setFocusIndex(ITEM.reset);
                      props.onReset();
                    }}
                    variant="red"
                    small
                    className="w-full"
                    gamepadFocused={isFocused(ITEM.reset)}
                  >
                    {t("settings.resetProgress")}
                  </GameButton>
                </div>
              </div>
            </div>
          </div>

          {/* Footer — fixed */}
          <div className="shrink-0 border-t border-[#5ef2ff]/15 bg-[#060d1a]/60 p-4">
            <div
              data-gamepad-focused={isFocused(ITEM.back) ? "true" : undefined}
              style={focusStyle(isFocused(ITEM.back))}
              className="flex justify-center"
            >
              <GameButton
                onClick={() => {
                  setFocusIndex(ITEM.back);
                  props.onBack();
                }}
                variant="amber"
                gamepadFocused={isFocused(ITEM.back)}
              >
                {t("settings.back")}
              </GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
