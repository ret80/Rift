/**
 * BulletCollision - handles all bullet-related collision detection.
 * Publishes events and marks targets for removal; the caller performs splicing.
 */

import type { EventBus } from '../core/EventBus';
import type { AllyDrone, Bullet, EBullet, Enemy } from '../types';
import { HIT_RADIUS_OFFSET } from './CollisionConstants';

/** A collidable target with position and radius. */
interface Collidable {
  x: number;
  y: number;
  r: number;
}

/** Попадание снаряда врага в дрона. */
export interface DroneHit {
  /** Индекс снаряда в пуле вражеских снарядов. */
  bulletIndex: number;
  /** Индекс дрона в пуле дронов. */
  droneIndex: number;
  /** Дрон погиб и должен быть удалён. */
  killed: boolean;
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
 * Дрон теряет корпус от попаданий и погибает только когда HP кончились.
 * Returns the list of hits; the caller removes bullets and dead drones.
 */
export function checkEnemyBulletVsDrones(
  eventBus: EventBus,
  enemyBullets: EBullet[],
  drones: AllyDrone[]
): DroneHit[] {
  const hits: DroneHit[] = [];

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    for (let j = drones.length - 1; j >= 0; j--) {
      const d = drones[j];
      if (!bulletHits(b.x, b.y, { x: d.x, y: d.y, r: d.r })) continue;

      d.hp -= b.dmg;
      d.flash = 1;
      const killed = d.hp <= 0;
      eventBus.publish('drone_hit', {
        x: d.x,
        y: d.y,
        dmg: b.dmg,
        dead: killed,
      });
      hits.push({ bulletIndex: i, droneIndex: j, killed });
      break;
    }
  }

  return hits;
}
