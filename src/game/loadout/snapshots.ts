/**
 * Снимки снаряжения для React.
 *
 * Живые загрузки (`WeaponLoadout`, `DroneLoadout`) — мутируемые структуры
 * игрового домена. UI нужны независимые копии, чтобы сравнение ссылок в
 * React совпадало с реальными изменениями после покупок.
 */

import type { DroneId, DroneLoadout } from "../drones/Drone";
import type { WeaponId, WeaponLoadout } from "../weapons/Weapon";

/** Копия арсенала оружия. */
export function copyWeaponLoadout(source: WeaponLoadout): WeaponLoadout {
  const out = {} as WeaponLoadout;
  for (const id of Object.keys(source) as WeaponId[]) {
    const entry = source[id];
    out[id] = { owned: entry.owned, model: { ...entry.model } };
  }
  return out;
}

/** Копия ангара дронов. */
export function copyDroneLoadout(source: DroneLoadout): DroneLoadout {
  const entries = {} as DroneLoadout["entries"];
  for (const id of Object.keys(source.entries) as DroneId[]) {
    const entry = source.entries[id];
    entries[id] = { count: entry.count, model: { ...entry.model } };
  }
  return { entries };
}
