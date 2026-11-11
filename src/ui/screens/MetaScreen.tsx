import { useCallback, useEffect, useMemo, useState } from "react";
import { useT } from "../../i18n";
import { createLocalStoragePort } from "../../game/core/PersistencePort";
import { META_TALENTS } from "../../game/meta/metaTalents";
import { loadMetaTree, saveMetaTree, loadCredits, saveCredits } from "../../game/meta/MetaStorage";
import type { MetaTreeState } from "../../game/meta/types";
import GameButton from "../components/GameButton";

export default function MetaScreen(props: { onBack: () => void }) {
  const t = useT();
  const storage = useMemo(() => createLocalStoragePort(), []);
  const [credits, setCredits] = useState(0);
  const [state, setState] = useState<MetaTreeState>({ talents: {}, credits: 0 });

  const refresh = useCallback(() => {
    const c = loadCredits(storage);
    const s = loadMetaTree(storage);
    s.credits = c;
    setCredits(c);
    setState(s);
  }, [storage]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleBuy = useCallback((id: string) => {
    const talent = META_TALENTS.find((x) => x.id === id);
    if (!talent) return;
    const level = state.talents[id] ?? 0;
    if (level >= talent.maxLevel) return;
    const cost = talent.costs[level] ?? 0;
    if (credits < cost) return;
    const newState: MetaTreeState = {
      talents: { ...state.talents, [id]: level + 1 },
      credits: credits - cost,
    };
    saveMetaTree(storage, newState);
    saveCredits(storage, newState.credits);
    setCredits(newState.credits);
    setState(newState);
  }, [state, credits, storage]);

  const red = META_TALENTS.filter((x) => x.branch === "red");
  const green = META_TALENTS.filter((x) => x.branch === "green");

  const renderTalent = (talent: (typeof META_TALENTS)[number]) => {
    const level = state.talents[talent.id] ?? 0;
    const maxed = level >= talent.maxLevel;
    const cost = maxed ? 0 : (talent.costs[level] ?? 0);
    const canBuy = !maxed && credits >= cost;
    return (
      <div key={talent.id} className="mb-3 rounded border border-[#5ef2ff]/20 p-3">
        <div className="flex items-center justify-between">
          <div>
            <div className="font-display text-sm text-[#eaffff]">{t(talent.nameKey as any)}</div>
            <div className="text-xs text-[#6f86a8]">{t(talent.descKey as any)}</div>
          </div>
          <div className="text-right">
            <div className="text-xs text-[#ffb84d]">Lv {level}/{talent.maxLevel}</div>
            {maxed ? (
              <div className="text-xs text-[#7dff9e]">{t("meta.maxLevel")}</div>
            ) : (
              <GameButton
                onClick={() => handleBuy(talent.id)}
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
    <div className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4">
      <div className="hud-panel w-[min(520px,96vw)] p-5 sm:p-7">
        <div className="mb-4 text-center">
          <div className="hud-label mb-1">{t("meta.title")}</div>
          <div className="text-sm text-[#ffb84d]">{t("meta.credits")}: {credits}</div>
        </div>
        <div className="mb-4">
          <div className="mb-2 text-xs tracking-[0.2em] text-[#ff5c54]">{t("meta.branchRed")}</div>
          {red.map(renderTalent)}
        </div>
        <div className="mb-4">
          <div className="mb-2 text-xs tracking-[0.2em] text-[#5ef2ff]">{t("meta.branchGreen")}</div>
          {green.map(renderTalent)}
        </div>
        <div className="text-center">
          <GameButton onClick={props.onBack} variant="amber" className="px-6 py-2">
            {t("meta.back")}
          </GameButton>
        </div>
      </div>
    </div>
  );
}
