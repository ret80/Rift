/**
 * EntityPoolSystem — entity pools with same-type operations.
 * Manages arrays: enemyList, bulletList, enemyBulletList, pickupList,
 * allyDroneList, weaveList.
 */

import type { Enemy, Bullet, EBullet, Pickup, AllyDrone, WeaveThread } from "../types";
import type { PickupKind } from "../balance";

export class EntityPoolSystem {
  /* Entity pools (private backing fields) */
  private _enemyList: Enemy[] = [];
  private _bulletList: Bullet[] = [];
  private _enemyBulletList: EBullet[] = [];
  private _pickupList: Pickup[] = [];
  private _allyDroneList: AllyDrone[] = [];
  private _weaveList: WeaveThread[] = [];

  get enemyList(): Enemy[] { return this._enemyList; }
  get bulletList(): Bullet[] { return this._bulletList; }
  get enemyBulletList(): EBullet[] { return this._enemyBulletList; }
  get pickupList(): Pickup[] { return this._pickupList; }
  get allyDroneList(): AllyDrone[] { return this._allyDroneList; }
  get weaveList(): WeaveThread[] { return this._weaveList; }

  /* Spawn enemy bullet */
  spawnEnemyBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    dmg: number,
    heavy: boolean,
    cruiser: boolean
  ): void {
    this._enemyBulletList.push({
      x, y, vx, vy, life, dmg, heavy, cruiser,
      r: cruiser ? 5.5 : heavy ? 3.4 : 2.5,
      px: x, py: y,
      grazed: false,
    });
  }

  /* Spawn pickup */
  spawnPickup(
    kind: PickupKind,
    x: number,
    y: number,
    vx: number,
    vy: number
  ): void {
    this._pickupList.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
  }
}
