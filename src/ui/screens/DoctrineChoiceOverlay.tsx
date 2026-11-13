import { useEffect, useMemo, useState, type MutableRefObject } from "react";
import { useT } from "../../i18n";
import { doctrineById, type DoctrineOffer } from "../../game/meta/doctrines";
import type { GamepadNavHandlers } from "../ScreenRouter";

/**
 * DoctrineChoiceOverlay — награда за босс-волну.
 *
 * Появляется между исчезновением баннера «волна пройдена» и отсчётом
 * следующей волны: мир стоит, пока игрок не возьмёт одну из двух доктрин.
 * Действующая доктрина в предложение не попадает (см. `pickDoctrineOptions`).
 *
 * Геймпад: left/right — выбор карточки, A — подтвердить.
 */
export default function DoctrineChoiceOverlay(props: {
  offer: DoctrineOffer;
  onChoose: (id: string) => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const doctrines = useMemo(
    () => props.offer.options.map(doctrineById).filter((d) => d !== null),
    [props.offer.options],
  );
  const [focusIndex, setFocusIndex] = useState(0);

  const choose = props.onChoose;
  const count = doctrines.length;
  useEffect(() => {
    if (count === 0) return;
    const move = (delta: number) => setFocusIndex((i) => (i + delta + count) % count);
    const confirm = () => {
      const doctrine = doctrines[Math.min(focusIndex, count - 1)];
      if (doctrine) choose(doctrine.id);
    };
    props.gamepadNavRef.current = {
      up: () => {},
      down: () => {},
      left: () => move(-1),
      right: () => move(1),
      confirm,
      // Выбор обязателен: B не закрывает награду.
      cancel: () => {},
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {},
        down: () => {},
        left: () => {},
        right: () => {},
        confirm: null,
        cancel: null,
      };
    };
  }, [doctrines, focusIndex, count, choose, props.gamepadNavRef]);

  if (count === 0) return null;

  return (
    <div
      className="anim-overlay absolute inset-0 z-30 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("meta.doctrineChoiceTitle")}
    >
      <div className="w-[min(720px,96vw)]">
        <div className="hud-panel p-5 sm:p-7">
          <div className="text-center">
            <div className="font-display text-xl tracking-[0.3em] text-[#eaffff] text-glow-cyan sm:text-2xl">
              {t("meta.doctrineChoiceTitle")}
            </div>
            <div className="mt-2 text-[10px] tracking-[0.22em] text-[#6f86a8] sm:text-xs">
              {t("meta.doctrineChoiceHint")}
            </div>
          </div>

          <div className="mt-5 flex flex-col gap-3 sm:flex-row">
            {doctrines.map((doctrine, index) => (
              <button
                key={doctrine.id}
                type="button"
                autoFocus={!props.isGamepad && index === 0}
                onClick={() => choose(doctrine.id)}
                onPointerEnter={() => setFocusIndex(index)}
                className={
                  "flex-1 border p-4 text-left transition " +
                  (props.isGamepad && focusIndex === index
                    ? "border-[#5ef2ff] bg-[#0b1a28]/90 shadow-[0_0_22px_rgba(94,242,255,0.25)]"
                    : "border-[#5ef2ff]/30 bg-[#071019]/80 hover:border-[#5ef2ff] hover:bg-[#0b1a28]/90")
                }
              >
                <div className="font-display text-sm tracking-[0.16em] text-[#eaffff]">
                  {t(doctrine.nameKey)}
                </div>
                <div className="mt-2 text-xs leading-5 text-[#9db4d6]">{t(doctrine.descKey)}</div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
