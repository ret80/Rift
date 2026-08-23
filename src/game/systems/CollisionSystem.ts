/**
 * CollisionSystem - collision handling with mass awareness.
 * Composes BulletCollision, EntityCollision, and PickupCollection modules.
 */

import { massForRadius, type AsteroidKind, EnemyKind } from '../balance';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Enemy } from '../types';
import { PLAYER_ASTEROID_DAMAGE, DRONE_PROXIMITY } from './CollisionConstants';
import { softResolveCollision } from './EntityCollision';
import {
  checkBulletCollisions,
  checkEnemyBulletVsPlayer,
  checkEnemyBulletVsDrones,
  type Bullet,
  type EBullet,
} from './BulletCollision';
import { checkPickupCollection } from './PickupCollection';

interface Collidable {
  x: number;
  y: number;
  r: number;
}

export class CollisionSystem {
  private eventBus: EventBus;
  private state: GameState;
  private onEnemyKilledCb: ((enemy: Enemy) => void) | null = null;

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
  }

  /** Set callback for enemy death events (used by PickupDropSystem) */
  setOnEnemyKilled(cb: (enemy: Enemy) => void): void {
    this.onEnemyKilledCb = cb;
  }

  /**
    Check if a bullet hits a collidable target (kept for backwards compatibility).
   */
  checkBulletCollision(
    bulletX: number,
    bulletY: number,
    target: Collidable
  ): boolean {
    const dx = bulletX - target.x;
    const dy = bulletY - target.y;
    const dist = Math.hypot(dx, dy);
    return dist < target.r;
  }

  /**
   * Update all collisions between objects.
   */
  update(
    dt: number,
    playerState: {
      x: number; y: number; r: number; hp: number; invuln: number;
      mass: number; vx: number; vy: number;
    },
    enemies: Enemy[],
    bullets: Bullet[],
    enemyBullets: EBullet[],
    pickups: Array<{ x: number; y: number; r: number; kind?: string }>,
    _mines: Array<{ x: number; y: number; r: number }>,
    drones: Array<{ x: number; y: number; r: number; hp?: number; maxHp?: number; flash?: number }>,
    asteroids: Array<{
      x: number; y: number; r: number; vx: number; vy: number;
      mass: number; kind: AsteroidKind; dead?: boolean;
    }> = []
  ): void {
    // === Bullet collisions ===
    const bulletToRemove = checkBulletCollisions(
      this.eventBus, bullets, enemies, asteroids,
      this.onEnemyKilledCb, this.damageAsteroid.bind(this)
    );
    for (const i of [...bulletToRemove].sort((a, b) => b - a)) {
      bullets.splice(i, 1);
    }

    // Enemy bullet → player
    const enemyBulletPlayerIndex = checkEnemyBulletVsPlayer(
      this.eventBus, enemyBullets,
      playerState.x, playerState.y, playerState.r,
      playerState.invuln, playerState.hp
    );
    if (enemyBulletPlayerIndex >= 0) {
      enemyBullets.splice(enemyBulletPlayerIndex, 1);
    }

    // === Entity-entity collisions ===
    this.entityCollisions(playerState, enemies, asteroids, drones);

    // === Drone-player avoidance ===
    this.checkDroneAvoidance(playerState, drones);

    // === Pickup collection ===
    const pickupToRemove = checkPickupCollection(
      this.eventBus, pickups,
      playerState.x, playerState.y, playerState.r
    );
    for (const i of [...pickupToRemove].sort((a, b) => b - a)) {
      pickups.splice(i, 1);
    }

    // === Enemy bullet → drones ===
    const bulletDroneToRemove = checkEnemyBulletVsDrones(
      this.eventBus, enemyBullets, drones
    );
    for (const { bulletIndex, droneIndex } of [...bulletDroneToRemove].sort((a, b) => b.droneIndex - a.droneIndex || b.bulletIndex - a.bulletIndex)) {
      drones.splice(droneIndex, 1);
      enemyBullets.splice(bulletIndex, 1);
    }
  }

  /**
   * Handle entity-entity collisions: player-enemy, player-asteroid,
   * enemy-asteroid, asteroid-asteroid.
   */
  private entityCollisions(
    playerState: { x: number; y: number; r: number; hp: number; invuln: number; mass: number; vx: number; vy: number },
    enemies: Enemy[],
    asteroids: Array<{ x: number; y: number; r: number; vx: number; vy: number; mass: number; kind: AsteroidKind; dead?: boolean }>,
    _drones: Array<{ x: number; y: number; r: number; hp?: number; maxHp?: number; flash?: number }>
  ): void {
    // Player-enemy collision
    if (playerState.invuln <= 0 && playerState.hp > 0) {
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = playerState.x - e.x;
        const dy = playerState.y - e.y;
        const dist = Math.hypot(dx, dy);
        const minDist = playerState.r + e.r;

        if (dist < minDist) {
          this.eventBus.publish('player_damaged', {
            dmg: e.contact,
          });
          e.dead = true;
          this.onEnemyKilledCb?.(e);
          this.eventBus.publish('enemy_killed', {
            scoreValue: e.score,
            kind: e.kind,
            x: e.x,
            y: e.y,
          });
          break;
        }
      }
    }

    // Player-asteroid collision
    if (playerState.invuln <= 0 && playerState.hp > 0) {
      for (const a of asteroids) {
        if (a.dead) continue;
        const dx = playerState.x - a.x;
        const dy = playerState.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = playerState.r + a.r;

        if (dist < minDist) {
          this.eventBus.publish('player_damaged', {
            dmg: PLAYER_ASTEROID_DAMAGE,
          });

          const playerMass = playerState.mass || massForRadius(playerState.r);
          const impulse = 80;
          const result = softResolveCollision(
            playerState.x, playerState.y, playerMass,
            playerState.vx, playerState.vy,
            a.x, a.y, a.mass, a.vx, a.vy,
            impulse
          );
          a.vx = result.nb.vx;
          a.vy = result.nb.vy;
          break;
        }
      }
    }

    // Enemy-asteroid collision
    for (const e of enemies) {
      if (e.dead) continue;
      for (const a of asteroids) {
        if (a.dead) continue;
        const dx = e.x - a.x;
        const dy = e.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = e.r + a.r;

        if (dist < minDist) {
          const enemyMass = e.mass || massForRadius(e.r);
          const impulse = 60;
          const result = softResolveCollision(
            e.x, e.y, enemyMass,
            e.vx, e.vy,
            a.x, a.y, a.mass, a.vx, a.vy,
            impulse
          );
          e.vx = result.na.vx;
          e.vy = result.na.vy;
          a.vx = result.nb.vx;
          a.vy = result.nb.vy;
          e.hp -= 1;
          if (e.hp <= 0) {
            e.dead = true;
            this.onEnemyKilledCb?.(e);
            this.eventBus.publish('enemy_killed', {
              scoreValue: e.score,
              kind: e.kind,
              x: e.x,
              y: e.y,
            });
          }
        }
      }
    }

    // Asteroid-asteroid collision
    for (let i = 0; i < asteroids.length; i++) {
      const a1 = asteroids[i];
      if (a1.dead) continue;
      for (let j = i + 1; j < asteroids.length; j++) {
        const a2 = asteroids[j];
        if (a2.dead) continue;
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a1.r + a2.r;

        if (dist < minDist && dist > 0.01) {
          const impulse = 30;
          const result = softResolveCollision(
            a1.x, a1.y, a1.mass,
            a1.vx, a1.vy,
            a2.x, a2.y, a2.mass,
            a2.vx, a2.vy,
            impulse
          );
          a1.vx = result.na.vx;
          a1.vy = result.na.vy;
          a2.vx = result.nb.vx;
          a2.vy = result.nb.vy;
        }
      }
    }
  }

  /**
   * Soft avoidance between player and companion drones.
   */
  private checkDroneAvoidance(
    playerState: { x: number; y: number; r: number; hp: number; invuln: number },
    drones: Array<{ x: number; y: number; r: number }>
  ): void {
    if (playerState.invuln <= 0 && playerState.hp > 0) {
      for (const d of drones) {
        const dx = d.x - playerState.x;
        const dy = d.y - playerState.y;
        const dist = Math.hypot(dx, dy);
        const minDist = DRONE_PROXIMITY + playerState.r;

        if (dist < minDist && dist > 0.01) {
          const push = (1 - dist / minDist) * 0.5;
          const nx = dx / dist;
          const ny = dy / dist;
          this.eventBus.publish('drone_push_player', {
            vx: nx * push,
            vy: ny * push,
          });
        }
      }
    }
  }

  /**
   * Damage an asteroid via event (used by BulletCollision).
   */
  private damageAsteroid(
    index: number,
    dmg: number,
    vx: number,
    vy: number,
    x: number,
    y: number
  ): void {
    this.eventBus.publish('asteroid_hit', { index, dmg, vx, vy, x, y });
  }
}
