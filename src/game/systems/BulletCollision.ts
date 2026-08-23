/**
 * BulletCollision - handles all bullet-related collision detection.
 * Publishes events and marks targets for removal; the caller performs splicing.
 */

import type { EventBus } from '../core/EventBus';
import type { Enemy } from '../types';
import { HIT_RADIUS_OFFSET } from './CollisionConstants';

/** Player bullet interface. */
export interface Bullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
}

/** Enemy bullet interface. */
export interface EBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  heavy: boolean;
}

/** A collidable target with position and radius. */
interface Collidable {
  x: number;
  y: number;
  r: number;
}

/**
 * Check if a bullet hits a collidable target.
 */
function bulletHits(bx: number, by: number, target: Collidable): boolean {
  const dx = bx - target.x;
  const dy = by - target.y;
  const dist = Math.hypot(dx, dy);
  return dist < target.r;
}

/**
 * Check player bullets against enemies and asteroids.
 * Returns indices of bullets to remove.
 */
export function checkBulletCollisions(
  eventBus: EventBus,
  bullets: Bullet[],
  enemies: Enemy[],
  asteroids: Array<{ x: number; y: number; r: number; dead?: boolean }>,
  onEnemyKilledCb: ((enemy: Enemy) => void) | null,
  damageAsteroidFn: (index: number, dmg: number, vx: number, vy: number, x: number, y: number) => void
): Set<number> {
  const toRemove = new Set<number>();

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let bulletHit = false;

    // Check collision with enemies
    for (const e of enemies) {
      if (e.dead) continue;

      if (bulletHits(b.x, b.y, { x: e.x, y: e.y, r: e.r })) {
        e.hp -= b.dmg;
        e.flash = 1;
        e.hitCd = 0.15;
        bulletHit = true;

        if (e.hp <= 0) {
          e.dead = true;
          onEnemyKilledCb?.(e);
          eventBus.publish('enemy_killed', {
            scoreValue: e.score,
            kind: e.kind,
            x: e.x,
            y: e.y,
          });
        }
        break;
      }
    }

    // Check collision with asteroids
    if (!bulletHit) {
      for (let ai = 0; ai < asteroids.length; ai++) {
        const a = asteroids[ai];
        if (a.dead) continue;
        if (bulletHits(b.x, b.y, { x: a.x, y: a.y, r: a.r })) {
          bulletHit = true;
          damageAsteroidFn(ai, b.dmg, b.vx, b.vy, a.x, a.y);
          break;
        }
      }
    }

    if (bulletHit) {
      toRemove.add(i);
    }
  }

  return toRemove;
}

/**
 * Check enemy bullets against the player.
 * Returns index of enemy bullet to remove, or -1.
 */
export function checkEnemyBulletVsPlayer(
  eventBus: EventBus,
  enemyBullets: EBullet[],
  playerX: number,
  playerY: number,
  playerR: number,
  playerInvuln: number,
  playerHp: number
): number {
  if (playerInvuln <= 0 && playerHp > 0) {
    const hitRadius = playerR + HIT_RADIUS_OFFSET;
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      if (bulletHits(b.x, b.y, { x: playerX, y: playerY, r: hitRadius })) {
        console.log('[BULLET] player hit by bullet dmg=' + b.dmg + ' hp=' + playerHp);
        eventBus.publish('player_damaged', {
          dmg: b.dmg,
        });
        return i;
      }
    }
  }
  return -1;
}

/**
 * Check enemy bullets against drones.
 * Returns a set of { bulletIndex, droneIndex } pairs to remove.
 */
export function checkEnemyBulletVsDrones(
  eventBus: EventBus,
  enemyBullets: EBullet[],
  drones: Array<{ x: number; y: number; r: number; hp?: number; maxHp?: number; flash?: number }>
): Set<{ bulletIndex: number; droneIndex: number }> {
  const toRemove = new Set<{ bulletIndex: number; droneIndex: number }>();

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    for (let j = drones.length - 1; j >= 0; j--) {
      const d = drones[j];
      if (bulletHits(b.x, b.y, { x: d.x, y: d.y, r: d.r })) {
        if (d.hp != null && d.maxHp != null) {
          d.hp -= b.dmg;
          d.flash = 1;
          eventBus.publish('drone_hit', {
            x: d.x,
            y: d.y,
            dmg: b.dmg,
            dead: d.hp <= 0,
          });
        }
        toRemove.add({ bulletIndex: i, droneIndex: j });
        break;
      }
    }
  }

  return toRemove;
}
