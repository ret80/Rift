import { useEffect, useState } from "react";
import type { Game } from "../game/game";
import {
  UPGRADE_TIERS,
  UPGRADE_LABEL,
  upgradeCost,
  weaponCost,
  weaponUpgradeCost,
  weaponReloadMult,
  weaponDamageMult,
  WEAPON_ACCURACY_PER_LEVEL,
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type WeaponStatKey,
} from "../game/upgrades";
import { shieldBlockPercent, shieldRegenPerSecond } from "../game/balance/player";
import type { WeaponId, WeaponLoadout } from "../game/weapons/Weapon";
import {
  DRONE_CATALOG,
  DRONE_STAT_MAX_LEVEL,
  droneCost,
  droneDamageMult,
  droneReloadMult,
  droneUpgradeCost,
  type DroneId,
  type DroneLoadout,
  type DroneStatKey,
} from "../game/drones/Drone";
import { useT, type TKey } from "../i18n";
import { Icon } from "./components/Icon";

/* ======================== Ship upgrades ======================== */

interface UpgradeRowProps {
  upgradeKey: keyof Omit<PlayerUpgrades, "parts">;
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

function getEffectText(
  key: keyof Omit<PlayerUpgrades, "parts">,
  level: number,
  tier: { baseCost: number; costStep: number; maxLevel: number }
): string {
  const maxLevel = tier.maxLevel;
  const currentValue = getUpgradeValue(key, level);
  const maxValue = getUpgradeValue(key, maxLevel);
  return `${currentValue} / ${maxValue}`;
}

function getUpgradeValue(key: keyof Omit<PlayerUpgrades, "parts">, level: number): string {
  switch (key) {
    case "hull": return `${100 + level * 20} HP`;
    case "speed": return `${(100 + level * 5).toFixed(0)}%`;
    case "guns": return `${1 + level}`;
    case "drones": return `${1 + level}`;
    case "shield": return level > 0 ? "ON" : "OFF";
    case "shieldPercent": return `${Math.round(shieldBlockPercent(level) * 100)}%`;
    case "shieldRegen": return `${shieldRegenPerSecond(level).toFixed(1)}/с`;
    default: return `${level}`;
  }
}

/* ======================== Shield group ======================== */

/** Оформление строки линии прокачки (общий стиль для оружия, дронов и щита). */
const STAT_ROW_CLASS =
  "flex items-center justify-between gap-3 rounded border " +
  "border-[#3d4f6d]/25 bg-[#04070d]/40 px-3 py-2";

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
                      {maxed ? "/// MAX" : `lv.${level}`}
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
                    MAX
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

/* ======================== Armory (weapons) ======================== */

/** Строки линий оружия. */
const WEAPON_STATS: Array<{ stat: WeaponStatKey; valueKey: TKey; descKey: TKey }> = [
  { stat: "reload", valueKey: "upgrade.weapon.reload", descKey: "upgrade.weapon.reloadDesc" },
  { stat: "damage", valueKey: "upgrade.weapon.damage", descKey: "upgrade.weapon.damageDesc" },
  { stat: "accuracy", valueKey: "upgrade.weapon.accuracy", descKey: "upgrade.weapon.accuracyDesc" },
];

/** Виды оружия, доступные в арсенале. */
const ARMORY_WEAPONS: Array<{
  id: WeaponId;
  icon: "weapon-cannon" | "weapon-missile" | "weapon-laser";
  color: string;
  titleKey: TKey;
  descKey: TKey;
  stats?: Array<{ stat: WeaponStatKey; valueKey: TKey; descKey: TKey }>;
}> = [
  {
    id: "cannon",
    icon: "weapon-cannon",
    color: "#5ef2ff",
    titleKey: "upgrade.weapon.cannon",
    descKey: "upgrade.weapon.cannonDesc",
  },
  {
    id: "missile",
    icon: "weapon-missile",
    color: "#9dffe8",
    titleKey: "upgrade.weapon.missile",
    descKey: "upgrade.weapon.missileDesc",
    // У ракетницы нет линии точности: наведение самонаводящееся.
    stats: WEAPON_STATS.filter((row) => row.stat !== "accuracy"),
  },
  {
    id: "laser",
    icon: "weapon-laser",
    color: "#ff4d6d",
    titleKey: "upgrade.weapon.laser",
    descKey: "upgrade.weapon.laserDesc",
  },
];

/** Оформление строки линии оружия. */
const WEAPON_STAT_ROW_CLASS =
  "flex items-center justify-between gap-3 rounded border " +
  "border-[#3d4f6d]/25 bg-[#04070d]/40 px-3 py-2";

function statValue(stat: WeaponStatKey, model: WeaponLoadout[WeaponId]["model"]): string {
  if (stat === "reload") {
    return `${Math.round(weaponReloadMult(model) * 100)}%`;
  }
  if (stat === "damage") {
    return `+${Math.round((weaponDamageMult(model) - 1) * 100)}%`;
  }
  const level = Math.max(0, Math.min(WEAPON_STAT_MAX_LEVEL, model.accuracy));
  return `+${Math.round(level * WEAPON_ACCURACY_PER_LEVEL * 100)}%`;
}

/** Текущее значение линии дрона в процентах. */
function droneStatValue(stat: DroneStatKey, model: DroneLoadout["entries"][DroneId]["model"]): string {
  if (stat === "reload") {
    return `${Math.round(droneReloadMult(model) * 100)}%`;
  }
  return `+${Math.round((droneDamageMult(model) - 1) * 100)}%`;
}

function copyLoadout(source: WeaponLoadout): WeaponLoadout {
  const out = {} as WeaponLoadout;
  for (const id of Object.keys(source) as WeaponId[]) {
    const entry = source[id];
    out[id] = { owned: entry.owned, model: { ...entry.model } };
  }
  return out;
}

function copyDroneLoadout(source: DroneLoadout): DroneLoadout {
  const entries = {} as DroneLoadout["entries"];
  for (const id of Object.keys(source.entries) as DroneId[]) {
    const entry = source.entries[id];
    entries[id] = { count: entry.count, model: { ...entry.model } };
  }
  return { entries };
}

export function UpgradeScreen(props: {
  game: Game | null;
  detailsOn: boolean;
  from: "menu" | "gameover";
  onBack: () => void;
}) {
  const t = useT();
  const free = props.detailsOn;
  const [tab, setTab] = useState<"ship" | "armory" | "drones">("ship");
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>({
    parts: 0, hull: 0, speed: 0, guns: 0, drones: 0,
    shield: 0, shieldPercent: 0, shieldRegen: 0,
  });
  const [loadout, setLoadout] = useState<WeaponLoadout | null>(null);
  const [droneLoadout, setDroneLoadout] = useState<DroneLoadout | null>(null);
  const [weaponSlots, setWeaponSlots] = useState(1);
  const [usedWeaponSlots, setUsedWeaponSlots] = useState(1);
  const [droneSlots, setDroneSlots] = useState(1);
  const [usedDroneSlots, setUsedDroneSlots] = useState(1);

  // store an immutable snapshot so React re-renders after purchases
  const refresh = () => {
    if (!props.game) return;
    setUpgrades({ ...props.game.getPlayerUpgrades() });
    setLoadout(copyLoadout(props.game.getWeaponLoadout()));
    setDroneLoadout(copyDroneLoadout(props.game.getDroneLoadout()));
    setWeaponSlots(props.game.getWeaponSlots());
    setUsedWeaponSlots(props.game.getUsedWeaponSlots());
    setDroneSlots(props.game.getDroneSlots());
    setUsedDroneSlots(props.game.getUsedDroneSlots());
  };

  // Load fresh state on mount (snapshot)
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // run once on mount

  const handlePurchase = (key: keyof Omit<PlayerUpgrades, "parts">) => {
    if (!props.game) {
      console.warn('[UpgradeScreen] game is null');
      return;
    }
    const success = free
      ? props.game.purchaseUpgradeNoCost(key)
      : props.game.purchaseUpgradeCosted(key);
    if (success) {
      refresh();
    }
  };

  const handleBuyWeapon = (id: WeaponId) => {
    if (!props.game) return;
    const success = free
      ? props.game.purchaseWeaponNoCost(id)
      : props.game.purchaseWeapon(id);
    if (success) refresh();
  };

  const handleBuyStat = (id: WeaponId, stat: WeaponStatKey) => {
    if (!props.game) return;
    const success = free
      ? props.game.upgradeWeaponStatNoCost(id, stat)
      : props.game.upgradeWeaponStat(id, stat);
    if (success) refresh();
  };

  const handleBuyDrone = (id: DroneId) => {
    if (!props.game) return;
    const success = free
      ? props.game.purchaseDroneNoCost(id)
      : props.game.purchaseDrone(id);
    if (success) refresh();
  };

  const handleBuyDroneStat = (id: DroneId, stat: DroneStatKey) => {
    if (!props.game) return;
    const success = free
      ? props.game.upgradeDroneStatNoCost(id, stat)
      : props.game.upgradeDroneStat(id, stat);
    if (success) refresh();
  };

  /** Линии, которые рисуются отдельно внутри группы «Щит». */
  const SHIELD_KEYS: Array<keyof Omit<PlayerUpgrades, "parts">> = [
    "shield", "shieldPercent", "shieldRegen",
  ];
  const upgradeKeys = (Object.keys(UPGRADE_TIERS) as Array<keyof Omit<PlayerUpgrades, "parts">>)
    .filter((key) => !SHIELD_KEYS.includes(key));

  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("upgrade.title")}
    >
      <div className="anim-fade-up w-[min(620px,96vw)] max-h-[90vh]">
        <div className="hud-panel p-5 sm:p-7">
          {/* Header */}
          <div className="mb-5 text-center">
            <div className="hud-label mb-2">{t("upgrade.title")}</div>
            <div
              className="flex items-center justify-center gap-2 text-[12px] text-[#ffb84d]"
              aria-label={`Parts: ${upgrades.parts ?? 0}`}
            >
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="#ffb84d" strokeWidth="1.5">
                <polygon points="7,1 9,5 13,5 10,8 11,13 7,10 3,13 4,8 1,5 5,5" />
              </svg>
              <span className="font-mono font-bold tracking-[0.15em]">⚙ {upgrades.parts}</span>
              <span className="text-[10px] text-[#6f86a8]">{t("upgrade.partsLabel")}</span>
            </div>
          </div>

          {/* Tabs */}
          <div className="mb-4 flex justify-center gap-2">
            <button
              onClick={() => setTab("ship")}
              className={`clip-btn px-5 py-2 text-xs font-mono tracking-[0.2em] transition-all ${
                tab === "ship"
                  ? "border border-[#5ef2ff]/60 bg-[#5ef2ff]/20 text-[#eaffff]"
                  : "border border-[#3d4f6d]/30 bg-[#0a1020]/50 text-[#6f86a8] hover:text-[#eaffff]"
              }`}
            >
              {t("upgrade.tabShip")}
            </button>
            <button
              onClick={() => setTab("armory")}
              className={`clip-btn px-5 py-2 text-xs font-mono tracking-[0.2em] transition-all ${
                tab === "armory"
                  ? "border border-[#5ef2ff]/60 bg-[#5ef2ff]/20 text-[#eaffff]"
                  : "border border-[#3d4f6d]/30 bg-[#0a1020]/50 text-[#6f86a8] hover:text-[#eaffff]"
              }`}
            >
              {t("upgrade.tabArmory")}
            </button>
            <button
              onClick={() => setTab("drones")}
              className={`clip-btn px-5 py-2 text-xs font-mono tracking-[0.2em] transition-all ${
                tab === "drones"
                  ? "border border-[#ff9de0]/60 bg-[#ff9de0]/20 text-[#eaffff]"
                  : "border border-[#3d4f6d]/30 bg-[#0a1020]/50 text-[#6f86a8] hover:text-[#eaffff]"
              }`}
            >
              {t("upgrade.tabDrones")}
            </button>
          </div>

          {tab === "ship" ? (
            /* Upgrade list */
            <div
              className="flex flex-col gap-2 overflow-y-auto pr-1"
              style={{ maxHeight: "calc(90vh - 260px)" }}
            >
              {upgradeKeys.map((upgradeKey) => (
                <UpgradeRow
                  key={upgradeKey}
                  free={free}
                  upgradeKey={upgradeKey}
                  upgrades={upgrades}
                  onPurchase={handlePurchase}
                />
              ))}
              <ShieldGroup
                upgrades={upgrades}
                free={free}
                onPurchase={handlePurchase}
              />
            </div>
          ) : tab === "armory" ? (
            <div>
              <div
                className="mb-2 flex items-center justify-center gap-2 text-[11px] tracking-[0.2em] text-[#6f86a8]"
                aria-label={`Weapon slots: ${usedWeaponSlots} of ${weaponSlots}`}
              >
                <span className="font-mono font-bold text-[#5ef2ff]">
                  {usedWeaponSlots}/{weaponSlots}
                </span>
                <span>{t("upgrade.weapon.slots")}</span>
              </div>
              <div
                className="flex flex-col gap-2 overflow-y-auto pr-1"
                style={{ maxHeight: "calc(90vh - 300px)" }}
              >
              {ARMORY_WEAPONS.map((weapon) => {
                const entry = loadout?.[weapon.id];
                const owned = entry?.owned ?? false;
                const noFreeSlots = usedWeaponSlots >= weaponSlots;
                return (
                  <div
                    key={weapon.id}
                    className={`rounded border px-4 py-3 ${
                      owned
                        ? "border-[#ffb84d]/40 bg-[#ffb84d]/5"
                        : "border-[#3d4f6d]/40 bg-[#0a1020]/60"
                    }`}
                  >
                    {/* Weapon header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon kind={weapon.icon} color={weapon.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-[#eaffff]">
                              {t(weapon.titleKey)}
                            </span>
                            {owned ? (
                              weapon.id === "cannon" ? (
                                <span className="font-mono text-[9px] tracking-[0.15em] text-[#5ef2ff]">
                                  {t("upgrade.weapon.start")}
                                </span>
                              ) : (
                                <span className="font-mono text-[9px] tracking-[0.15em] text-[#ffb84d]">
                                  {t("upgrade.weapon.owned")}
                                </span>
                              )
                            ) : null}
                          </div>
                          <div className="text-[10px] text-[#6f86a8]">{t(weapon.descKey)}</div>
                        </div>
                      </div>
                      {!owned && (
                        <button
                          onClick={() => handleBuyWeapon(weapon.id)}
                          disabled={noFreeSlots || (!free && upgrades.parts < weaponCost(weapon.id))}
                          title={noFreeSlots ? t("upgrade.weapon.noSlots") : undefined}
                          className={`clip-btn px-4 py-2 text-xs font-mono tracking-[0.15em] transition-all ${
                            !noFreeSlots && (free || upgrades.parts >= weaponCost(weapon.id))
                              ? "cursor-pointer border border-[#ffb84d]/60 bg-[#ffb84d]/15 " +
                                "text-[#eaffff] hover:bg-[#ffb84d]/25"
                              : "cursor-not-allowed border border-[#3d4f6d]/30 " +
                                "bg-[#0a1020]/50 text-[#3d4f6d]"
                          }`}
                        >
                          ⚙ {weaponCost(weapon.id)}
                        </button>
                      )}
                    </div>

                    {/* Stat rows */}
                    {owned && (
                      <div className="mt-3 flex flex-col gap-1.5">
                        {(weapon.stats ?? WEAPON_STATS).map((row) => {
                          const level = entry!.model[row.stat];
                          const maxed = level >= WEAPON_STAT_MAX_LEVEL;
                          const cost = weaponUpgradeCost(level);
                          const affordable = maxed ? false : upgrades.parts >= cost;
                          return (
                            <div
                              key={row.stat}
                              className={WEAPON_STAT_ROW_CLASS}
                            >
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-[#eaffff]">
                                    {t(row.valueKey)}
                                  </span>
                                  <span className="font-mono text-[9px] text-[#6f86a8]">
                                    {maxed ? "/// MAX" : `lv.${level}`}
                                  </span>
                                </div>
                                <div className="text-[9px] text-[#6f86a8]">
                                  {t(row.descKey)} ·{" "}
                                  <span className="text-[#5ef2ff]">
                                    {statValue(row.stat, entry!.model)}
                                  </span>
                                </div>
                              </div>
                              {maxed ? (
                                <div className="font-mono text-[9px] tracking-[0.2em] text-[#5ef2ff]">
                                  MAX
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleBuyStat(weapon.id, row.stat)}
                                  disabled={!free && !affordable}
                                  className={`clip-btn px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] ` +
                                    `transition-all ${
                                    free || affordable
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
              })}
              </div>
            </div>
          ) : (
            /* Drone hangar list */
            <div>
              <div
                className="mb-2 flex items-center justify-center gap-2 text-[11px] tracking-[0.2em] text-[#6f86a8]"
                aria-label={`Drone slots: ${usedDroneSlots} of ${droneSlots}`}
              >
                <span className="font-mono font-bold text-[#ff9de0]">
                  {usedDroneSlots}/{droneSlots}
                </span>
                <span>{t("upgrade.drone.slots")}</span>
              </div>
              <div
                className="flex flex-col gap-2 overflow-y-auto pr-1"
                style={{ maxHeight: "calc(90vh - 300px)" }}
              >
              {DRONE_CATALOG.map((drone) => {
                const entry = droneLoadout?.entries[drone.id];
                const count = entry?.count ?? 0;
                const hasUnit = count > 0;
                const noFreeSlots = usedDroneSlots >= droneSlots;
                return (
                  <div
                    key={drone.id}
                    className={`rounded border px-4 py-3 transition-colors ${
                      hasUnit
                        ? "border-[#ff9de0]/40 bg-[#ff9de0]/5"
                        : "border-[#3d4f6d]/40 bg-[#0a1020]/60"
                    }`}
                  >
                    {/* Drone header */}
                    <div className="flex items-center justify-between gap-3">
                      <div className="flex min-w-0 items-center gap-3">
                        <Icon kind={drone.icon} color={drone.color} />
                        <div className="min-w-0">
                          <div className="flex items-center gap-2">
                            <span className="text-[13px] font-bold text-[#eaffff]">
                              {t(drone.nameKey)}
                            </span>
                            {hasUnit ? (
                              <span className="font-mono text-[9px] tracking-[0.15em] text-[#ff9de0]">
                                ×{count}
                              </span>
                            ) : null}
                          </div>
                          <div className="text-[10px] text-[#6f86a8]">{t(drone.descKey)}</div>
                        </div>
                      </div>
                      <button
                        onClick={() => handleBuyDrone(drone.id)}
                        disabled={noFreeSlots || (!free && upgrades.parts < droneCost(drone.id))}
                        title={noFreeSlots ? t("upgrade.drone.noSlots") : undefined}
                        className={`clip-btn px-4 py-2 text-xs font-mono tracking-[0.15em] transition-all ${
                          !noFreeSlots && (free || upgrades.parts >= droneCost(drone.id))
                            ? "cursor-pointer border border-[#ff9de0]/60 bg-[#ff9de0]/15 " +
                              "text-[#eaffff] hover:bg-[#ff9de0]/25"
                            : "cursor-not-allowed border border-[#3d4f6d]/30 " +
                              "bg-[#0a1020]/50 text-[#3d4f6d]"
                        }`}
                      >
                        ⚙ {droneCost(drone.id)}
                      </button>
                    </div>

                    {/* Stat rows */}
                    {hasUnit && (
                      <div className="mt-3 flex flex-col gap-1.5">
                        {([
                          { stat: "reload" as const, valueKey: "upgrade.drone.reload" as TKey,
                            descKey: "upgrade.drone.reloadDesc" as TKey },
                          { stat: "damage" as const, valueKey: "upgrade.drone.damage" as TKey,
                            descKey: "upgrade.drone.damageDesc" as TKey },
                        ]).map((row) => {
                          const level = entry!.model[row.stat];
                          const maxed = level >= DRONE_STAT_MAX_LEVEL;
                          const cost = droneUpgradeCost(level);
                          const affordable = maxed ? false : upgrades.parts >= cost;
                          return (
                            <div key={row.stat} className={WEAPON_STAT_ROW_CLASS}>
                              <div className="min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="text-[11px] font-bold text-[#eaffff]">
                                    {t(row.valueKey)}
                                  </span>
                                  <span className="font-mono text-[9px] text-[#6f86a8]">
                                    {maxed ? "/// MAX" : `lv.${level}`}
                                  </span>
                                </div>
                                <div className="text-[9px] text-[#6f86a8]">
                                  {t(row.descKey)} ·{" "}
                                  <span className="text-[#5ef2ff]">
                                    {droneStatValue(row.stat, entry!.model)}
                                  </span>
                                </div>
                              </div>
                              {maxed ? (
                                <div className="font-mono text-[9px] tracking-[0.2em] text-[#5ef2ff]">
                                  MAX
                                </div>
                              ) : (
                                <button
                                  onClick={() => handleBuyDroneStat(drone.id, row.stat)}
                                  disabled={!free && !affordable}
                                  className={`clip-btn px-3 py-1.5 text-[10px] font-mono tracking-[0.15em] ` +
                                    `transition-all ${
                                    free || affordable
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
              })}
              </div>
            </div>
          )}

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