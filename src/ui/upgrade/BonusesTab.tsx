/**
 * Вкладка «Бонусы»: темп огня и восстановление здоровья.
 */

import {
  UPGRADE_TIERS,
  UPGRADE_LABEL,
  upgradeCost,
  type PlayerUpgrades,
} from "../../game/upgrades";
import { useT, type TKey } from "../../i18n";
import { Icon } from "../components/Icon";
import { STAT_ROW_CLASS, getUpgradeValue } from "./model";

/** Группа бонуса: несколько прокачиваемых параметров под общим заголовком. */
function BonusGroup(props: {
  keys: readonly (keyof Omit<PlayerUpgrades, "parts">)[];
  icon: "upgrade-fireRate" | "upgrade-heal";
  titleKey: TKey;
  descKey: TKey;
  accentClass: string;
  upgrades: PlayerUpgrades;
  free: boolean;
  onPurchase: (key: keyof Omit<PlayerUpgrades, "parts">) => void;
}) {
  const t = useT();
  const { keys, upgrades, free, onPurchase } = props;

  return (
    <div className={`rounded border px-4 py-3 ${props.accentClass}`}>
      <div className="flex items-center gap-3">
        <Icon kind={props.icon} />
        <div className="min-w-0">
          <div className="text-[13px] font-bold text-[#eaffff]">{t(props.titleKey)}</div>
          <div className="text-[10px] text-[#6f86a8]">{t(props.descKey)}</div>
        </div>
      </div>
      <div className="mt-3 flex flex-col gap-1.5">
        {keys.map((key) => {
          const level = upgrades[key];
          const tier = UPGRADE_TIERS[key];
          const maxed = level >= tier.maxLevel;
          const cost = upgradeCost(key, level);
          const affordable = maxed ? false : free || upgrades.parts >= cost;
          return (
            <div key={key} className={STAT_ROW_CLASS}>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="text-[11px] font-bold text-[#eaffff]">
                    {t(UPGRADE_LABEL[key].label)}
                  </span>
                  <span className="font-mono text-[9px] text-[#6f86a8]">
                    {maxed ? `/// ${t("common.max")}` : `lv.${level}`}
                  </span>
                </div>
                <div className="text-[9px] text-[#6f86a8]">
                  {t(UPGRADE_LABEL[key].desc)} ·{" "}
                  <span className="text-[#5ef2ff]">
                    {getUpgradeValue(key, level)}
                  </span>
                </div>
              </div>
              {maxed ? (
                <div className="font-mono text-[9px] tracking-[0.2em] text-[#5ef2ff]">
                  {t("common.max")}
                </div>
              ) : (
                <button
                  onClick={() => onPurchase(key)}
                  disabled={!affordable}
                  className={`clip-btn px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] transition-all ${
                    affordable
                      ? "cursor-pointer border border-[#5ef2ff]/50 bg-[#5ef2ff]/15 " +
                        "text-[#eaffff] hover:bg-[#5ef2ff]/25"
                      : "cursor-not-allowed border border-[#3d4f6d]/30 " +
                        "bg-[#0a1020]/50 text-[#3d4f6d]"
                  }`}
                >
                  ⚙ {cost}
                </button>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function BonusesTab(props: {
  upgrades: PlayerUpgrades;
  free: boolean;
  onPurchase: (key: keyof Omit<PlayerUpgrades, "parts">) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
      <BonusGroup
        keys={["fireRate", "rateDuration"]}
        icon="upgrade-fireRate"
        titleKey="upgrade.rateGroup"
        descKey="upgrade.rateGroupDesc"
        accentClass="border-[#ff8c42]/40 bg-[#ff8c42]/5"
        upgrades={props.upgrades}
        free={props.free}
        onPurchase={props.onPurchase}
      />
      <BonusGroup
        keys={["healDuration", "healRate"]}
        icon="upgrade-heal"
        titleKey="upgrade.healGroup"
        descKey="upgrade.healGroupDesc"
        accentClass="border-[#7dffb8]/40 bg-[#7dffb8]/5"
        upgrades={props.upgrades}
        free={props.free}
        onPurchase={props.onPurchase}
      />
    </div>
  );
}
