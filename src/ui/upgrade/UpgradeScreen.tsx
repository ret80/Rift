/**
 * UpgradeScreen — экран прокачки.
 *
 * Контейнер держит только состояние снимка и обработчики покупок; сами
 * вкладки вынесены в `ShipTab`, `ArmoryTab`, `DronesTab` и `BonusesTab`.
 */

import { useEffect, useState } from "react";
import type { Game } from "../../game/game";
import type { PlayerUpgrades, WeaponStatKey } from "../../game/upgrades";
import type { WeaponId, WeaponLoadout } from "../../game/weapons/Weapon";
import type { DroneId, DroneLoadout, DroneStatKey } from "../../game/drones/Drone";
import {
  copyDroneLoadout,
  copyWeaponLoadout,
} from "../../game/loadout/snapshots";
import { useT } from "../../i18n";
import { TabButton } from "./TabButton";
import { ShipTab } from "./ShipTab";
import { ArmoryTab } from "./ArmoryTab";
import { DronesTab } from "./DronesTab";
import { BonusesTab } from "./BonusesTab";

type TabId = "ship" | "armory" | "drones" | "bonuses";

export function UpgradeScreen(props: {
  game: Game | null;
  detailsOn: boolean;
  onBack: () => void;
}) {
  const t = useT();
  const free = props.detailsOn;
  const [tab, setTab] = useState<TabId>("ship");
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>({
    parts: 0, hull: 0, speed: 0, guns: 0, drones: 0,
    shield: 0, shieldPercent: 0, shieldRegen: 0, fireRate: 0, rateDuration: 0,
    healDuration: 0, healRate: 0,
  });
  const [loadout, setLoadout] = useState<WeaponLoadout | null>(null);
  const [droneLoadout, setDroneLoadout] = useState<DroneLoadout | null>(null);
  const [weaponSlots, setWeaponSlots] = useState(1);
  const [usedWeaponSlots, setUsedWeaponSlots] = useState(1);
  const [droneSlots, setDroneSlots] = useState(1);
  const [usedDroneSlots, setUsedDroneSlots] = useState(1);

  /** Снимок состояния: React перерисовывается после покупок. */
  const refresh = () => {
    const game = props.game;
    if (!game) return;
    setUpgrades({ ...game.getPlayerUpgrades() });
    setLoadout(copyWeaponLoadout(game.getWeaponLoadout()));
    setDroneLoadout(copyDroneLoadout(game.getDroneLoadout()));
    setWeaponSlots(game.getWeaponSlots());
    setUsedWeaponSlots(game.getUsedWeaponSlots());
    setDroneSlots(game.getDroneSlots());
    setUsedDroneSlots(game.getUsedDroneSlots());
  };

  // Первичный снимок при открытии экрана.
  useEffect(() => {
    refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handlePurchase = (key: keyof Omit<PlayerUpgrades, "parts">) => {
    const game = props.game;
    if (!game) return;
    const success = free
      ? game.purchaseUpgradeNoCost(key)
      : game.purchaseUpgradeCosted(key);
    if (success) refresh();
  };

  const handleBuyWeapon = (id: WeaponId) => {
    const game = props.game;
    if (!game) return;
    const success = free
      ? game.purchaseWeaponNoCost(id)
      : game.purchaseWeapon(id);
    if (success) refresh();
  };

  const handleBuyStat = (id: WeaponId, stat: WeaponStatKey) => {
    const game = props.game;
    if (!game) return;
    const success = free
      ? game.upgradeWeaponStatNoCost(id, stat)
      : game.upgradeWeaponStat(id, stat);
    if (success) refresh();
  };

  const handleBuyDrone = (id: DroneId) => {
    const game = props.game;
    if (!game) return;
    const success = free
      ? game.purchaseDroneNoCost(id)
      : game.purchaseDrone(id);
    if (success) refresh();
  };

  const handleBuyDroneStat = (id: DroneId, stat: DroneStatKey) => {
    const game = props.game;
    if (!game) return;
    const success = free
      ? game.upgradeDroneStatNoCost(id, stat)
      : game.upgradeDroneStat(id, stat);
    if (success) refresh();
  };

  return (
    <div
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={t("upgrade.title")}
    >
      <div className="anim-fade-up flex h-[min(640px,90vh)] w-[min(620px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col p-5 sm:p-7">
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
          <div className="mb-4 shrink-0 overflow-x-auto pb-1">
            <div className="mx-auto flex w-fit gap-2">
              <TabButton
                label={t("upgrade.tabShip")}
                active={tab === "ship"}
                activeClass="border-[#5ef2ff]/80 bg-[#5ef2ff]/25"
                lineClass="bg-[#5ef2ff] shadow-[0_0_8px_#5ef2ff]"
                onClick={() => setTab("ship")}
              />
              <TabButton
                label={t("upgrade.tabArmory")}
                active={tab === "armory"}
                activeClass="border-[#5ef2ff]/80 bg-[#5ef2ff]/25"
                lineClass="bg-[#5ef2ff] shadow-[0_0_8px_#5ef2ff]"
                onClick={() => setTab("armory")}
              />
              <TabButton
                label={t("upgrade.tabDrones")}
                active={tab === "drones"}
                activeClass="border-[#ff9de0]/80 bg-[#ff9de0]/25"
                lineClass="bg-[#ff9de0] shadow-[0_0_8px_#ff9de0]"
                onClick={() => setTab("drones")}
              />
              <TabButton
                label={t("upgrade.tabBonuses")}
                active={tab === "bonuses"}
                activeClass="border-[#7dff9e]/80 bg-[#7dff9e]/25"
                lineClass="bg-[#7dff9e] shadow-[0_0_8px_#7dff9e]"
                onClick={() => setTab("bonuses")}
              />
            </div>
          </div>

          {tab === "ship" && (
            <ShipTab
              upgrades={upgrades}
              free={free}
              onPurchase={handlePurchase}
            />
          )}

          {tab === "armory" && (
            <ArmoryTab
              upgrades={upgrades}
              loadout={loadout}
              free={free}
              weaponSlots={weaponSlots}
              usedWeaponSlots={usedWeaponSlots}
              onBuyWeapon={handleBuyWeapon}
              onBuyStat={handleBuyStat}
            />
          )}

          {tab === "drones" && (
            <DronesTab
              upgrades={upgrades}
              droneLoadout={droneLoadout}
              free={free}
              droneSlots={droneSlots}
              usedDroneSlots={usedDroneSlots}
              onBuyDrone={handleBuyDrone}
              onBuyStat={handleBuyDroneStat}
            />
          )}

          {tab === "bonuses" && (
            <BonusesTab
              upgrades={upgrades}
              free={free}
              onPurchase={handlePurchase}
            />
          )}

          {/* Footer */}
          <div className="mt-5 shrink-0 border-t border-[#5ef2ff]/15 pt-4 text-center">
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
