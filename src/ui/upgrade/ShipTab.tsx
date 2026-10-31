/**
 * Вкладка «Корабль»: корпус, скорость, слоты оружия и дронов, щит.
 */

import {
  UPGRADE_TIERS,
  UPGRADE_LABEL,
  upgradeCost,
  type PlayerUpgrades,
} from "../../game/upgrades";
import { shieldBlockPercent, shieldRegenPerSecond } from "../../game/balance/player";
import { useT, type TKey } from "../../i18n";
import { Icon } from "../components/Icon";
import {
  SHIP_KEYS,
  STAT_ROW_CLASS,
  getEffectText,
  getUpgradeValue,
} from "./model";

/* ======================== Ship upgrade row ======================== */

interface UpgradeRowProps {
  upgradeKey: "hull" | "speed" | "guns" | "drones";
  upgrades: PlayerUpgrades;
  onPurchase: (key: keyof Omit<PlayerUpgrades, "parts">) => void;
  free: boolean;
}

function UpgradeRow(props: UpgradeRowProps) {
  const t = useT();
  const { upgradeKey, upgrades, onPurchase, free } = props;

  const level = upgrades[upgradeKey];
  const tier = UPGRADE_TIERS[upgradeKey];
  const maxed = level >= tier.maxLevel;
  const cost = upgradeCost(upgradeKey, level);
  const affordable = maxed ? false : free ? true : upgrades.parts >= cost;

  const labelKey: TKey = UPGRADE_LABEL[upgradeKey].label;
  const descKey: TKey = UPGRADE_LABEL[upgradeKey].desc;

  const label = t(labelKey);
  const desc = t(descKey);
  const effectText = getEffectText(upgradeKey, level, tier);

  return (
    <div
      className={`flex items-center justify-between gap-3 rounded border px-4 py-3 transition-colors ${
        maxed
          ? "border-[#5ef2ff]/30 bg-[#5ef2ff]/5"
          : affordable
          ? "border-[#5ef2ff]/40 bg-[#5ef2ff]/8 hover:bg-[#5ef2ff]/12"
          : "border-[#3d4f6d]/30 bg-[#0a1020]/50"
      }`}
    >
      {/* Left: icon + info */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <Icon kind={`upgrade-${upgradeKey}` as const} />
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-bold text-[#eaffff]">{label}</span>
            <span className="font-mono text-[10px] text-[#6f86a8]">
              {maxed ? `/// ${t("common.max")}` : `lv.${level}`}
            </span>
          </div>
          <div className="text-[10px] text-[#6f86a8]">
            {desc} · <span className="text-[#5ef2ff]">{effectText}</span>
          </div>
        </div>
      </div>

      {/* Right: buy button or maxed */}
      {maxed ? (
        <div className="font-mono text-[10px] tracking-[0.2em] text-[#5ef2ff]">
          {t("common.max")}
        </div>
      ) : (
        <button
          onClick={() => onPurchase(upgradeKey)}
          disabled={!affordable}
          className={`clip-btn px-4 py-2 text-xs font-mono tracking-[0.15em] transition-all ${
            affordable
              ? "cursor-pointer border border-[#5ef2ff]/50 bg-[#5ef2ff]/15 text-[#eaffff] hover:bg-[#5ef2ff]/25"
              : "cursor-not-allowed border border-[#3d4f6d]/30 bg-[#0a1020]/50 text-[#3d4f6d]"
          }`}
        >
          ⚙ {cost}
        </button>
      )}
    </div>
  );
}

/* ======================== Shield group ======================== */

/**
 * Группа «Щит»: сперва покупка самого щита с базовыми параметрами,
 * затем — его линии «процент» и «восстановление».
 */
function ShieldGroup(props: {
  upgrades: PlayerUpgrades;
  free: boolean;
  onPurchase: (key: keyof Omit<PlayerUpgrades, "parts">) => void;
}) {
  const t = useT();
  const { upgrades, free, onPurchase } = props;
  const owned = upgrades.shield > 0;
  const buyCost = upgradeCost("shield", upgrades.shield);
  const canBuy = !owned && (free || upgrades.parts >= buyCost);

  return (
    <div
      className={`rounded border px-4 py-3 ${
        owned
          ? "border-[#66e0ff]/40 bg-[#66e0ff]/5"
          : "border-[#3d4f6d]/40 bg-[#0a1020]/60"
      }`}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3">
          <Icon kind="upgrade-shield" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-[13px] font-bold text-[#eaffff]">
                {t("upgrade.shield")}
              </span>
              {owned ? (
                <span className="font-mono text-[9px] tracking-[0.15em] text-[#66e0ff]">
                  {t("upgrade.shieldOwned")}
                </span>
              ) : null}
            </div>
            <div className="text-[10px] text-[#6f86a8]">
              {owned
                ? t("upgrade.shieldDesc")
                : t("upgrade.shieldBuyDesc", {
                    p: Math.round(shieldBlockPercent(0) * 100),
                    r: shieldRegenPerSecond(0).toFixed(1),
                  })}
            </div>
          </div>
        </div>
        {!owned && (
          <button
            onClick={() => onPurchase("shield")}
            disabled={!canBuy}
            className={`clip-btn px-4 py-2 text-xs font-mono tracking-[0.15em] transition-all ${
              canBuy
                ? "cursor-pointer border border-[#66e0ff]/60 bg-[#66e0ff]/15 " +
                  "text-[#eaffff] hover:bg-[#66e0ff]/25"
                : "cursor-not-allowed border border-[#3d4f6d]/30 " +
                  "bg-[#0a1020]/50 text-[#3d4f6d]"
            }`}
          >
            ⚙ {buyCost}
          </button>
        )}
      </div>

      {owned && (
        <div className="mt-3 flex flex-col gap-1.5">
          {(["shieldPercent", "shieldRegen"] as const).map((key) => {
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
                    className={`clip-btn px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] ` +
                      `transition-all ${
                      affordable
                        ? "cursor-pointer border border-[#5ef2ff]/50 " +
                          "bg-[#5ef2ff]/15 text-[#eaffff] hover:bg-[#5ef2ff]/25"
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
      )}
    </div>
  );
}

export function ShipTab(props: {
  upgrades: PlayerUpgrades;
  free: boolean;
  onPurchase: (key: keyof Omit<PlayerUpgrades, "parts">) => void;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
      {SHIP_KEYS.map((upgradeKey) => (
        <UpgradeRow
          key={upgradeKey}
          free={props.free}
          upgradeKey={upgradeKey}
          upgrades={props.upgrades}
          onPurchase={props.onPurchase}
        />
      ))}
      <ShieldGroup
        upgrades={props.upgrades}
        free={props.free}
        onPurchase={props.onPurchase}
      />
    </div>
  );
}
