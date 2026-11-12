import React, { useEffect, useRef, type MutableRefObject } from "react";
import GameButton from "../components/GameButton";
import { Icon } from "../components/Icon";
import { useT } from "../../i18n";
import type { GamepadNavHandlers } from "../ScreenRouter";

/** Заголовок раздела справки. */
function Section(props: { title: string }) {
  return (
    <div className="mb-2 mt-6 text-[11px] tracking-[0.25em] text-[#5ef2ff] first:mt-0">
      {"// "}{props.title}
    </div>
  );
}

/** Строка списка: значок слева, текст справа. */
function Row(props: { icon: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="flex items-start gap-3 text-[13px] leading-5 text-[#9db4d6]">
      <span className="flex w-4 shrink-0 justify-center pt-0.5">{props.icon}</span>
      <span>{props.children}</span>
    </div>
  );
}

/** Цветной глиф для целей без отдельной иконки. */
function Glyph(props: { color: string; char: string }) {
  return <span style={{ color: props.color }}>{props.char}</span>;
}

/**
 * HelpScreen — справка по игре.
 *
 * Gamepad-навигация:
 *   - D-pad up/down + левый стик → прокрутка текста помощи
 *   - D-pad left/right → быстрая прокрутка на пол-экрана
 *   - Кнопка A / B → назад
 */
export default function HelpScreen(props: {
  onBack: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const scrollBy = (dy: number) => {
      scrollRef.current?.scrollBy({ top: dy, behavior: "smooth" });
    };
    props.gamepadNavRef.current = {
      up: () => scrollBy(-80),
      down: () => scrollBy(80),
      left: () => scrollBy(-240),
      right: () => scrollBy(240),
      confirm: props.onBack,
      cancel: props.onBack,
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {},
        confirm: null, cancel: null,
      };
    };
  }, [props.onBack, props.gamepadNavRef]);

  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("help.title")}
    >
      <div className="flex max-h-[92vh] w-[min(560px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col">
          <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto p-5 sm:p-7">
            <div className="hud-label mb-5 text-center">{t("help.title")}</div>

            <Section title={t("help.controls")} />
            <div className="mb-2 space-y-2 text-[13px] text-[#9db4d6]">
              <div className="flex flex-wrap items-center gap-2">
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
              <div className="flex flex-wrap items-center gap-2">
                <span className="kbd">ЛКМ</span>
                <span className="kbd">ПКМ</span>
                <span>— {t("help.fire")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="kbd">Shift</span>
                <span>— {t("help.boost")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="kbd">Space</span>
                <span>— {t("help.ability")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="kbd">T</span>
                <span>— {t("help.tactical")}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="kbd">P</span>
                <span className="kbd">Esc</span>
                <span>— {t("help.pause")}</span>
              </div>
              <div className="text-[12px] text-[#6f86a8]">{t("help.touch")}</div>
              <div className="text-[12px] text-[#6f86a8]">{t("help.gamepad")}</div>
            </div>

            <Section title={t("help.objective")} />
            <div className="space-y-2">
              <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.objectiveWaves")}</p>
              <p className="text-[13px] leading-5 text-[#c79bff]">{t("help.objectiveAnchors")}</p>
              <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.objectiveStorm")}</p>
              <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.objectiveHangar")}</p>
            </div>

            <Section title={t("help.boostTitle")} />
            <div className="space-y-2">
              <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.boostBody")}</p>
              <p className="text-[13px] leading-5 text-[#ffb84d]">{t("help.boostNumbers")}</p>
            </div>

            <Section title={t("help.dronesTitle")} />
            <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.dronesBody")}</p>

            <Section title={t("help.enemies")} />
            <div className="space-y-2">
              <Row icon={<Icon kind="enemy-drone" />}>{t("help.drone")}</Row>
              <Row icon={<Icon kind="enemy-hunter" />}>{t("help.hunter")}</Row>
              <Row icon={<Icon kind="enemy-fighter" />}>{t("help.fighter")}</Row>
              <Row icon={<Icon kind="enemy-cruiser" />}>{t("help.cruiser")}</Row>
              <Row icon={<Icon kind="enemy-carrier" />}>{t("help.carrier")}</Row>
              <Row icon={<Glyph color="#ffb84d" char="▲" />}>{t("help.miner")}</Row>
              <Row icon={<Glyph color="#ff6b3d" char="✳" />}>{t("help.mine")}</Row>
              <Row icon={<Glyph color="#ffd23e" char="↑" />}>{t("help.needle")}</Row>
              <Row icon={<Glyph color="#7cf3ff" char="◈" />}>{t("help.shieldbearer")}</Row>
              <Row icon={<Glyph color="#c79bff" char="⌁" />}>{t("help.harpooner")}</Row>
              <Row icon={<Glyph color="#9dffe8" char="✚" />}>{t("help.splitter")}</Row>
              <Row icon={<Glyph color="#8f9dff" char="◎" />}>{t("help.jammer")}</Row>
              <Row icon={<Glyph color="#ff8c42" char="↻" />}>{t("help.vortex")}</Row>
              <Row icon={<Glyph color="#c06bff" char="✧" />}>{t("help.hiveMother")}</Row>
              <Row icon={<Glyph color="#ff3355" char="◆" />}>{t("help.boss")}</Row>
            </div>

            <Section title={t("help.bonuses")} />
            <div className="space-y-2">
              <Row icon={<Icon kind="pickup-heal" />}>{t("help.heal")}</Row>
              <Row icon={<Icon kind="pickup-rate" />}>{t("help.rate")}</Row>
              <Row icon={<Icon kind="pickup-gun" />}>{t("help.gun")}</Row>
              <Row icon={<Icon kind="pickup-drone" />}>{t("help.allyDrone")}</Row>
              <Row icon={<Icon kind="pickup-shield" />}>{t("help.shield")}</Row>
              <Row icon={<Glyph color="#9dffe8" char="➤" />}>{t("help.weapon")}</Row>
              <Row icon={<Glyph color="#7cf3ff" char="⇄" />}>{t("help.swap")}</Row>
              <Row icon={<Glyph color="#8a9bb8" char="⬡" />}>{t("help.asteroid")}</Row>
            </div>

            <Section title={t("help.hangarTitle")} />
            <p className="mb-2 text-[13px] leading-5 text-[#9db4d6]">{t("help.hangarBody")}</p>
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
