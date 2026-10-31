/**
 * Вкладка «Арсенал»: покупка оружия и прокачка его линий.
 */

import {
  weaponCost,
  weaponUpgradeCost,
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type WeaponStatKey,
} from "../../game/upgrades";
import type { WeaponId, WeaponLoadout } from "../../game/weapons/Weapon";
import { useT } from "../../i18n";
import { Icon } from "../components/Icon";
import {
  ARMORY_WEAPONS,
  WEAPON_STATS,
  WEAPON_STAT_ROW_CLASS,
  weaponStatValue,
} from "./model";

export function ArmoryTab(props: {
  upgrades: PlayerUpgrades;
  loadout: WeaponLoadout | null;
  free: boolean;
  weaponSlots: number;
  usedWeaponSlots: number;
  onBuyWeapon: (id: WeaponId) => void;
  onBuyStat: (id: WeaponId, stat: WeaponStatKey) => void;
}) {
  const t = useT();
  const { upgrades, loadout, free, weaponSlots, usedWeaponSlots } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="mb-2 flex shrink-0 items-center justify-center gap-2
          text-[11px] tracking-[0.2em] text-[#6f86a8]"
        aria-label={`Weapon slots: ${usedWeaponSlots} of ${weaponSlots}`}
      >
        <span className="font-mono font-bold text-[#5ef2ff]">
          {usedWeaponSlots}/{weaponSlots}
        </span>
        <span>{t("upgrade.weapon.slots")}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
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
                    onClick={() => props.onBuyWeapon(weapon.id)}
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
                              {maxed ? `/// ${t("common.max")}` : `lv.${level}`}
                            </span>
                          </div>
                          <div className="text-[9px] text-[#6f86a8]">
                            {t(row.descKey)} ·{" "}
                            <span className="text-[#5ef2ff]">
                              {weaponStatValue(row.stat, entry!.model)}
                            </span>
                          </div>
                        </div>
                        {maxed ? (
                          <div className="font-mono text-[9px] tracking-[0.2em] text-[#5ef2ff]">
                            {t("common.max")}
                          </div>
                        ) : (
                          <button
                            onClick={() => props.onBuyStat(weapon.id, row.stat)}
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
  );
}
