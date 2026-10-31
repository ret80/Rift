/**
 * WeaponCatalog — единственный источник данных о видах оружия.
 *
 * Из каталога выводятся:
 *   • тип `WeaponId` и виды слотов строки снаряжения;
 *   • оформление HUD (иконка, цвет, подпись, порядок);
 *   • звуки выстрела и подбора;
 *   • записи пикапов оружия в каталоге подбора.
 */

import type { TKey } from "../../i18n";

/** Иконки оружия, доступные в HUD. */
export type WeaponIcon =
  | "weapon-cannon"
  | "weapon-missile"
  | "pickup-drone"
  | "weapon-laser";

/** Все виды оружия. Порядок задаёт состав реестра и перебор в UI. */
export const WEAPON_IDS = ["cannon", "missile", "drone", "laser"] as const;

/** Идентификатор вида оружия. */
export type WeaponId = (typeof WEAPON_IDS)[number];

/** Оружие, которое может выпасть пикапом (пушка доступна всегда). */
export type WeaponPickupId = Exclude<WeaponId, "cannon">;

/** Оружие, покупаемое во вкладке «Арсенал» (дроны — отдельная вкладка). */
export type WeaponArmoryId = Exclude<WeaponId, "drone">;

/** Канонический ключ отображения оружейного пикапа. */
export type WeaponPickupDisplay = WeaponPickupId;

/** Звук выстрела оружия. */
export type WeaponFireSound = "shoot" | "droneShot";

/** Звук подбора оружейного пикапа. */
export type WeaponPickupSound = "gun" | "drone";

/** Оформление слота оружия в строке снаряжения. */
export interface WeaponMeta {
  icon: WeaponIcon;
  color: string;
  labelKey: TKey;
  order: number;
}

/** Запись каталога: оформление, звуки и параметры пикапа. */
export interface WeaponCatalogEntry extends WeaponMeta {
  /** Звук выстрела. */
  fireSound: WeaponFireSound;
  /** Пикап, выдающий оружие; null — оружие не выпадает. */
  pickup: {
    display: WeaponPickupDisplay;
    color: string;
    sound: WeaponPickupSound;
  } | null;
}

/** Каталог всех видов оружия. */
export const WEAPON_CATALOG: Record<WeaponId, WeaponCatalogEntry> = {
  cannon: {
    icon: "weapon-cannon",
    color: "#5ef2ff",
    labelKey: "hud.loadout.cannon",
    order: 0,
    fireSound: "shoot",
    pickup: null,
  },
  missile: {
    icon: "weapon-missile",
    color: "#9dffe8",
    labelKey: "hud.loadout.missile",
    order: 1,
    fireSound: "shoot",
    pickup: { display: "missile", color: "#9dffe8", sound: "gun" },
  },
  drone: {
    icon: "pickup-drone",
    color: "#ff9de0",
    labelKey: "hud.loadout.drone",
    order: 2,
    fireSound: "droneShot",
    pickup: { display: "drone", color: "#9dffe8", sound: "drone" },
  },
  laser: {
    icon: "weapon-laser",
    color: "#ff4d6d",
    labelKey: "hud.loadout.laser",
    order: 4,
    fireSound: "shoot",
    pickup: { display: "laser", color: "#ff4d6d", sound: "gun" },
  },
};
