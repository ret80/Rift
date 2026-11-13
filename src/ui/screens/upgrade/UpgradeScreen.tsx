/**
 * UpgradeScreen — экран прокачки.
 *
 * Контейнер держит только состояние снимка и обработчики покупок; сами
 * вкладки вынесены в `ShipTab`, `ArmoryTab`, `DronesTab` и `BonusesTab`.
 *
 * Gamepad-навигация централизована здесь: контейнер строит единый список
 * доступных действий для активной вкладки, ведёт по нему фокус (D-pad
 * up/down + стик), покупает по A и переключает вкладки по L/R (LB/RB).
 * Вкладки лишь подсвечивают элемент по переданному `focusedId`.
 */

import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type MutableRefObject,
} from "react";
import {
  DRONE_STAT_MAX_LEVEL,
  type DroneId,
  type DroneLoadout,
  type DroneStatKey,
} from "../../../game/drones/Drone";
import type { Game } from "../../../game/game";
import {
  copyDroneLoadout,
  copyWeaponLoadout,
} from "../../../game/loadout/snapshots";
import {
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type UpgradeKey,
  type WeaponStatKey,
} from "../../../game/upgrades";
import type { WeaponId, WeaponLoadout } from "../../../game/weapons/Weapon";
import { useGamepadFocus } from "../../../hooks/useGamepadFocus";
import { useT } from "../../../i18n";
import GameButton from "../../components/GameButton";
import ScreenHeader from "../../components/ScreenHeader";
import type { GamepadNavHandlers } from "../../ScreenRouter";
import { ArmoryTab } from "./ArmoryTab";
import { BonusesTab } from "./BonusesTab";
import { DronesTab } from "./DronesTab";
import {
  ARMORY_WEAPONS,
  DRONE_CATALOG,
  DRONE_STATS,
  SHIP_KEYS,
  UPGRADE_TIERS,
  WEAPON_STATS,
} from "./model";
import { ShipTab } from "./ShipTab";
import { TabButton } from "./TabButton";

type TabId = "ship" | "armory" | "drones" | "bonuses";
const TAB_IDS: TabId[] = ["ship", "armory", "drones", "bonuses"];

/** Действие, доступное для покупки на текущей вкладке. */
type UpgradeAction =
  | { id: string; kind: "upgrade"; key: UpgradeKey }
  | { id: string; kind: "weapon"; weaponId: WeaponId }
  | { id: string; kind: "weaponStat"; weaponId: WeaponId; stat: WeaponStatKey }
  | { id: string; kind: "drone"; droneId: DroneId }
  | { id: string; kind: "droneStat"; droneId: DroneId; stat: DroneStatKey };

/** Все доступные покупки на вкладке «Корабль». */
function shipActions(upgrades: PlayerUpgrades): UpgradeAction[] {
  const list: UpgradeAction[] = [];
  for (const key of SHIP_KEYS) {
    if (upgrades[key] < UPGRADE_TIERS[key].maxLevel) {
      list.push({ id: `ship:${key}`, kind: "upgrade", key });
    }
  }
  if (upgrades.shield <= 0) {
    // Щит покупается один раз, после чего открываются его линии.
    list.push({ id: "ship:shield", kind: "upgrade", key: "shield" });
  } else {
    for (const key of ["shieldPercent", "shieldRegen"] as const) {
      if (upgrades[key] < UPGRADE_TIERS[key].maxLevel) {
        list.push({ id: `ship:${key}`, kind: "upgrade", key });
      }
    }
  }
  return list;
}

/** Все доступные покупки на вкладке «Арсенал». */
function armoryActions(loadout: WeaponLoadout | null): UpgradeAction[] {
  const list: UpgradeAction[] = [];
  for (const weapon of ARMORY_WEAPONS) {
    const entry = loadout?.[weapon.id];
    if (!entry?.owned) {
      list.push({ id: `weapon:${weapon.id}`, kind: "weapon", weaponId: weapon.id });
      continue;
    }
    for (const row of weapon.stats ?? WEAPON_STATS) {
      if (entry.model[row.stat] < WEAPON_STAT_MAX_LEVEL) {
        list.push({
          id: `weapon:${weapon.id}:${row.stat}`,
          kind: "weaponStat",
          weaponId: weapon.id,
          stat: row.stat,
        });
      }
    }
  }
  return list;
}

/** Все доступные покупки на вкладке «Дроны». */
function droneActions(droneLoadout: DroneLoadout | null): UpgradeAction[] {
  const list: UpgradeAction[] = [];
  for (const drone of DRONE_CATALOG) {
    // Заголовок дрона всегда позволяет докупить ещё один юнит.
    list.push({ id: `drone:${drone.id}`, kind: "drone", droneId: drone.id });
    const entry = droneLoadout?.entries[drone.id];
    if (!entry || entry.count <= 0) continue;
    for (const row of DRONE_STATS) {
      if (entry.model[row.stat] < DRONE_STAT_MAX_LEVEL) {
        list.push({
          id: `drone:${drone.id}:${row.stat}`,
          kind: "droneStat",
          droneId: drone.id,
          stat: row.stat,
        });
      }
    }
  }
  return list;
}

/** Все доступные покупки на вкладке «Бонусы». */
function bonusActions(upgrades: PlayerUpgrades): UpgradeAction[] {
  const list: UpgradeAction[] = [];
  for (const key of ["fireRate", "rateDuration", "healDuration", "healRate"] as const) {
    if (upgrades[key] < UPGRADE_TIERS[key].maxLevel) {
      list.push({ id: `bonus:${key}`, kind: "upgrade", key });
    }
  }
  return list;
}

export function UpgradeScreen(props: {
  game: Game | null;
  onBack: () => void;
  isGamepad: boolean;
  gamepadNavRef: MutableRefObject<GamepadNavHandlers>;
  /** `hangar` — экран между волнами забега. */
  variant?: "hangar";
}) {
  const t = useT();
  const isHangar = props.variant === "hangar";
  const [tab, setTab] = useState<TabId>("ship");
  const [upgrades, setUpgrades] = useState<PlayerUpgrades>({
    hull: 0, speed: 0, guns: 0, drones: 0,
    shield: 0, shieldPercent: 0, shieldRegen: 0, fireRate: 0, rateDuration: 0,
    healDuration: 0, healRate: 0,
  });
  /** Детали читаются из кошелька, а не из состояния прокачки. */
  const [parts, setParts] = useState(0);
  const [partsInfinite, setPartsInfinite] = useState(false);
  const [loadout, setLoadout] = useState<WeaponLoadout | null>(null);
  const [droneLoadout, setDroneLoadout] = useState<DroneLoadout | null>(null);
  const [weaponSlots, setWeaponSlots] = useState(1);
  const [usedWeaponSlots, setUsedWeaponSlots] = useState(1);
  const [droneSlots, setDroneSlots] = useState(1);
  const [usedDroneSlots, setUsedDroneSlots] = useState(1);
  /** Закрытые достижениями виды — кнопка покупки неактивна до условия. */
  const [lockedWeapons, setLockedWeapons] = useState<ReadonlySet<string>>(new Set());
  const [lockedDrones, setLockedDrones] = useState<ReadonlySet<string>>(new Set());

  const screenRef = useRef<HTMLDivElement | null>(null);

  /** Снимок состояния: React перерисовывается после покупок. */
  const refresh = useCallback(() => {
    const game = props.game;
    if (!game) return;
    setUpgrades({ ...game.getPlayerUpgrades() });
    setParts(game.getParts());
    setPartsInfinite(game.isPartsInfinite());
    setLoadout(copyWeaponLoadout(game.getWeaponLoadout()));
    setDroneLoadout(copyDroneLoadout(game.getDroneLoadout()));
    setWeaponSlots(game.getWeaponSlots());
    setUsedWeaponSlots(game.getUsedWeaponSlots());
    setDroneSlots(game.getDroneSlots());
    setUsedDroneSlots(game.getUsedDroneSlots());
    const closedWeapons = new Set<string>();
    for (const weapon of ARMORY_WEAPONS) {
      if (!game.isWeaponUnlocked(weapon.id)) closedWeapons.add(weapon.id);
    }
    const closedDrones = new Set<string>();
    for (const drone of DRONE_CATALOG) {
      if (!game.isDroneUnlocked(drone.id)) closedDrones.add(drone.id);
    }
    setLockedWeapons(closedWeapons);
    setLockedDrones(closedDrones);
  }, [props.game]);

  // Первичный снимок при открытии экрана.
  useEffect(() => {
    refresh();
  }, [refresh]);

  const handlePurchase = useCallback((key: UpgradeKey) => {
    if (props.game?.purchaseUpgrade(key)) refresh();
  }, [props.game, refresh]);

  const handleBuyWeapon = useCallback((id: WeaponId) => {
    if (props.game?.purchaseWeapon(id)) refresh();
  }, [props.game, refresh]);

  const handleBuyStat = useCallback((id: WeaponId, stat: WeaponStatKey) => {
    if (props.game?.upgradeWeaponStat(id, stat)) refresh();
  }, [props.game, refresh]);

  const handleBuyDrone = useCallback((id: DroneId) => {
    if (props.game?.purchaseDrone(id)) refresh();
  }, [props.game, refresh]);

  const handleBuyDroneStat = useCallback((id: DroneId, stat: DroneStatKey) => {
    if (props.game?.upgradeDroneStat(id, stat)) refresh();
  }, [props.game, refresh]);

  /** Список покупок активной вкладки — по нему ходит фокус. */
  const actions = useMemo<UpgradeAction[]>(() => {
    switch (tab) {
      case "ship":
        return shipActions(upgrades);
      case "armory":
        return armoryActions(loadout);
      case "drones":
        return droneActions(droneLoadout);
      case "bonuses":
        return bonusActions(upgrades);
    }
  }, [tab, upgrades, loadout, droneLoadout]);

  const { focusIndex, setFocusIndex, onNavUp, onNavDown } = useGamepadFocus({
    count: actions.length,
    initialIndex: 0,
  });

  const focusedAction = actions[focusIndex];
  const focusedId = props.isGamepad ? (focusedAction?.id ?? null) : null;

  /** Переключить вкладку и сбросить фокус на первый пункт. */
  const selectTab = useCallback((id: TabId) => {
    setTab(id);
    setFocusIndex(0);
  }, [setFocusIndex]);

  const switchTab = useCallback((direction: "left" | "right") => {
    const currentIndex = TAB_IDS.indexOf(tab);
    const newIndex =
      direction === "left"
        ? ((currentIndex - 1) % TAB_IDS.length + TAB_IDS.length) % TAB_IDS.length
        : (currentIndex + 1) % TAB_IDS.length;
    selectTab(TAB_IDS[newIndex]);
  }, [tab, selectTab]);

  /** Купить действие, на котором стоит фокус. */
  const confirmAction = useCallback(() => {
    const action = actions[focusIndex];
    if (!action) return;
    switch (action.kind) {
      case "upgrade":
        handlePurchase(action.key);
        break;
      case "weapon":
        handleBuyWeapon(action.weaponId);
        break;
      case "weaponStat":
        handleBuyStat(action.weaponId, action.stat);
        break;
      case "drone":
        handleBuyDrone(action.droneId);
        break;
      case "droneStat":
        handleBuyDroneStat(action.droneId, action.stat);
        break;
    }
  }, [actions, focusIndex, handlePurchase, handleBuyWeapon, handleBuyStat, handleBuyDrone, handleBuyDroneStat]);

  // Регистрируем навигацию в общий ref: up/down — фокус, L/R и left/right — вкладки.
  useEffect(() => {
    props.gamepadNavRef.current = {
      up: onNavUp,
      down: onNavDown,
      left: () => switchTab("left"),
      right: () => switchTab("right"),
      tabLeft: () => switchTab("left"),
      tabRight: () => switchTab("right"),
      confirm: confirmAction,
      cancel: props.onBack,
    };
    return () => {
      props.gamepadNavRef.current = {
        up: () => {}, down: () => {}, left: () => {}, right: () => {},
        confirm: null, cancel: null,
      };
    };
  }, [
    onNavUp,
    onNavDown,
    switchTab,
    confirmAction,
    props.onBack,
    props.gamepadNavRef,
  ]);

  // При смене фокуса — прокрутить выделенный пункт в видимую область.
  useEffect(() => {
    if (!props.isGamepad) return;
    screenRef.current
      ?.querySelector<HTMLElement>('[data-gamepad-focused="true"]')
      ?.scrollIntoView({ block: "nearest" });
  }, [focusIndex, tab, props.isGamepad]);

  return (
    <div
      ref={screenRef}
      className="anim-overlay absolute inset-0 z-20 flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-label={isHangar ? t("upgrade.hangarTitle") : t("upgrade.title")}
    >
      <div className="anim-fade-up flex h-[min(640px,90vh)] w-[min(620px,96vw)] flex-col">
        <div className="hud-panel flex min-h-0 flex-1 flex-col p-5 sm:p-7">
          {/* Header */}
          <ScreenHeader
            title={isHangar ? t("upgrade.hangarTitle") : t("upgrade.title")}
            className="-mx-5 -mt-5 mb-5 sm:-mx-7 sm:-mt-7"
            aside={
              <div
                className="flex items-center gap-2 text-[12px] text-[#ffb84d]"
                aria-label={`Parts: ${partsInfinite ? "∞" : parts}`}
              >
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="#ffb84d"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                >
                  <path
                    d={
                      "M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25" +
                      "a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38" +
                      "a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51" +
                      "a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38" +
                      "a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25" +
                      "a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2" +
                      "v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08" +
                      "a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73" +
                      "l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74" +
                      "l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73" +
                      "l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4" +
                      "a2 2 0 0 0-2-2z"
                    }
                  />
                  <circle cx="12" cy="12" r="3" />
                </svg>
                <span className="font-mono font-bold tracking-[0.15em]">
                  {partsInfinite ? "∞" : parts}
                </span>
                <span className="text-[10px] text-[#6f86a8]">{t("upgrade.partsLabel")}</span>
              </div>
            }
          />

          {/* Tabs */}
          <div className="mb-4 shrink-0 overflow-x-auto pb-1">
            <div className="mx-auto flex w-fit gap-2">
              <TabButton
                label={t("upgrade.tabShip")}
                active={tab === "ship"}
                activeClass="border-[#5ef2ff]/80 bg-[#5ef2ff]/25"
                lineClass="bg-[#5ef2ff] shadow-[0_0_8px_#5ef2ff]"
                onClick={() => selectTab("ship")}
                gamepadFocused={props.isGamepad && tab === "ship"}
              />
              <TabButton
                label={t("upgrade.tabArmory")}
                active={tab === "armory"}
                activeClass="border-[#5ef2ff]/80 bg-[#5ef2ff]/25"
                lineClass="bg-[#5ef2ff] shadow-[0_0_8px_#5ef2ff]"
                onClick={() => selectTab("armory")}
                gamepadFocused={props.isGamepad && tab === "armory"}
              />
              <TabButton
                label={t("upgrade.tabDrones")}
                active={tab === "drones"}
                activeClass="border-[#ff9de0]/80 bg-[#ff9de0]/25"
                lineClass="bg-[#ff9de0] shadow-[0_0_8px_#ff9de0]"
                onClick={() => selectTab("drones")}
                gamepadFocused={props.isGamepad && tab === "drones"}
              />
              <TabButton
                label={t("upgrade.tabBonuses")}
                active={tab === "bonuses"}
                activeClass="border-[#7dff9e]/80 bg-[#7dff9e]/25"
                lineClass="bg-[#7dff9e] shadow-[0_0_8px_#7dff9e]"
                onClick={() => selectTab("bonuses")}
                gamepadFocused={props.isGamepad && tab === "bonuses"}
              />
            </div>
          </div>

          {tab === "ship" && (
            <ShipTab
              upgrades={upgrades}
              parts={parts}
              infinite={partsInfinite}
              onPurchase={handlePurchase}
              focusedId={focusedId}
            />
          )}

          {tab === "armory" && (
            <ArmoryTab
              parts={parts}
              infinite={partsInfinite}
              loadout={loadout}
              weaponSlots={weaponSlots}
              usedWeaponSlots={usedWeaponSlots}
              lockedIds={lockedWeapons}
              onBuyWeapon={handleBuyWeapon}
              onBuyStat={handleBuyStat}
              focusedId={focusedId}
            />
          )}

          {tab === "drones" && (
            <DronesTab
              parts={parts}
              infinite={partsInfinite}
              droneLoadout={droneLoadout}
              droneSlots={droneSlots}
              usedDroneSlots={usedDroneSlots}
              lockedIds={lockedDrones}
              onBuyDrone={handleBuyDrone}
              onBuyStat={handleBuyDroneStat}
              focusedId={focusedId}
            />
          )}

          {tab === "bonuses" && (
            <BonusesTab
              upgrades={upgrades}
              parts={parts}
              infinite={partsInfinite}
              onPurchase={handlePurchase}
              focusedId={focusedId}
            />
          )}

          {/* Footer */}
          <div className="mt-5 shrink-0 border-t border-[#5ef2ff]/15 pt-4 text-center">
            <GameButton onClick={props.onBack} variant="amber">
              {isHangar ? t("upgrade.close") : t("upgrade.back")}
            </GameButton>
          </div>
        </div>
      </div>
    </div>
  );
}
