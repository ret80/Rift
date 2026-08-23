/**
 * EntityPoolSystem — пулы сущностей с однотипными операциями.
 * Управляет массивами: enemyList, bulletList, enemyBulletList, pickupList, allyDroneList, mineList.
 */

import { PickupKind, EnemyKind } from "../balance";
import type { Enemy, Bullet, EBullet, Pickup, AllyDrone, Mine } from "../types";

export class EntityPoolSystem {
  /* Entity pools */
  enemyList: Enemy[] = [];
  bulletList: Bullet[] = [];
  enemyBulletList: EBullet[] = [];
  pickupList: Pickup[] = [];
  allyDroneList: AllyDrone[] = [];
  mineList: Mine[] = [];

  /* Cleanup all pools */
  clearAll(): void {
    this.enemyList.length = 0;
    this.bulletList.length = 0;
    this.enemyBulletList.length = 0;
    this.pickupList.length = 0;
    this.allyDroneList.length = 0;
    this.mineList.length = 0;
  }

  /* Spawn enemy */
  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null, spawnFn: (kind: EnemyKind, x: number, y: number, parent: Enemy | null) => void): void {
    spawnFn(kind, x, y, parent);
  }

  /* Spawn pickup */
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    this.pickupList.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
  }

  /* Spawn enemy bullet */
  spawnEnemyBullet(x: number, y: number, vx: number, vy: number, life: number, dmg: number, heavy: boolean, cruiser: boolean): void {
    this.enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy, cruiser });
  }

  /* Remove dead ally drone */
  removeAllyDroneAt(x: number, y: number): void {
    const idx = this.allyDroneList.findIndex(d => Math.abs(d.x - x) < 2 && Math.abs(d.y - y) < 2);
    if (idx !== -1) this.allyDroneList.splice(idx, 1);
  }

  /* Count alive enemies */
  countAliveEnemies(): number {
    return this.enemyList.filter(e => !e.dead).length;
  }

  /* Find nearest enemy within range */
  findNearestEnemyWithin(playerX: number, playerY: number, range: number): { x: number; y: number; dist: number } | null {
    let nearest: { x: number; y: number; dist: number } | null = null;
    let nearestDist = range;

    for (const e of this.enemyList) {
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
