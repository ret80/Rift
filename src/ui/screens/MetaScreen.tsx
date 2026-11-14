import { useCallback, useEffect, useMemo, useState } from "react";
import { useT, type TKey } from "../../i18n";
import { createLocalStoragePort } from "../../game/core/PersistencePort";
import { META_TALENTS } from "../../game/meta/metaTalents";
import { MetaTree } from "../../game/meta/MetaTree";
import { loadCredits, saveCredits } from "../../game/meta/MetaStorage";
import { Wallet } from "../../game/economy/Wallet";
import { loadInfiniteCredits } from "../../game/economy/infinite";
import { AscensionSystem } from "../../game/meta/AscensionSystem";
import {
  ASCENSION_MODIFIERS,
  MAX_THREAT_LEVEL,
  THREAT_UNLOCK_BEST_WAVE,
  ascensionEffects,
  isAscensionUnlocked,
  threatLevelOf,
  type AscensionModifierId,
} from "../../game/meta/ascension";
import { loadBestWave } from "../../game/upgrades";
import { DOCTRINES } from "../../game/meta/doctrines";
import { LEGACY_ARTIFACTS } from "../../game/meta/legacy";
import type { MetaTalent } from "../../game/meta/types";
import type { GamepadNavHandlers } from "../ScreenRouter";
import type { MutableRefObject } from "react";
import GameButton from "../components/GameButton";
import ScreenHeader from "../components/ScreenHeader";

type MetaTab = "talents" | "ascension";

const TABS: ReadonlyArray<{ id: MetaTab; key: TKey }> = [
  { id: "talents", key: "meta.tabsTalents" },
  { id: "ascension", key: "meta.tabsAscension" },
];

/** Множитель в виде «1.35». */
function mult(value: number): string {
  return value.toFixed(2);
}

/**
 * MetaScreen — Эхо Разлома: постоянные таланты и выбор на следующий забег.
 *
 * Вкладки:
 *   • таланты — покупка за кредиты;
 *   • асценсия — уровень угрозы и его награда.
 *
 * Доктрины в меню не выбираются: их выдаёт босс-волна (см. `DoctrineChoiceOverlay`).
 * Наследие живёт отдельным экраном (`LegacyScreen`): артефакт выбирается
 * перед забегом, а не в мета-дереве.
 */
export default function MetaScreen(props: {
  onBack: () => void;
  gamepadNavRef?: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const storage = useMemo(() => createLocalStoragePort(), []);
  const [tree, setTree] = useState(() => MetaTree.load(storage));
  const [credits, setCredits] = useState(0);
  const [infiniteCredits, setInfiniteCredits] = useState(false);
  const [selection, setSelection] = useState<readonly AscensionModifierId[]>([]);
  const [bestWave, setBestWave] = useState(0);
  const [tab, setTab] = useState<MetaTab>("talents");

  const refresh = useCallback(() => {
    setTree(MetaTree.load(storage));
    setCredits(loadCredits(storage));
    setInfiniteCredits(loadInfiniteCredits(storage));
    setSelection([...AscensionSystem.load(storage).selected]);
    setBestWave(loadBestWave(storage));
  }, [storage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const toggleModifier = useCallback((id: AscensionModifierId) => {
    const system = AscensionSystem.load(storage);
    system.toggle(id, storage);
    setSelection([...system.selected]);
  }, [storage]);

  const clearModifiers = useCallback(() => {
    AscensionSystem.load(storage).clear(storage);
    setSelection([]);
  }, [storage]);

  // Геймпад: LB/RB листают вкладки, B возвращает в меню. Кнопки вкладок
  // остаются кликабельными — геймпад только дублирует навигацию.
  const { gamepadNavRef, onBack } = props;
  useEffect(() => {
    const nav = gamepadNavRef?.current;
    if (!nav) return;
    const index = TABS.findIndex((entry) => entry.id === tab);
    const step = (delta: number) => {
      const next = TABS[(index + delta + TABS.length) % TABS.length];
      setTab(next.id);
    };
    const previous = {
      tabLeft: nav.tabLeft,
      tabRight: nav.tabRight,
      cancel: nav.cancel,
    };
    nav.tabLeft = () => step(-1);
    nav.tabRight = () => step(1);
    nav.cancel = onBack;
    return () => {
      nav.tabLeft = previous.tabLeft;
      nav.tabRight = previous.tabRight;
      nav.cancel = previous.cancel;
    };
  }, [gamepadNavRef, onBack, tab]);

  const handleBuy = useCallback((talent: MetaTalent) => {
    const cost = tree.nextCost(talent);
    if (cost === null) return;
    const wallet = new Wallet(loadCredits(storage));
    wallet.setInfinite(loadInfiniteCredits(storage));
    // Бесконечный кошелёк подтверждает любую сумму: передаём ровно цену.
    const remaining = tree.purchase(talent, wallet.infinite ? cost : wallet.amount);
    if (remaining === null) return;
    wallet.spend(cost);
    tree.save(storage);
    saveCredits(storage, wallet.amount);
    refresh();
  }, [tree, storage, refresh]);

  const red = META_TALENTS.filter((x) => x.branch === "red");
  const green = META_TALENTS.filter((x) => x.branch === "green");

  const renderTalent = (talent: MetaTalent) => {
    const level = tree.getLevel(talent.id);
    const maxed = level >= talent.maxLevel;
    const cost = tree.nextCost(talent);
    const locked = !tree.prerequisiteMet(talent);
    const canBuy = !maxed && !locked && cost !== null && (infiniteCredits || credits >= cost);
    return (
      <div
        key={talent.id}
        className={
          "mb-3 rounded border p-3 " +
          (locked ? "border-[#3d4f6d]/20 opacity-60" : "border-[#5ef2ff]/20")
        }
      >
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-sm text-[#eaffff]">{t(talent.nameKey)}</div>
            <div className="text-xs text-[#6f86a8]">{t(talent.descKey)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#ffb84d]">Lv {level}/{talent.maxLevel}</div>
            {maxed ? (
              <div className="text-xs text-[#7dff9e]">{t("meta.maxLevel")}</div>
            ) : locked ? (
              <div className="text-xs text-[#6f86a8]">{t("meta.locked")}</div>
            ) : (
              <GameButton
                onClick={() => handleBuy(talent)}
                variant="cyan"
                disabled={!canBuy}
                title={!infiniteCredits && credits < (cost ?? 0) ? t("meta.noCredits") : undefined}
                className="mt-1 px-3 py-1 text-xs"
              >
                {t("meta.buy")} ({cost})
              </GameButton>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("meta.title")}
    >
      <div className="flex max-h-[92vh] w-[min(560px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col">
          <ScreenHeader
            title={t("meta.title")}
            aside={
              <div className="text-sm text-[#ffb84d]">
                {t("meta.credits")}: {infiniteCredits ? "∞" : credits}
              </div>
            }
          />

          <div className="flex gap-1 border-b border-[#5ef2ff]/10 px-3 pt-2 sm:px-5">
            {TABS.map((entry) => (
              <button
                key={entry.id}
                type="button"
                onClick={() => setTab(entry.id)}
                aria-pressed={tab === entry.id}
                className={
                  "border-b-2 px-3 py-2 text-[10px] tracking-[0.18em] transition-colors " +
                  (tab === entry.id
                    ? "border-[#5ef2ff] text-[#eaffff]"
                    : "border-transparent text-[#6f86a8] hover:text-[#9db4d6]")
                }
              >
                {t(entry.key)}
              </button>
            ))}
          </div>

          {/* Содержимое вкладки — единственная прокручиваемая часть экрана. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7">
            {tab === "talents" && (
              <>
                <div className="mb-4">
                  <div className="mb-2 text-xs tracking-[0.2em] text-[#ff5c54]">
                    {t("meta.branchRed")}
                  </div>
                  {red.map(renderTalent)}
                </div>
                <div>
                  <div className="mb-2 text-xs tracking-[0.2em] text-[#5ef2ff]">
                    {t("meta.branchGreen")}
                  </div>
                  {green.map(renderTalent)}
                </div>
              </>
            )}

            {tab === "ascension" && (() => {
              const unlocked = isAscensionUnlocked(bestWave);
              const effects = ascensionEffects(selection);
              const level = threatLevelOf(selection);
              const rewardRows = [
                ...DOCTRINES.filter((doctrine) => doctrine.minThreatLevel).map((doctrine) => ({
                  id: doctrine.id,
                  kind: "doctrine" as const,
                  nameKey: doctrine.nameKey,
                  tl: doctrine.minThreatLevel ?? 0,
                })),
                ...LEGACY_ARTIFACTS.filter((artifact) => artifact.minThreatLevel).map((artifact) => ({
                  id: artifact.id,
                  kind: "artifact" as const,
                  nameKey: artifact.nameKey,
                  tl: artifact.minThreatLevel ?? 0,
                })),
              ].sort((a, b) => a.tl - b.tl);
              return (
                <>
                  <p className="mb-3 text-xs leading-5 text-[#6f86a8]">
                    {t("meta.ascensionHint")}
                  </p>

                  <div className="mb-4 rounded border border-[#5ef2ff]/20 p-3">
                    <div className="flex items-center justify-between gap-3">
                      <div className="font-display text-sm text-[#eaffff]">
                        {unlocked
                          ? t("meta.ascensionTotal", {
                              lv: String(level),
                              max: String(MAX_THREAT_LEVEL),
                            })
                          : t("meta.ascensionLocked", {
                              wave: String(THREAT_UNLOCK_BEST_WAVE),
                            })}
                      </div>
                      {selection.length > 0 && (
                        <GameButton
                          onClick={clearModifiers}
                          variant="amber"
                          className="shrink-0 px-3 py-1 text-xs"
                        >
                          {t("meta.ascensionReset")}
                        </GameButton>
                      )}
                    </div>
                    <div className="mt-1 text-xs text-[#6f86a8]">
                      {t("meta.ascensionReward", {
                        c: mult(effects.creditsMult),
                        p: mult(effects.partsMult),
                      })}
                    </div>
                  </div>

                  <div className="grid gap-2 sm:grid-cols-2">
                    {ASCENSION_MODIFIERS.map((def) => {
                      const active = selection.includes(def.id);
                      const exceeds = level + def.tl > MAX_THREAT_LEVEL;
                      const disabled = !unlocked || (!active && exceeds);
                      return (
                        <button
                          key={def.id}
                          type="button"
                          onClick={() => toggleModifier(def.id)}
                          disabled={disabled}
                          className={
                            "rounded border p-3 text-left transition " +
                            (active
                              ? "border-[#ff8c42]/60 bg-[#ff8c42]/5"
                              : "border-[#5ef2ff]/20") +
                            (disabled
                              ? " cursor-not-allowed opacity-40"
                              : " hover:border-[#5ef2ff]/50")
                          }
                        >
                          <div className="flex items-center justify-between gap-3">
                            <span
                              className={
                                "font-display text-sm " +
                                (active ? "text-[#ffd28c]" : "text-[#eaffff]")
                              }
                            >
                              {t(def.nameKey as TKey)}
                            </span>
                            <span className="shrink-0 text-xs text-[#ff8c42]">
                              {t("meta.ascensionCost", { n: String(def.tl) })}
                            </span>
                          </div>
                          <div className="mt-1 text-xs leading-5 text-[#6f86a8]">
                            {t(def.descKey as TKey)}
                          </div>
                        </button>
                      );
                    })}
                  </div>

                  <div className="mt-5 mb-2 text-xs tracking-[0.2em] text-[#ff8c42]">
                    {t("meta.ascensionUnlocks")}
                  </div>

                  <div className="grid gap-1 sm:grid-cols-2">
                    {rewardRows.map((row) => {
                      const open = level >= row.tl;
                      return (
                        <div
                          key={`${row.kind}:${row.id}`}
                          className={
                            "flex items-center justify-between gap-2 rounded border px-2 py-1 " +
                            (open
                              ? "border-[#7dff9e]/30 text-[#a8ffc0]"
                              : "border-[#5ef2ff]/15 text-[#6f86a8]")
                          }
                        >
                          <span className="min-w-0 truncate text-xs">
                            <span className="text-[8px] uppercase tracking-[0.16em] opacity-70">
                              {row.kind === "doctrine"
                                ? t("meta.ascensionKindDoctrine")
                                : t("meta.ascensionKindArtifact")}{" "}
                            </span>
                            {t(row.nameKey)}
                          </span>
                          <span className="shrink-0 text-xs">
                            {t("meta.ascensionUnlockAt", { tl: String(row.tl) })}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </>
              );
            })()}
          </div>

          <div className="border-t border-[#5ef2ff]/15 px-5 py-3 sm:px-7">
            <div className="flex justify-center">
              <GameButton onClick={props.onBack} variant="amber">
                {t("meta.back")}
              </GameButton>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
