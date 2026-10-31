/**
 * Чистые данные и форматирование экрана прокачки.
 *
 * Здесь нет React: только каталоги строк, расчёт текущих значений линий и
 * общие CSS-классы. Компоненты вкладок берут отсюда всё, что можно посчитать
 * заранее.
 */

import {
  UPGRADE_TIERS,
  UPGRADE_LABEL,
  weaponReloadMult,
  weaponDamageMult,
  WEAPON_ACCURACY_PER_LEVEL,
  WEAPON_STAT_MAX_LEVEL,
  type PlayerUpgrades,
  type WeaponStatKey,
} from "../../game/upgrades";
import {
  shieldBlockPercent,
  shieldRegenPerSecond,
  RATE_BOOST_TIME,
  HEAL_BONUS_TIME,
  HEAL_BASE,
} from "../../game/balance/player";
import type { WeaponId, WeaponLoadout } from "../../game/weapons/Weapon";
import {
  WEAPON_CATALOG,
  WEAPON_IDS,
  type WeaponArmoryId,
  type WeaponIcon,
} from "../../game/weapons/WeaponCatalog";
import {
  DRONE_CATALOG,
  DRONE_STAT_MAX_LEVEL,
  droneDamageMult,
  droneReloadMult,
  type DroneId,
  type DroneLoadout,
  type DroneStatKey,
} from "../../game/drones/Drone";
import type { TKey } from "../../i18n";
import { t } from "../../i18n";

/** Линии корабля во вкладке «Корабль». */
export const SHIP_KEYS: Array<"hull" | "speed" | "guns" | "drones"> = [
  "hull", "speed", "guns", "drones",
];

/** Оформление строки линии прокачки (общий стиль для щита и бонусов). */
export const STAT_ROW_CLASS =
  "flex items-center justify-between gap-3 rounded border " +
  "border-[#3d4f6d]/25 bg-[#04070d]/40 px-3 py-2";

/** Оформление строки линии оружия. */
export const WEAPON_STAT_ROW_CLASS = STAT_ROW_CLASS;

/** Строки линий оружия. */
export const WEAPON_STATS: Array<{ stat: WeaponStatKey; valueKey: TKey; descKey: TKey }> = [
  { stat: "reload", valueKey: "upgrade.weapon.reload", descKey: "upgrade.weapon.reloadDesc" },
  { stat: "damage", valueKey: "upgrade.weapon.damage", descKey: "upgrade.weapon.damageDesc" },
  { stat: "accuracy", valueKey: "upgrade.weapon.accuracy", descKey: "upgrade.weapon.accuracyDesc" },
];

/** Виды оружия, доступные в арсенале. */
export const ARMORY_WEAPONS: Array<{
  id: WeaponArmoryId;
  icon: WeaponIcon;
  color: string;
  titleKey: TKey;
  descKey: TKey;
  stats?: Array<{ stat: WeaponStatKey; valueKey: TKey; descKey: TKey }>;
}> = WEAPON_IDS.filter((id): id is WeaponArmoryId => id !== "drone").map((id) => {
  const entry = WEAPON_CATALOG[id];
  const titleKey: TKey = `upgrade.weapon.${id}`;
  const descKey: TKey = `upgrade.weapon.${id}Desc`;
  return {
    id,
    icon: entry.icon,
    color: entry.color,
    titleKey,
    descKey,
    // У ракетницы нет линии точности: наведение самонаводящееся.
    stats: id === "missile"
      ? WEAPON_STATS.filter((row) => row.stat !== "accuracy")
      : undefined,
  };
});

/** Строки линий дрона. */
export const DRONE_STATS: Array<{ stat: DroneStatKey; valueKey: TKey; descKey: TKey }> = [
  { stat: "reload", valueKey: "upgrade.drone.reload", descKey: "upgrade.drone.reloadDesc" },
  { stat: "damage", valueKey: "upgrade.drone.damage", descKey: "upgrade.drone.damageDesc" },
];

export { DRONE_CATALOG, DRONE_STAT_MAX_LEVEL };

/** Текущее значение линии корабля/бонуса. */
export function getUpgradeValue(
  key: keyof Omit<PlayerUpgrades, "parts">,
  level: number,
): string {
  switch (key) {
    case "hull": return `${100 + level * 20} ${t("common.hp")}`;
    case "speed": return `${(100 + level * 5).toFixed(0)}%`;
    case "guns": return `${1 + level}`;
    case "drones": return `${1 + level}`;
    case "shield": return level > 0 ? t("common.on") : t("common.off");
    case "shieldPercent": return `${Math.round(shieldBlockPercent(level) * 100)}%`;
    case "shieldRegen": return `${shieldRegenPerSecond(level).toFixed(1)}${t("upgrade.perSecond")}`;
    case "fireRate": return `${(100 + level * 8).toFixed(0)}%`;
    case "rateDuration": return `${Math.round(RATE_BOOST_TIME * (1 + level * 0.2))}${t("common.seconds")}`;
    case "healDuration": return `${Math.round(HEAL_BONUS_TIME * (1 + level * 0.2))}${t("common.seconds")}`;
    case "healRate": return `${Math.round(HEAL_BASE * (1 + level * 0.2))}${t("upgrade.perSecond")}`;
    default: return `${level}`;
  }
}

/** Текст эффекта «текущее / максимум» для строки корабля. */
export function getEffectText(
  key: keyof Omit<PlayerUpgrades, "parts">,
  level: number,
  tier: { baseCost: number; costStep: number; maxLevel: number },
): string {
  return `${getUpgradeValue(key, level)} / ${getUpgradeValue(key, tier.maxLevel)}`;
}

/** Текущее значение линии оружия в процентах. */
export function weaponStatValue(
  stat: WeaponStatKey,
  model: WeaponLoadout[WeaponId]["model"],
): string {
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
export function droneStatValue(
  stat: DroneStatKey,
  model: DroneLoadout["entries"][DroneId]["model"],
): string {
  if (stat === "reload") {
    return `${Math.round(droneReloadMult(model) * 100)}%`;
  }
  return `+${Math.round((droneDamageMult(model) - 1) * 100)}%`;
}

export { UPGRADE_TIERS, UPGRADE_LABEL };
