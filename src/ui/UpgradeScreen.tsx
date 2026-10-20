import { useEffect, useState } from "react";
import type { Game } from "../game/game";
import {
  purchaseUpgrade,
  UPGRADE_TIERS,
  upgradeCost,
  type PlayerUpgrades
} from "../game/upgrades";
import { useT } from "../i18n";
import { Icon } from "./components/Icon";

/* ======================== UpgradeRow ======================== */

interface UpgradeRowProps {
  upgradeKey: keyof Omit<PlayerUpgrades, "parts">;
  upgrades: PlayerUpgrades;
  onPurchase: (key: keyof Omit<PlayerUpgrades, "parts">) => void;
  game: Game | null;
  detailsOn: boolean;
}

function UpgradeRow(props: UpgradeRowProps) {
  const t = useT();
  const { upgradeKey, upgrades, onPurchase, game, detailsOn } = props;
  
  const level = upgrades[upgradeKey];
  const tier = UPGRADE_TIERS[upgradeKey];
  const maxed = level >= tier.maxLevel;
  const cost = upgradeCost(upgradeKey, level);
  const affordable = maxed ? false : detailsOn ? true : upgrades.parts >= cost;
  
  const labelKey = `upgrade.${upgradeKey}` as string;
  const descKey = `upgrade.${upgradeKey}Desc` as string;
  
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
              {maxed ? "/// MAX" : `lv.${level}`}
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
          MAX
        </div>
      ) : (
        <button
          onClick={() => {
            onPurchase(upgradeKey);
            game?.refreshUpgrades();
          }}
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

function getEffectText(key: keyof Omit<PlayerUpgrades, "parts">, level: number, tier: { baseCost: number; costStep: number; maxLevel: number }): string {
  const maxLevel = tier.maxLevel;
  const currentValue = getUpgradeValue(key, level);
  const maxValue = getUpgradeValue(key, maxLevel);
  return `${currentValue} / ${maxValue}`;
}

function getUpgradeValue(key: keyof Omit<PlayerUpgrades, "parts">, level: number): string {
  switch (key) {
    case "hull": return `${100 + level * 20} HP`;
    case "damage": return `${14 + level * 2} DMG`;
    case "fireRate": return `${(100 + level * 8).toFixed(0)}%`;
    case "speed": return `${(100 + level * 5).toFixed(0)}%`;
    case "guns": return `${1 + level} / ${5}`;
    case "drones": return `${level} / ${8}`;
    case "dashCooldown": return `${(100 - level * 10).toFixed(0)}%`;
    default: return `${level}`;
  }
}

/* ======================== UpgradeScreen ======================== */

export function UpgradeScreen(props: {
  game: Game | null;
  detailsOn: boolean;
  from: "menu" | "gameover";
  onBack: () => void;
}) {
  const t = useT();
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>({
    parts: 0, hull: 0, damage: 0, fireRate: 0, speed: 0, guns: 0, drones: 0, dashCooldown: 0,
  });

  // store an immutable snapshot so React re-renders after purchases
  const copyUpgrades = (source: PlayerUpgrades): PlayerUpgrades => ({ ...source });

  // Load fresh upgrades on mount (snapshot)
  useEffect(() => {
    if (!props.game) return;
    setUpgrades(copyUpgrades(props.game.getPlayerUpgrades()));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount
  
  const handlePurchase = (key: keyof Omit<PlayerUpgrades, "parts">) => {
    if (!props.game) {
      console.warn('[UpgradeScreen] game is null');
      return;
    }
    const success = props.detailsOn
      ? props.game.purchaseUpgradeNoCost(key)
      : (() => {
          const ups = props.game.getPlayerUpgrades();
          // snapshot for the check — never mutate the live object
          const maxed = ups[key] >= UPGRADE_TIERS[key].maxLevel;
          if (maxed) {
            console.warn(`[UpgradeScreen] ${key} is maxed`);
            return false;
          }
          return purchaseUpgrade(ups, key);
        })();
    if (success) {
      setUpgrades(copyUpgrades(props.game.getPlayerUpgrades()));
    }
  };
  
  const upgradeKeys = Object.keys(UPGRADE_TIERS) as Array<keyof Omit<PlayerUpgrades, "parts">>;
  
  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("upgrade.title")}
    >
      <div className="anim-fade-up w-[min(520px,96vw)] max-h-[90vh]">
        <div className="hud-panel p-5 sm:p-7">
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="hud-label mb-2">{t("upgrade.title")}</div>
            <div className="flex items-center justify-center gap-2 text-[12px] text-[#ffb84d]" aria-label={`Parts: ${upgrades.parts ?? 0}`}>
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#ffb84d" strokeWidth="1.5">
                <polygon points="7,1 9,5 13,5 10,8 11,13 7,10 3,13 4,8 1,5 5,5" />
              </svg>
              <span className="font-mono font-bold tracking-[0.15em]">⚙ {upgrades.parts}</span>
              <span className="text-[10px] text-[#6f86a8]">{t("upgrade.partsLabel")}</span>
            </div>
          </div>
          
          {/* Upgrade list */}
          <div className="flex flex-col gap-2 overflow-y-auto pr-1" style={{ maxHeight: "calc(90vh - 220px)" }}>
            {upgradeKeys.map((upgradeKey) => (
              <UpgradeRow
                key={upgradeKey}
                game={props.game}
                detailsOn={props.detailsOn}
                upgradeKey={upgradeKey}
                upgrades={upgrades}
                onPurchase={handlePurchase}
              />
            ))}
          </div>
          
          {/* Footer */}
          <div className="mt-5 border-t border-[#5ef2ff]/15 pt-4 text-center">
            <button
              onClick={props.onBack}
              className="clip-btn px-8 py-3 text-sm transition-colors hover:bg-[#5ef2ff]/10"
            >
              {t("upgrade.back")}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}