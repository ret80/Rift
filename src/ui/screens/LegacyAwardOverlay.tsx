import { useEffect, type MutableRefObject } from "react";
import { useT } from "../../i18n";
import { artifactById, type LegacyAward } from "../../game/meta/legacy";
import type { GamepadNavHandlers } from "../ScreenRouter";
import GameButton from "../components/GameButton";

/**
 * LegacyAwardOverlay — карточка артефакта Наследия.
 *
 * Появляется после зачистки первой волны, между баннером «волна пройдена» и
 * отсчётом следующей: мир стоит, пока игрок не закроет карточку. Выбора нет —
 * артефакт уже выдан и действует, карточка только сообщает, что досталось.
 *
 * Геймпад: A закрывает карточку; B не действует, награду нельзя «отменить».
 */
export default function LegacyAwardOverlay(props: {
  award: LegacyAward;
  onDismiss: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const artifact = artifactById(props.award.id);
  const { onDismiss, gamepadNavRef } = props;

  useEffect(() => {
    gamepadNavRef.current = {
      up: () => {},
      down: () => {},
      left: () => {},
      right: () => {},
      confirm: onDismiss,
      cancel: () => {},
    };
    return () => {
      gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {},
        confirm: null, cancel: null,
      };
    };
  }, [onDismiss, gamepadNavRef]);

  if (!artifact) return null;

  return (
    <div
      className="anim-overlay absolute inset-0 z-30 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("meta.legacyAwardTitle")}
    >
      <div className="w-[min(560px,96vw)]">
        <div className="hud-panel p-5 sm:p-7">
          <div className="text-center">
            <div className="font-display text-xl tracking-[0.3em] text-[#eaffff] text-glow-cyan sm:text-2xl">
              {t("meta.legacyAwardTitle")}
            </div>
            <div className="mt-2 text-[10px] tracking-[0.22em] text-[#6f86a8] sm:text-xs">
              {t("meta.legacyAwardHint")}
            </div>
          </div>

          <div className="mt-5 border border-[#c79bff]/40 bg-[#120a1c]/80 p-4">
            <div className="font-display text-base tracking-[0.16em] text-[#c79bff]">
              {t(artifact.nameKey)}
            </div>
            <div className="mt-2 text-xs leading-5 text-[#9db4d6]">
              {t(artifact.descKey)}
            </div>
          </div>

          <div className="mt-5 flex justify-center">
            <GameButton
              onClick={onDismiss}
              variant="cyan"
              autoFocus={!props.isGamepad}
              gamepadFocused={props.isGamepad}
            >
              {t("meta.legacyAwardContinue")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
