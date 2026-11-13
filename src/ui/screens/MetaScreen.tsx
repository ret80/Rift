import { useCallback, useEffect, useMemo, useState } from "react";
import { useT, type TKey } from "../../i18n";
import { createLocalStoragePort } from "../../game/core/PersistencePort";
import { META_TALENTS } from "../../game/meta/metaTalents";
import { MetaTree } from "../../game/meta/MetaTree";
import { loadCredits, saveCredits } from "../../game/meta/MetaStorage";
import { DOCTRINES, doctrineById } from "../../game/meta/doctrines";
import { DoctrineSystem } from "../../game/meta/DoctrineSystem";
import {
  LEGACY_ARTIFACTS,
  artifactById,
  isArtifactUnlocked,
} from "../../game/meta/legacy";
import { LegacySystem } from "../../game/meta/LegacySystem";
import { AscensionSystem } from "../../game/meta/AscensionSystem";
import { THREAT_LEVELS } from "../../game/meta/ascension";
import { loadBestWave } from "../../game/upgrades";
import type { MetaTalent } from "../../game/meta/types";
import type { GamepadNavHandlers } from "../ScreenRouter";
import type { MutableRefObject } from "react";
import GameButton from "../components/GameButton";
import ScreenHeader from "../components/ScreenHeader";

type MetaTab = "talents" | "doctrines" | "legacy" | "ascension";

const TABS: ReadonlyArray<{ id: MetaTab; key: TKey }> = [
  { id: "talents", key: "meta.tabsTalents" },
  { id: "doctrines", key: "meta.tabsDoctrines" },
  { id: "legacy", key: "meta.tabsLegacy" },
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
 *   • доктрины — один контракт на забег;
 *   • асценсия — уровень угрозы и его награда.
 */
export default function MetaScreen(props: {
  onBack: () => void;
  gamepadNavRef?: MutableRefObject<GamepadNavHandlers>;
}) {
  const t = useT();
  const storage = useMemo(() => createLocalStoragePort(), []);
  const [tree, setTree] = useState(() => MetaTree.load(storage));
  const [credits, setCredits] = useState(0);
  const [doctrineId, setDoctrineId] = useState<string | null>(null);
  const [artifactId, setArtifactId] = useState<string | null>(null);
  const [bestWave, setBestWave] = useState(1);
  const [threatLevel, setThreatLevel] = useState(0);
  const [tab, setTab] = useState<MetaTab>("talents");

  const refresh = useCallback(() => {
    setTree(MetaTree.load(storage));
    setCredits(loadCredits(storage));
    setDoctrineId(DoctrineSystem.load(storage).id);
    setArtifactId(LegacySystem.load(storage).id);
    setBestWave(loadBestWave(storage));
    setThreatLevel(AscensionSystem.load(storage).level);
  }, [storage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const selectDoctrine = useCallback((id: string | null) => {
    DoctrineSystem.load(storage).select(id, storage);
    setDoctrineId(id);
  }, [storage]);

  const selectArtifact = useCallback((id: string | null) => {
    LegacySystem.load(storage).select(id, storage);
    setArtifactId(LegacySystem.load(storage).id);
  }, [storage]);

  const selectThreat = useCallback((level: number) => {
    AscensionSystem.load(storage).setLevel(level, storage);
    setThreatLevel(level);
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
    const nextCredits = tree.purchase(talent, loadCredits(storage));
    if (nextCredits === null) return;
    tree.save(storage);
    saveCredits(storage, nextCredits);
    refresh();
  }, [tree, storage, refresh]);

  const red = META_TALENTS.filter((x) => x.branch === "red");
  const green = META_TALENTS.filter((x) => x.branch === "green");

  const renderTalent = (talent: MetaTalent) => {
    const level = tree.getLevel(talent.id);
    const maxed = level >= talent.maxLevel;
    const cost = tree.nextCost(talent);
    const locked = !tree.prerequisiteMet(talent);
    const canBuy = !maxed && !locked && cost !== null && credits >= cost;
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
                title={credits < (cost ?? 0) ? t("meta.noCredits") : undefined}
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

  const renderDoctrine = (id: string | null) => {
    const doctrine = doctrineById(id);
    const active = doctrineId === (doctrine?.id ?? null);
    return (
      <div
        key={doctrine?.id ?? "none"}
        className={
          "mb-3 flex items-center justify-between gap-3 rounded border p-3 " +
          (active ? "border-[#7dff9e]/60 bg-[#7dff9e]/5" : "border-[#5ef2ff]/20")
        }
      >
        <div>
          <div className="font-display text-sm text-[#eaffff]">
            {doctrine ? t(doctrine.nameKey) : t("meta.doctrineNone")}
          </div>
          <div className="text-xs text-[#6f86a8]">
            {doctrine ? t(doctrine.descKey) : t("meta.doctrineHint")}
          </div>
        </div>
        {active ? (
          <div className="shrink-0 text-xs text-[#7dff9e]">{t("meta.doctrineActive")}</div>
        ) : (
          <GameButton
            onClick={() => selectDoctrine(doctrine?.id ?? null)}
            variant="cyan"
            className="shrink-0 px-3 py-1 text-xs"
          >
            {t("meta.doctrinePick")}
          </GameButton>
        )}
      </div>
    );
  };

  const renderArtifact = (id: string | null) => {
    const artifact = artifactById(id);
    const active = artifactId === (artifact?.id ?? null);
    const unlocked = artifact === null || isArtifactUnlocked(artifact, bestWave);
    return (
      <div
        key={artifact?.id ?? "none"}
        className={
          "mb-3 flex items-center justify-between gap-3 rounded border p-3 " +
          (active
            ? "border-[#c79bff]/60 bg-[#c79bff]/5"
            : unlocked
              ? "border-[#5ef2ff]/20"
              : "border-[#3d4f6d]/20 opacity-60")
        }
      >
        <div>
          <div className="font-display text-sm text-[#eaffff]">
            {artifact ? t(artifact.nameKey) : t("meta.legacyNone")}
          </div>
          <div className="text-xs text-[#6f86a8]">
            {artifact ? t(artifact.descKey) : t("meta.legacyHint")}
          </div>
        </div>
        {active ? (
          <div className="shrink-0 text-xs text-[#7dff9e]">{t("meta.doctrineActive")}</div>
        ) : !unlocked ? (
          <div className="shrink-0 text-right text-[10px] text-[#6f86a8]">
            {t("meta.legacyLocked", { w: String(artifact?.unlockWave ?? 0) })}
          </div>
        ) : (
          <GameButton
            onClick={() => selectArtifact(artifact?.id ?? null)}
            variant="cyan"
            className="shrink-0 px-3 py-1 text-xs"
          >
            {t("meta.doctrinePick")}
          </GameButton>
        )}
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
                {t("meta.credits")}: {credits}
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

            {tab === "doctrines" && (
              <>
                <p className="mb-3 text-xs leading-5 text-[#6f86a8]">
                  {t("meta.doctrineHint")}
                </p>
                {renderDoctrine(null)}
                {DOCTRINES.map((doctrine) => renderDoctrine(doctrine.id))}
              </>
            )}

            {tab === "legacy" && (
              <>
                <p className="mb-3 text-xs leading-5 text-[#6f86a8]">
                  {t("meta.legacyHint")}
                </p>
                {renderArtifact(null)}
                {LEGACY_ARTIFACTS.map((artifact) => renderArtifact(artifact.id))}
              </>
            )}

            {tab === "ascension" && (
              <>
                <p className="mb-3 text-xs leading-5 text-[#6f86a8]">
                  {t("meta.ascensionHint")}
                </p>
                {THREAT_LEVELS.map((def) => {
                  const active = threatLevel === def.level;
                  return (
                    <div
                      key={def.level}
                      className={
                        "mb-2 flex items-center justify-between gap-3 rounded border p-3 " +
                        (active ? "border-[#ff8c42]/60 bg-[#ff8c42]/5" : "border-[#5ef2ff]/20")
                      }
                    >
                      <div>
                        <div className="font-display text-sm text-[#eaffff]">
                          {def.level === 0
                            ? t("meta.ascensionBase")
                            : t("meta.ascensionLevel", { lv: String(def.level) })}
                        </div>
                        <div className="text-xs text-[#6f86a8]">
                          {t("meta.ascensionMods", {
                            h: mult(def.hpMult),
                            d: mult(def.damageMult),
                            c: mult(def.creditsMult),
                          })}
                        </div>
                      </div>
                      {active ? (
                        <div className="shrink-0 text-xs text-[#7dff9e]">
                          {t("meta.doctrineActive")}
                        </div>
                      ) : (
                        <GameButton
                          onClick={() => selectThreat(def.level)}
                          variant="cyan"
                          className="shrink-0 px-3 py-1 text-xs"
                        >
                          {t("meta.doctrinePick")}
                        </GameButton>
                      )}
                    </div>
                  );
                })}
              </>
            )}
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
