/**
 * CollisionSystem - collision handling with mass awareness.
 * Composes BulletCollision, EntityCollision, and PickupCollection modules.
 */

import { massForRadius } from '../balance';
import {
  GRAZE_BAND,
  PLAYER_BULLET_HIT_OFFSET,
} from '../balance/player';
import type { EventBus } from '../core/EventBus';
import type { WorldFrame } from '../core/WorldFrame';

import { PLAYER_ASTEROID_DAMAGE, DRONE_PROXIMITY } from './CollisionConstants';
import { softResolveCollision } from './EntityCollision';
import {
  checkBulletCollisions,
  checkEnemyBulletVsPlayer,
  checkEnemyBulletVsDrones,
} from './BulletCollision';
import type { PlayerHitbox } from './GrazeCollision';
import { checkPickupCollection } from './PickupCollection';

export class CollisionSystem {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /**
   * Update all collisions between objects.
   */
  update(dt: number, world: WorldFrame): void {
    const playerState = world.player;
    const enemies = world.enemies;
    const bullets = world.bullets;
    const enemyBullets = world.enemyBullets;
    const pickups = world.pickups;
    const drones = world.allyDrones;
    const asteroids = world.asteroids;

    // === Bullet collisions ===
    const bulletToRemove = checkBulletCollisions(
      this.eventBus, bullets, enemies, asteroids,
      this.damageAsteroid.bind(this)
    );
    for (const i of [...bulletToRemove].sort((a, b) => b - a)) {
      bullets.splice(i, 1);
    }

    // Enemy bullet → player (попадание и касание считаются одним проходом)
    const hitbox: PlayerHitbox = {
      x: playerState.x,
      y: playerState.y,
      outer: playerState.r + PLAYER_BULLET_HIT_OFFSET,
    };
    const bulletCheck = checkEnemyBulletVsPlayer(
      this.eventBus, enemyBullets, hitbox,
      playerState.invuln, playerState.hp, GRAZE_BAND
    );
    if (bulletCheck.hitIndex >= 0) {
      enemyBullets.splice(bulletCheck.hitIndex, 1);
    }
    if (bulletCheck.grazeIndices.length > 0) {
      this.eventBus.publish('bullet_grazed', {
        count: bulletCheck.grazeIndices.length,
        x: playerState.x,
        y: playerState.y,
      });
    }

    // === Entity-entity collisions ===
    this.entityCollisions(world);
    // === Drone-player avoidance ===
    this.checkDroneAvoidance(world);

    // === Pickup collection ===
    const pickupToRemove = checkPickupCollection(
      this.eventBus, pickups,
      playerState.x, playerState.y, playerState.r
    );
    for (const i of [...pickupToRemove].sort((a, b) => b - a)) {
      pickups.splice(i, 1);
    }

    // === Enemy bullet → drones ===
    const droneHits = checkEnemyBulletVsDrones(this.eventBus, enemyBullets, drones);
    const bulletsToRemove = new Set<number>();
    const dronesToRemove = new Set<number>();
    for (const hit of droneHits) {
      bulletsToRemove.add(hit.bulletIndex);
      if (hit.killed) dronesToRemove.add(hit.droneIndex);
    }
    for (const i of [...bulletsToRemove].sort((a, b) => b - a)) {
      enemyBullets.splice(i, 1);
    }
    for (const i of [...dronesToRemove].sort((a, b) => b - a)) {
      drones.splice(i, 1);
    }
  }

  /**
   * Handle entity-entity collisions: player-enemy, player-asteroid,
   * enemy-asteroid, asteroid-asteroid.
   */
  private entityCollisions(
    world: WorldFrame
  ): void {
    const playerState = world.player;
    const enemies = world.enemies;
    const asteroids = world.asteroids;
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
          this.eventBus.publish('enemy_killed', {
            score: e.score,
            kind: e.kind,
            x: e.x,
            y: e.y,
            seed: e.seed,
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
            this.eventBus.publish('enemy_killed', {
              score: e.score,
              kind: e.kind,
              x: e.x,
              y: e.y,
              seed: e.seed,
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
    world: WorldFrame
  ): void {
    const playerState = world.player;
    const drones = world.allyDrones;
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
