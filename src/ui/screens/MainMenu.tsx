import { useEffect, type MutableRefObject } from "react";
import { useGamepadFocus } from "../../hooks/useGamepadFocus";
import { useT, type TKey } from "../../i18n";
import GameButton from "../components/GameButton";
import type { GamepadNavHandlers } from "../ScreenRouter";

/**
 * MainMenu — главный экран с кнопками навигации.
 *
 * Gamepad-навигация:
 *   - D-pad up/down + левый стик → перемещение фокуса по кнопкам
 *   - Кнопка A → подтвердить выбор (старт/переход)
 *   - Кнопка B → не используется (главное меню)
 */
export default function MainMenu(props: {
  best: number;
  onPlay: () => void;
  onSettings: () => void;
  onHelp: () => void;
  onDebug: () => void;
  onUpgrade: () => void;
  onMeta: () => void;
  showDebug?: boolean;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();

  // Список кнопок меню (play, upgrade, meta, settings, help, debug опционально).
  const buttonCount = props.showDebug ? 6 : 5;

  const { focusIndex, onNavUp, onNavDown, onNavLeft, onNavRight } = useGamepadFocus({
    count: buttonCount,
    initialIndex: 0,
  });

  // Маппинг индекса на действие.
  const actions = [
    props.onPlay,
    props.onUpgrade,
    props.onMeta,
    props.onSettings,
    props.onHelp,
    ...(props.showDebug ? [props.onDebug] : []),
  ];

  // Регистрируем навигацию и confirm в общий ref для игрового движка.
  useEffect(() => {
    const handler = () => {
      const action = actions[focusIndex];
      if (action) action();
    };
    props.gamepadNavRef.current = {
      up: onNavUp,
      down: onNavDown,
      left: onNavLeft,
      right: onNavRight,
      confirm: handler,
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {}, confirm: null,
      };
    };
  }, [onNavUp, onNavDown, onNavLeft, onNavRight, focusIndex, actions, props.gamepadNavRef]);

  // Строгие ключи локализации.
  const actionKeys: TKey[] = [
    "menu.play",
    "menu.upgrade",
    "menu.meta",
    "menu.settings",
    "menu.help",
    "menu.debug",
  ];

  return (
    <div className="anim-overlay absolute inset-0 z-20 flex flex-col items-center justify-center">
      <div>
        <div className="mb-2 text-[10px] tracking-[0.5em] text-[#6f86a8] sm:text-xs">
          {t("app.subtitle")}
        </div>
        <h1 className="font-display anim-title text-6xl leading-none text-[#eaffff] sm:text-8xl">
          {t("app.title")}
        </h1>
        <div
          className={
            "mx-auto mt-3 h-[2px] w-44 bg-gradient-to-r " +
            "from-transparent via-[#5ef2ff] to-transparent sm:w-72"
          }
        />
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
        {actions.map((action, i) => (
          <GameButton
            key={i}
            onClick={() => action?.()}
            autoFocus={i === 0 && !props.isGamepad}
            gamepadFocused={props.isGamepad && focusIndex === i}
          >
            {t(actionKeys[i])}
          </GameButton>
        ))}
      </div>

      {props.showDebug && (
        <button
          onClick={props.onDebug}
          className={
            "mt-6 cursor-pointer border border-dashed border-[#7dff9e]/30 " +
            "bg-transparent px-4 py-1 font-mono text-[10px] tracking-[0.3em] " +
            "text-[#7dff9e]/60 transition-colors hover:border-[#7dff9e]/70 hover:text-[#7dff9e]"
          }
          style={{ animationDelay: "0.2s" }}
        >
          &gt; {t("menu.debug")}
        </button>
      )}

      <div className="absolute bottom-5 text-center text-[9px] tracking-[0.3em] text-[#4d5f7d]">
        {t("menu.hint")}
      </div>
    </div>
  );
}
