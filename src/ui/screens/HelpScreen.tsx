import React, { useEffect, useRef, type MutableRefObject } from "react";
import GameButton from "../components/GameButton";
import { EnemySprite } from "../components/EnemySprite";
import { Icon, type IconKind } from "../components/Icon";
import { useT, type TKey } from "../../i18n";
import { EnemyKind } from "../../game/balance";
import type { GamepadNavHandlers } from "../ScreenRouter";

/** Заголовок раздела справки. */
function Section(props: { title: string }) {
  return (
    <div className="mb-2 mt-6 text-[11px] tracking-[0.25em] text-[#5ef2ff] first:mt-0">
      {"// "}{props.title}
    </div>
  );
}

/** Цветной глиф для бонусов без отдельной иконки. */
function Glyph(props: { color: string; char: string }) {
  return <span style={{ color: props.color }}>{props.char}</span>;
}

/**
 * Таблица справки: в левой ячейке — уменьшённый спрайт, справа — описание.
 * Спрайты целей берут геометрию из боя, поэтому силуэт совпадает с ареной.
 */
function SpriteRow(props: { sprite: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[40px_1fr] items-center gap-3">
      <div className="flex h-10 w-10 items-center justify-center border border-[#5ef2ff]/15 bg-[#0b1420]/60">
        {props.sprite}
      </div>
      <div className="text-[13px] leading-5 text-[#9db4d6]">{props.children}</div>
    </div>
  );
}

/** Порядок и подписи целей в справке. */
const ENEMY_ROWS: ReadonlyArray<{ kind: EnemyKind; key: TKey }> = [
  { kind: EnemyKind.Drone, key: "help.drone" },
  { kind: EnemyKind.Hunter, key: "help.hunter" },
  { kind: EnemyKind.Fighter, key: "help.fighter" },
  { kind: EnemyKind.Cruiser, key: "help.cruiser" },
  { kind: EnemyKind.Carrier, key: "help.carrier" },
  { kind: EnemyKind.Miner, key: "help.miner" },
  { kind: EnemyKind.Mine, key: "help.mine" },
  { kind: EnemyKind.Needle, key: "help.needle" },
  { kind: EnemyKind.Shieldbearer, key: "help.shieldbearer" },
  { kind: EnemyKind.Harpooner, key: "help.harpooner" },
  { kind: EnemyKind.Splitter, key: "help.splitter" },
  { kind: EnemyKind.Jammer, key: "help.jammer" },
  { kind: EnemyKind.Vortex, key: "help.vortex" },
  { kind: EnemyKind.HiveMother, key: "help.hiveMother" },
  { kind: EnemyKind.Boss, key: "help.boss" },
];

/** Строки бонусов: иконка из боя и описание. */
const BONUS_ROWS: ReadonlyArray<
  { icon: IconKind; key: TKey } | { glyph: string; color: string; key: TKey }
> = [
  { icon: "pickup-heal", key: "help.heal" },
  { icon: "pickup-rate", key: "help.rate" },
  { icon: "pickup-gun", key: "help.gun" },
  { icon: "pickup-drone", key: "help.allyDrone" },
  { icon: "pickup-shield", key: "help.shield" },
  { icon: "weapon-cannon", key: "help.weapon" },
  { icon: "ability-quantum-swap", key: "help.swap" },
  { glyph: "⬡", color: "#8a9bb8", key: "help.asteroid" },
];

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
                <span className="kbd">Q</span>
                <span>— {t("help.shieldLine")}</span>
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

            <Section title={t("help.shieldTitle")} />
            <div className="space-y-2">
              <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.shieldBody")}</p>
              <p className="text-[13px] leading-5 text-[#66e0ff]">{t("help.shieldNumbers")}</p>
            </div>

            <Section title={t("help.dronesTitle")} />
            <p className="text-[13px] leading-5 text-[#9db4d6]">{t("help.dronesBody")}</p>

            <Section title={t("help.enemies")} />
            <div className="space-y-2">
              {ENEMY_ROWS.map((row) => (
                <SpriteRow key={row.kind} sprite={<EnemySprite kind={row.kind} size={30} />}>
                  {t(row.key)}
                </SpriteRow>
              ))}
            </div>

            <Section title={t("help.bonuses")} />
            <div className="space-y-2">
              {BONUS_ROWS.map((row) => (
                <SpriteRow
                  key={row.key}
                  sprite={
                    "icon" in row
                      ? <Icon kind={row.icon} size={22} />
                      : <Glyph color={row.color} char={row.glyph} />
                  }
                >
                  {t(row.key)}
                </SpriteRow>
              ))}
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
