import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n";
import { createLocalStoragePort } from "../../game/core/PersistencePort";
import { META_TALENTS } from "../../game/meta/metaTalents";
import { MetaTree } from "../../game/meta/MetaTree";
import { loadCredits, saveCredits } from "../../game/meta/MetaStorage";
import type { MetaTalent } from "../../game/meta/types";
import GameButton from "../components/GameButton";

/**
 * MetaScreen — Зеркало Ночи: постоянные таланты за кредиты.
 *
 * Кредиты начисляются по итогам забега; прокачка забега сбрасывается,
 * а таланты остаются навсегда. Покупка сохраняется сразу.
 */
export default function MetaScreen(props: { onBack: () => void }) {
  const t = useT();
  const storage = useMemo(() => createLocalStoragePort(), []);
  const [tree, setTree] = useState(() => MetaTree.load(storage));
  const [credits, setCredits] = useState(0);

  const refresh = useCallback(() => {
    setTree(MetaTree.load(storage));
    setCredits(loadCredits(storage));
  }, [storage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

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
                variant={canBuy ? "cyan" : "default"}
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
      <div className="flex max-h-[92vh] w-[min(520px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col">
          {/* Заголовок и кредиты не скроллятся: они всегда видны. */}
          <div className="flex items-center justify-between gap-3 border-b border-[#5ef2ff]/15 px-5 py-4 sm:px-7">
            <div className="hud-label">{t("meta.title")}</div>
            <div className="text-sm text-[#ffb84d]">{t("meta.credits")}: {credits}</div>
          </div>

          {/* Дерево талантов — единственная прокручиваемая часть экрана. */}
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 sm:px-7">
            <div className="mb-4">
              <div className="mb-2 text-xs tracking-[0.2em] text-[#ff5c54]">{t("meta.branchRed")}</div>
              {red.map(renderTalent)}
            </div>
            <div>
              <div className="mb-2 text-xs tracking-[0.2em] text-[#5ef2ff]">{t("meta.branchGreen")}</div>
              {green.map(renderTalent)}
            </div>
          </div>

          <div className="border-t border-[#5ef2ff]/15 px-5 py-3 sm:px-7">
            <GameButton onClick={props.onBack} variant="amber" className="w-full px-6 py-2">
              {t("meta.back")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
