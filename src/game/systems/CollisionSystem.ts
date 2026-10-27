/**
 * CollisionSystem - collision handling with mass awareness.
 * Composes BulletCollision, EntityCollision, and PickupCollection modules.
 *
 * Физические контакты тел (игрок/враги/астероиды) поступают из
 * PhysicsSystem: бэкенд CustomCurrentPhysics сохраняет прежние мягкие
 * импульсы, PlanckPhysics решает скорости сам, поэтому здесь остаются
 * только игровые последствия контакта (урон, гибель врага).
 */

import { massForRadius } from '../balance';
import {
  GRAZE_BAND,
  PLAYER_BULLET_HIT_OFFSET,
} from '../balance/player';
import type { EventBus } from '../core/EventBus';
import type { WorldFrame } from '../core/WorldFrame';
import type { PhysicsSystem } from '../physics/index';

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
  private physics: PhysicsSystem;

  constructor(eventBus: EventBus, physics: PhysicsSystem) {
    this.eventBus = eventBus;
    this.physics = physics;
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

    // === Entity-entity collisions (из физического слоя) ===
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
   * Игровые последствия контактов тел из физического слоя:
   * player-enemy, player-asteroid, enemy-asteroid.
   * Астероид-астероид обрабатывает AsteroidField (custom) или Planck
   * (velocities are resolved inside the backend).
   */
  private entityCollisions(
    world: WorldFrame
  ): void {
    const playerState = world.player;
    const enemies = world.enemies;
    const asteroids = world.asteroids;
    const softImpulse = !this.physics.resolvesVelocity;
    let playerHit = false;

    for (const contact of this.physics.contacts) {
      const a = contact.a;
      const b = contact.b;
      const kindA = contact.kindA;
      const kindB = contact.kindB;

      // === player-enemy: урон и гибель врага (как раньше) ===
      if (
        !playerHit &&
        playerState.invuln <= 0 &&
        playerState.hp > 0 &&
        ((kindA === 'player' && kindB === 'enemy') || (kindA === 'enemy' && kindB === 'player'))
      ) {
        const enemy = kindA === 'enemy' ? a : b;
        const e = enemy as (typeof enemies)[number];
        if (!e.dead && enemies.includes(e)) {
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
          playerHit = true;
        }
      }

      // === player-asteroid: урон + мягкий импульс только в custom-физике ===
      if (
        !playerHit &&
        playerState.invuln <= 0 &&
        playerState.hp > 0 &&
        ((kindA === 'player' && kindB === 'asteroid') || (kindA === 'asteroid' && kindB === 'player'))
      ) {
        const ast = kindA === 'asteroid' ? a : b;
        const rock = ast as (typeof asteroids)[number];
        if (!rock.dead && asteroids.includes(rock)) {
          this.eventBus.publish('player_damaged', {
            dmg: PLAYER_ASTEROID_DAMAGE,
          });
          playerHit = true;
          if (softImpulse) {
            const playerMass = playerState.mass || massForRadius(playerState.r);
            const impulse = 80;
            const result = softResolveCollision(
              playerState.x, playerState.y, playerMass,
              playerState.vx, playerState.vy,
              rock.x, rock.y, rock.mass, rock.vx, rock.vy,
              impulse
            );
            rock.vx = result.nb.vx;
            rock.vy = result.nb.vy;
          }
        }
      }

      // === enemy-asteroid: импульс + небольшой урон врагу ===
      if (
        (kindA === 'enemy' && kindB === 'asteroid') ||
        (kindA === 'asteroid' && kindB === 'enemy')
      ) {
        const enemy = kindA === 'enemy' ? a : b;
        const ast = kindA === 'asteroid' ? a : b;
        const e = enemy as (typeof enemies)[number];
        const rock = ast as (typeof asteroids)[number];
        if (e.dead || !enemies.includes(e)) continue;
        if (rock.dead || !asteroids.includes(rock)) continue;

        if (softImpulse) {
          const enemyMass = e.mass || massForRadius(e.r);
          const impulse = 60;
          const result = softResolveCollision(
            e.x, e.y, enemyMass,
            e.vx, e.vy,
            rock.x, rock.y, rock.mass, rock.vx, rock.vy,
            impulse
          );
          e.vx = result.na.vx;
          e.vy = result.na.vy;
          rock.vx = result.nb.vx;
          rock.vy = result.nb.vy;
        }
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