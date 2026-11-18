/**
 * Выбор корабля — постоянная настройка игрока.
 *
 * Хранится отдельно от мета-прогресса: сброс кредитов и талантов не
 * возвращает игрока на базовый корабль.
 */

import type { PersistencePort } from "../core/PersistencePort";
import { STORAGE_KEYS } from "../core/storageKeys";
import { isShipId, type ShipId } from "./ShipCatalog";

/** Корабль по умолчанию: базовый «Авангард». */
export const DEFAULT_SHIP_ID: ShipId = "vanguard";

/** Загрузить выбранный корабль; отсутствие/мусор в хранилище — базовый. */
export function loadSelectedShip(storage: PersistencePort): ShipId {
  const raw = storage.get(STORAGE_KEYS.ship);
  return isShipId(raw) ? raw : DEFAULT_SHIP_ID;
}

/** Сохранить выбранный корабль. */
export function saveSelectedShip(storage: PersistencePort, id: ShipId): void {
  storage.set(STORAGE_KEYS.ship, id);
}
