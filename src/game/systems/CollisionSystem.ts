/**
 * CollisionSystem - collision handling with mass awareness.
 * Composes BulletCollision, EntityCollision, and drone avoidance.
 *
 * Физические контакты тел (игрок/враги/астероиды) поступают из
 * PhysicsSystem: бэкенд CustomCurrentPhysics сохраняет прежние мягкие
 * импульсы, PlanckPhysics решает скорости сам, поэтому здесь остаются
 * только игровые последствия контакта (урон, гибель врага).
 * Сбор пикапов вынесен в ECS (PickupCollectionSystem).
 */

import { massForRadius, dmgScale } from '../balance';
import {
  GRAZE_BAND,
  PLAYER_BULLET_HIT_OFFSET,
} from '../balance/player';
import type { EventBus } from '../core/EventBus';
import type { WorldFrame } from '../core/WorldFrame';
import type { PhysicsSystem } from '../physics/index';

import { DRONE_PROXIMITY } from './CollisionConstants';
import { softResolveCollision } from './EntityCollision';
import {
  checkBulletCollisions,
  checkEnemyBulletVsPlayer,
  checkEnemyBulletVsDrones,
} from './BulletCollision';
import type { PlayerHitbox } from './GrazeCollision';
import type { EcsWorld } from '../ecs';

export class CollisionSystem {
  private eventBus: EventBus;
  private physics: PhysicsSystem;
  private ecs: EcsWorld;

  constructor(eventBus: EventBus, physics: PhysicsSystem, ecs: EcsWorld) {
    this.eventBus = eventBus;
    this.physics = physics;
    this.ecs = ecs;
  }

  /**
   * Update all collisions between objects.
   * @param wave — номер текущей волны (для масштабирования урона dmgScale).
   */
  update(dt: number, world: WorldFrame, wave: number): void {
    const playerState = world.player;
    const enemies = world.enemies;
    const bullets = world.bullets;
    const enemyBullets = world.enemyBullets;
    const drones = world.allyDrones;
    const asteroids = world.asteroids;

    // === Bullet collisions ===
    const bulletToRemove = checkBulletCollisions(
      this.eventBus, bullets, enemies, asteroids,
      this.damageAsteroid.bind(this)
    );
    // Удаляем снаряды по объектной идентичности через ECS-мир.
    for (const i of bulletToRemove) {
      this.ecs.removeBullet(bullets[i]);
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
      this.ecs.removeEnemyBullet(enemyBullets[bulletCheck.hitIndex]);
    }
    if (bulletCheck.grazeIndices.length > 0) {
      this.eventBus.publish('bullet_grazed', {
        count: bulletCheck.grazeIndices.length,
        x: playerState.x,
        y: playerState.y,
      });
    }

    // === Entity-entity collisions (из физического слоя) ===
    this.entityCollisions(world, wave);
    // === Drone-player avoidance ===
    this.checkDroneAvoidance(world);

    // === Enemy bullet → drones ===
    const droneHits = checkEnemyBulletVsDrones(this.eventBus, enemyBullets, drones);
    const dronesToRemove = new Set<number>();
    for (const hit of droneHits) {
      this.ecs.removeEnemyBullet(enemyBullets[hit.bulletIndex]);
      if (hit.killed) dronesToRemove.add(hit.droneIndex);
    }
    // Дроны хранятся в ECS-мире — удаляем по объектной идентичности.
    for (const i of dronesToRemove) {
      this.ecs.removeAllyDrone(drones[i]);
    }
  }

  /**
   * Игровые последствия контактов тел из физического слоя:
   * player-enemy, player-asteroid, enemy-asteroid.
   * Астероид-астероид обрабатывает AsteroidField (custom) или Planck
   * (velocities are resolved inside the backend).
   */
  private entityCollisions(
    world: WorldFrame,
    wave: number
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

      // === player-enemy: урон игроку и гибель ВСЕХ врезавшихся врагов ===
      // Гибель врага НЕ зависит от playerHit/invuln — это гейты урона игроку.
      // Иначе при нескольких одновременных столкновениях обрабатывался бы
      // только первый контакт, а остальные враги «висели» бы на корабле до
      // конца неуязвимости и умирали бы по одному с задержкой ~0.6с.
      if (
        (kindA === 'player' && kindB === 'enemy') ||
        (kindA === 'enemy' && kindB === 'player')
      ) {
        const enemy = kindA === 'enemy' ? a : b;
        const e = enemy as (typeof enemies)[number];

        // Урон игроку — не более одного раза за кадр и только не в неуязвимости.
        // По формуле урон = масса врага × dmgScale(wave).
        if (!playerHit && playerState.invuln <= 0 && playerState.hp > 0) {
          const dmg = (e.mass || massForRadius(e.r)) * dmgScale(wave);
          this.eventBus.publish('player_damaged', {
            dmg,
          });
          playerHit = true;
        }

        // Каждый врезавшийся враг гибнет сразу, даже если их несколько.
        if (!e.dead && enemies.includes(e)) {
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

      // === player-asteroid: взаимный урон + мягкий импульс в custom-физике ===
      // Игрок получает урон = масса астероида × dmgScale(wave);
      // астероид получает урон = масса игрока × dmgScale(wave) и при
      // hp <= 0 уничтожается через канонический путь asteroid_hit.
      if (
        !playerHit &&
        playerState.invuln <= 0 &&
        playerState.hp > 0 &&
        ((kindA === 'player' && kindB === 'asteroid') || (kindA === 'asteroid' && kindB === 'player'))
      ) {
        const ast = kindA === 'asteroid' ? a : b;
        const rock = ast as (typeof asteroids)[number];
        const rockIndex = asteroids.indexOf(rock);
        if (rockIndex >= 0 && !rock.dead) {
          const playerMass = playerState.mass || massForRadius(playerState.r);
          const dgS = dmgScale(wave);

          // Урон игроку = масса астероида × dmgScale.
          this.eventBus.publish('player_damaged', {
            dmg: rock.mass * dgS,
          });
          playerHit = true;

          // Урон астероиду = масса игрока × dmgScale.
          // Идём через asteroid_hit, чтобы осколки/score/гибель обработались
          // в AsteroidField.damageAt (единый путь для пуль и столкновений).
          this.eventBus.publish('asteroid_hit', {
            index: rockIndex,
            dmg: playerMass * dgS,
            x: rock.x,
            y: rock.y,
            vx: rock.vx,
            vy: rock.vy,
          });

          if (softImpulse) {
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