/**
 * CollisionSystem - collision handling with mass awareness.
 * Composes BulletCollision, EntityCollision, and PickupCollection modules.
 */

import { massForRadius, type AsteroidKind } from '../balance';
import {
  GRAZE_BAND,
  PLAYER_BULLET_HIT_OFFSET,
  SOLID_BULLET_INTERCEPT_SCORE,
  WEAVER_DPS,
  WEAVER_HIT_RADIUS,
  WEAVER_SLOW_DURATION,
} from '../balance/player';
import type { EventBus } from '../core/EventBus';

import type { AllyDrone, Bullet, EBullet, Enemy, WeaveThread } from '../types';
import { PLAYER_ASTEROID_DAMAGE, DRONE_PROXIMITY } from './CollisionConstants';
import { softResolveCollision } from './EntityCollision';
import {
  checkBulletCollisions,
  checkBulletInterceptions,
  checkEnemyBulletVsPlayer,
  checkEnemyBulletVsDrones,
} from './BulletCollision';
import type { PlayerHitbox } from './GrazeCollision';
import { distanceToSegment } from './GrazeCollision';
import { checkPickupCollection } from './PickupCollection';

/** Состояние корабля в виде, который видит система коллизий. */
export interface CollisionPlayerState {
  x: number; y: number; r: number;
  hp: number; invuln: number;
  mass: number; vx: number; vy: number;
  /** Радиус безопасного ядра хитбокса (0 — ядра нет). */
  core: number;
}

export class CollisionSystem {
  private eventBus: EventBus;
  private onEnemyKilledCb: ((enemy: Enemy) => void) | null = null;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  /** Set callback for enemy death events (used by PickupDropSystem) */
  setOnEnemyKilled(cb: (enemy: Enemy) => void): void {
    this.onEnemyKilledCb = cb;
  }

  /**
   * Update all collisions between objects.
   */
  update(
    dt: number,
    playerState: CollisionPlayerState,
    enemies: Enemy[],
    bullets: Bullet[],
    enemyBullets: EBullet[],
    pickups: Array<{ x: number; y: number; r: number; kind?: string }>,
    drones: AllyDrone[],
    asteroids: Array<{
      x: number; y: number; r: number; vx: number; vy: number;
      mass: number; kind: AsteroidKind; dead?: boolean;
    }> = [],
    weaves: WeaveThread[] = []
  ): void {
    // === Bullet collisions ===
    const bulletToRemove = checkBulletCollisions(
      this.eventBus, bullets, enemies, asteroids,
      this.onEnemyKilledCb, this.damageAsteroid.bind(this)
    );
    for (const i of [...bulletToRemove].sort((a, b) => b - a)) {
      bullets.splice(i, 1);
    }

    // === Твёрдые снаряды игрока гасят вражеские ===
    const interceptions = checkBulletInterceptions(bullets, enemyBullets);
    if (interceptions.count > 0) {
      for (const i of [...new Set(interceptions.playerBullets)].sort((a, b) => b - a)) {
        bullets.splice(i, 1);
      }
      for (const i of [...new Set(interceptions.enemyBullets)].sort((a, b) => b - a)) {
        enemyBullets.splice(i, 1);
      }
      this.eventBus.publish('bullet_intercepted', {
        count: interceptions.count,
        x: playerState.x,
        y: playerState.y,
      });
      this.eventBus.publish('score_added', {
        amount: interceptions.count * SOLID_BULLET_INTERCEPT_SCORE,
      });
    }

    // Enemy bullet → player (попадание и касание считаются одним проходом)
    const hitbox: PlayerHitbox = {
      x: playerState.x,
      y: playerState.y,
      outer: playerState.r + PLAYER_BULLET_HIT_OFFSET,
      core: playerState.core,
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
    this.entityCollisions(playerState, enemies, asteroids);

    // === Нити ткани пространства ===
    this.weaveCollisions(enemies, weaves, dt);
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
    playerState: CollisionPlayerState,
    enemies: Enemy[],
    asteroids: Array<{
      x: number; y: number; r: number; vx: number; vy: number;
      mass: number; kind: AsteroidKind; dead?: boolean;
    }>
  ): void {
    // Player-enemy collision
    if (playerState.invuln <= 0 && playerState.hp > 0) {
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = playerState.x - e.x;
        const dy = playerState.y - e.y;
        const dist = Math.hypot(dx, dy);
        const minDist = playerState.r + e.r;
        // Хитбокс корабля — кольцо: пустое ядро не смертельно.
        const inCore = dist < playerState.core;

        if (dist < minDist && !inCore) {
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
        const inCore = dist < playerState.core;

        if (dist < minDist && !inCore) {
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
   * Нити ткани пространства: враг, пересекающий нить, получает урон по времени
   * и замедляется. Нить — отрезок, поэтому проверка идёт по расстоянию
   * от врага до отрезка, а не до его точек.
   */
  private weaveCollisions(enemies: Enemy[], weaves: WeaveThread[], dt: number): void {
    if (weaves.length === 0) return;

    for (const e of enemies) {
      if (e.dead) continue;
      for (const w of weaves) {
        const dist = distanceToSegment(e.x, e.y, w.x1, w.y1, w.x2, w.y2);
        if (dist > WEAVER_HIT_RADIUS + e.r) continue;

        // Урон по времени и замедление на всё время пересечения.
        e.hp -= WEAVER_DPS * dt;
        e.flash = 1;
        e.hitCd = 0.15;
        e.slowT = WEAVER_SLOW_DURATION;

        if (e.hp <= 0) {
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
  }

  /**
   * Soft avoidance between player and companion drones.
   */
  private checkDroneAvoidance(
    playerState: { x: number; y: number; r: number; hp: number; invuln: number },
    drones: AllyDrone[]
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
