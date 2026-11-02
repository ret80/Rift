import { useEffect, useMemo, type MutableRefObject } from "react";
import { useGamepadFocus } from "../../hooks/useGamepadFocus";
import { useT } from "../../i18n";
import GameButton from "../components/GameButton";
import type { GamepadNavHandlers } from "../ScreenRouter";

/**
 * PauseOverlay — пауза во время игры.
 *
 * Gamepad-навигация:
 *   - D-pad up/down + левый стик → перемещение фокуса по кнопкам
 *   - Кнопка A → подтвердить выбор
 *   - Кнопка B → в главное меню (заменяет "Назад")
 */
export default function PauseOverlay(props: {
  onResume: () => void;
  onSettings: () => void;
  onMenu: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();

  const { focusIndex, onNavUp, onNavDown, onNavLeft, onNavRight } = useGamepadFocus({
    count: 3,
    initialIndex: 0,
  });

  const actions = useMemo(
    () => [props.onResume, props.onSettings, props.onMenu],
    [props.onResume, props.onSettings, props.onMenu],
  );

  // Регистрируем навигацию и confirm в общий ref.
  useEffect(() => {
    const handler = () => { actions[focusIndex]?.(); };
    props.gamepadNavRef.current = {
      up: onNavUp,
      down: onNavDown,
      left: onNavLeft,
      right: onNavRight,
      confirm: handler,
      cancel: props.onMenu,
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {},
        confirm: null, cancel: null,
      };
    };
  }, [onNavUp, onNavDown, onNavLeft, onNavRight, focusIndex, actions, props.gamepadNavRef, props.onMenu]);

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
            <GameButton
              onClick={props.onResume}
              autoFocus={!props.isGamepad}
              gamepadFocused={props.isGamepad && focusIndex === 0}
            >
              {t("pause.resume")}
            </GameButton>
            <GameButton
              onClick={props.onSettings}
              variant="amber"
              gamepadFocused={props.isGamepad && focusIndex === 1}
            >
              {t("pause.settings")}
            </GameButton>
            <GameButton
              onClick={props.onMenu}
              variant="red"
              gamepadFocused={props.isGamepad && focusIndex === 2}
            >
              {t("pause.menu")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
