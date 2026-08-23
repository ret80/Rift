/**
 * EntityPoolSystem — entity pools with same-type operations.
 * Manages arrays: enemyList, bulletList, enemyBulletList, pickupList, allyDroneList, mineList.
 */

import { PickupKind, EnemyKind } from "../balance";
import type { Enemy, Bullet, EBullet, Pickup, AllyDrone, Mine } from "../types";

export class EntityPoolSystem {
  /* Entity pools (private backing fields) */
  private _enemyList: Enemy[] = [];
  private _bulletList: Bullet[] = [];
  private _enemyBulletList: EBullet[] = [];
  private _pickupList: Pickup[] = [];
  private _allyDroneList: AllyDrone[] = [];
  private _mineList: Mine[] = [];

  get enemyList(): Enemy[] { return this._enemyList; }
  get bulletList(): Bullet[] { return this._bulletList; }
  get enemyBulletList(): EBullet[] { return this._enemyBulletList; }
  get pickupList(): Pickup[] { return this._pickupList; }
  get allyDroneList(): AllyDrone[] { return this._allyDroneList; }
  get mineList(): Mine[] { return this._mineList; }

  /* Cleanup all pools */
  clearAll(): void {
    this._enemyList.length = 0;
    this._bulletList.length = 0;
    this._enemyBulletList.length = 0;
    this._pickupList.length = 0;
    this._allyDroneList.length = 0;
    this._mineList.length = 0;
  }



  /* Spawn pickup */
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    this._pickupList.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
  }

  /* Spawn enemy bullet */
  spawnEnemyBullet(x: number, y: number, vx: number, vy: number, life: number, dmg: number, heavy: boolean, cruiser: boolean): void {
    this._enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy, cruiser });
  }

  /* Remove dead ally drone */
  removeAllyDroneAt(x: number, y: number): void {
    const idx = this._allyDroneList.findIndex(d => Math.abs(d.x - x) < 2 && Math.abs(d.y - y) < 2);
    if (idx !== -1) this._allyDroneList.splice(idx, 1);
  }

  /* Count alive enemies */
  countAliveEnemies(): number {
    return this._enemyList.filter(e => !e.dead).length;
  }

  /* Find nearest enemy within range */
  findNearestEnemyWithin(playerX: number, playerY: number, range: number): { x: number; y: number; dist: number } | null {
    let nearest: { x: number; y: number; dist: number } | null = null;
    let nearestDist = range;

    for (const e of this._enemyList) {
      if (e.dead) continue;
      const dx = e.x - playerX;
      const dy = e.y - playerY;
      const dist = Math.hypot(dx, dy);

      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = { x: e.x, y: e.y, dist };
      }
    }

    return nearest;
  }
}
