/**
 * ShipCatalog — единственный источник данных о кораблях игрока.
 *
 * Корабль задаёт постоянные характеристики забега: множитель корпуса,
 * множитель скорости, число слотов оружия и дронов и стартовый арсенал.
 * Прокачка мастерской и бонусы Эха Разлома применяются поверх этих
 * значений, поэтому корабли не правят баланс напрямую, а сдвигают его.
 */

import type { WeaponId, WeaponLoadout } from "../weapons/Weapon";

/** Идентификаторы кораблей. */
export const SHIP_IDS = ["vanguard", "frigate"] as const;

/** Идентификатор корабля. */
export type ShipId = (typeof SHIP_IDS)[number];

/** Точка силуэта корпуса относительно центра, px. */
export type HullPoint = readonly [number, number];

/** Постоянные характеристики корабля. */
export interface ShipDef {
  id: ShipId;
  /** Множитель запаса корпуса к базовому значению профиля. */
  hullMult: number;
  /** Множитель скорости: прокачка и мета применяются поверх него. */
  speedMult: number;
  /** Слоты оружия на старте забега (до прокачки). */
  weaponSlotsBase: number;
  /** Потолок слотов оружия с прокачкой и метой. */
  weaponSlotsMax: number;
  /** Слоты под дроны на старте забега (до прокачки). */
  droneSlotsBase: number;
  /** Потолок слотов под дроны с прокачкой и метой. */
  droneSlotsMax: number;
  /** Оружие, купленное на старте забега. */
  startingWeapons: readonly WeaponId[];
  /** Силуэт корпуса: рендер в бою и предпросмотр в ангаре. */
  hull: readonly HullPoint[];
}

/**
 * Каталог кораблей.
 *
 * «Авангард» — базовый корабль: ровные характеристики и 5 слотов оружия.
 * «Фрегат» — носитель оружия: медленнее и на 20 % меньше корпуса, зато
 * 6 слотов оружия, 5 слотов дронов и лазер уже куплен на старте.
 */
export const SHIP_CATALOG: Record<ShipId, ShipDef> = {
  vanguard: {
    id: "vanguard",
    hullMult: 1,
    speedMult: 1,
    weaponSlotsBase: 1,
    weaponSlotsMax: 5,
    droneSlotsBase: 1,
    droneSlotsMax: 4,
    startingWeapons: ["cannon"],
    // Силуэт совпадает с прежним кораблём: 16 px вперёд и 11 px назад.
    hull: [[16, 0], [-11, 10], [-6, 0], [-11, -10]],
  },
  frigate: {
    id: "frigate",
    // −20 % корпуса: 120 HP базы превращаются в 96.
    hullMult: 0.8,
    // −15 % скорости: 480 px/с базы превращаются в 408 px/с.
    speedMult: 0.85,
    weaponSlotsBase: 1,
    weaponSlotsMax: 6,
    droneSlotsBase: 1,
    droneSlotsMax: 5,
    startingWeapons: ["cannon", "laser"],
    // Шире и тяжелее базового, но той же длины: 16 px вперёд и 11 px назад.
    hull: [[16, 0], [10, 10], [-11, 12], [-7, 0], [-11, -12], [10, -10]],
  },
};

/** Проверить, что значение — идентификатор корабля. */
export function isShipId(value: unknown): value is ShipId {
  return typeof value === "string" && value in SHIP_CATALOG;
}

/** Корабль по идентификатору; неизвестный id даёт базовый корабль. */
export function shipDef(id: ShipId): ShipDef {
  return SHIP_CATALOG[id];
}

/**
 * Максимальный уровень линии слотов для корабля.
 *
 * Базовый корабль упирается в свои 5/4 слота, фрегат — в 6/5. Уровень
 * выше потолка не продаётся: покупка не должна быть пустой.
 */
export function shipUpgradeMaxLevel(key: "guns" | "drones", ship: ShipDef): number {
  return key === "guns"
    ? ship.weaponSlotsMax - ship.weaponSlotsBase
    : ship.droneSlotsMax - ship.droneSlotsBase;
}

/** Отметить стартовое оружие корабля купленным (мутирует арсенал забега). */
export function grantStartingWeapons(loadout: WeaponLoadout, ship: ShipDef): WeaponLoadout {
  for (const id of ship.startingWeapons) {
    const entry = loadout[id];
    if (entry) entry.owned = true;
  }
  return loadout;
}
