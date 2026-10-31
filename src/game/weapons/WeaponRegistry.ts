/**
 * WeaponRegistry — реестр видов оружия.
 *
 * Единственное место в проекте, где перечислены виды оружия:
 * добавить новый вид — значит дописать здесь и реализовать класс
 * с контрактом Weapon. Больше нигде список видов не дублируется.
 */

import { CannonWeapon } from "./CannonWeapon";
import { DroneWeapon } from "./DroneWeapon";
import { LaserWeapon } from "./LaserWeapon";
import { MissileWeapon } from "./MissileWeapon";
import type { Weapon, WeaponId } from "./Weapon";
import { WEAPON_IDS } from "./WeaponCatalog";

/** Фабрики видов оружия: ключи обязаны покрывать весь `WeaponId`. */
const WEAPON_FACTORIES: Record<WeaponId, () => Weapon> = {
  cannon: () => new CannonWeapon(),
  missile: () => new MissileWeapon(),
  drone: () => new DroneWeapon(),
  laser: () => new LaserWeapon(),
};

/** Создать свежий набор экземпляров всех видов оружия из каталога. */
export function createWeaponRegistry(): Record<WeaponId, Weapon> {
  const registry = {} as Record<WeaponId, Weapon>;
  for (const id of WEAPON_IDS) {
    registry[id] = WEAPON_FACTORIES[id]();
  }
  return registry;
}
