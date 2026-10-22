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
import { WeaverWeapon } from "./WeaverWeapon";

/** Создать свежий набор экземпляров всех видов оружия. */
export function createWeaponRegistry(): Record<WeaponId, Weapon> {
  return {
    cannon: new CannonWeapon(),
    missile: new MissileWeapon(),
    drone: new DroneWeapon(),
    weaver: new WeaverWeapon(),
    laser: new LaserWeapon(),
  };
}
