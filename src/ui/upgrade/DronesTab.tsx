/**
 * Вкладка «Дроны»: покупка дронов и прокачка их линий.
 */

import {
  DRONE_CATALOG,
  DRONE_STAT_MAX_LEVEL,
  droneCost,
  droneUpgradeCost,
  type DroneId,
  type DroneLoadout,
  type DroneStatKey,
} from "../../game/drones/Drone";
import type { PlayerUpgrades } from "../../game/upgrades";
import { useT } from "../../i18n";
import { Icon } from "../components/Icon";
import { DRONE_STATS, WEAPON_STAT_ROW_CLASS, droneStatValue } from "./model";

export function DronesTab(props: {
  upgrades: PlayerUpgrades;
  droneLoadout: DroneLoadout | null;
  free: boolean;
  droneSlots: number;
  usedDroneSlots: number;
  onBuyDrone: (id: DroneId) => void;
  onBuyStat: (id: DroneId, stat: DroneStatKey) => void;
}) {
  const t = useT();
  const { upgrades, droneLoadout, free, droneSlots, usedDroneSlots } = props;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div
        className="mb-2 flex shrink-0 items-center justify-center gap-2
          text-[11px] tracking-[0.2em] text-[#6f86a8]"
        aria-label={`Drone slots: ${usedDroneSlots} of ${droneSlots}`}
      >
        <span className="font-mono font-bold text-[#ff9de0]">
          {usedDroneSlots}/{droneSlots}
        </span>
        <span>{t("upgrade.drone.slots")}</span>
      </div>
      <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto pr-1">
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
                  onClick={() => props.onBuyDrone(drone.id)}
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
                  {DRONE_STATS.map((row) => {
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
                              {maxed ? `/// ${t("common.max")}` : `lv.${level}`}
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
                            {t("common.max")}
                          </div>
                        ) : (
                          <button
                            onClick={() => props.onBuyStat(drone.id, row.stat)}
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
