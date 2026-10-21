/**
 * EntityPoolSystem — entity pools with same-type operations.
 * Manages arrays: enemyList, bulletList, enemyBulletList, pickupList, allyDroneList.
 */

import type { Enemy, Bullet, EBullet, Pickup, AllyDrone } from "../types";

export class EntityPoolSystem {
  /* Entity pools (private backing fields) */
  private _enemyList: Enemy[] = [];
  private _bulletList: Bullet[] = [];
  private _enemyBulletList: EBullet[] = [];
  private _pickupList: Pickup[] = [];
  private _allyDroneList: AllyDrone[] = [];

  get enemyList(): Enemy[] { return this._enemyList; }
  get bulletList(): Bullet[] { return this._bulletList; }
  get enemyBulletList(): EBullet[] { return this._enemyBulletList; }
  get pickupList(): Pickup[] { return this._pickupList; }
  get allyDroneList(): AllyDrone[] { return this._allyDroneList; }

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
    this._enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy, cruiser });
  }
}
