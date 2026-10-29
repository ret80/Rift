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

import { System } from "@trixt0r/ecs";
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
import type { EcsWorld, AsteroidRef, EnemyRef } from '../ecs';

/** Источник мирового сечения (buildWorld из GameContext). */
export type WorldSource = () => WorldFrame;
/** Источник текущего номера волны. */
export type WaveSource = () => number;

export class CollisionSystem extends System {
  private eventBus: EventBus;
  private physics: PhysicsSystem;
  private ecs: EcsWorld;
  private getWorld: WorldSource;
  private getWave: WaveSource;

  constructor(
    eventBus: EventBus,
    physics: PhysicsSystem,
    ecs: EcsWorld,
    getWorld: WorldSource,
    getWave: WaveSource,
  ) {
    super(7); // после физики (6): контакты уже собраны; до zone/spawn
    this.eventBus = eventBus;
    this.physics = physics;
    this.ecs = ecs;
    this.getWorld = getWorld;
    this.getWave = getWave;
  }

  /** Тик коллизий внутри engine.run(dt): собрать мир, применить столкновения. */
  process(dt: number): void {
    this.update(dt, this.getWorld(), this.getWave());
  }

  /**
   * Update all collisions between objects.
   * @param wave — номер текущей волны (для масштабирования урона dmgScale).
   */
  update(dt: number, world: WorldFrame, wave: number): void {
    const player = world.player;
    const enemies = world.enemies;
    const bullets = world.bullets;
    const enemyBullets = world.enemyBullets;
    const drones = world.allyDrones;
    const asteroids = world.asteroids;

    // === Bullet collisions ===
    const bulletHits = checkBulletCollisions(
      bullets, enemies, asteroids,
      this.damageAsteroid.bind(this)
    );
    // Урон/смерть врага — единый канонический путь через ECS-мир.
    const bulletToRemove = new Set<number>();
    for (const hit of bulletHits) {
      bulletToRemove.add(hit.bulletIndex);
      if (hit.enemyId !== null) {
        const b = bullets[hit.bulletIndex];
        if (b) this.ecs.damageEnemy(hit.enemyId, b.dmg);
      }
    }
    // Удаляем снаряды по объектной идентичности через ECS-мир.
    for (const i of bulletToRemove) {
      this.ecs.removeBullet(bullets[i]);
    }

    // Enemy bullet → player (попадание и касание считаются одним проходом)
    const hitbox: PlayerHitbox = {
      x: player.position.x,
      y: player.position.y,
      outer: player.radius.r + PLAYER_BULLET_HIT_OFFSET,
    };
    const bulletCheck = checkEnemyBulletVsPlayer(
      this.eventBus, enemyBullets, hitbox,
      player.marker.invuln, player.life.remaining, GRAZE_BAND
    );
    if (bulletCheck.hitIndex >= 0) {
      this.ecs.removeEnemyBullet(enemyBullets[bulletCheck.hitIndex]);
    }
    if (bulletCheck.grazeIndices.length > 0) {
      // Обновляем метку grazed в компоненте, чтобы один и тот же снаряд не
      // считался касанием повторно (источник правды — BulletSweepComponent).
      for (const idx of bulletCheck.grazeIndices) {
        const eb = enemyBullets[idx];
        if (eb) this.ecs.markEnemyBulletGrazed(eb.entityId);
      }
      this.eventBus.publish('bullet_grazed', {
        count: bulletCheck.grazeIndices.length,
        x: player.position.x,
        y: player.position.y,
      });
    }

    // === Entity-entity collisions (из физического слоя) ===
    this.entityCollisions(world, wave);
    // === Drone-player avoidance ===
    this.checkDroneAvoidance(world);

    // === Enemy bullet → drones (детекция; урон/смерть применяем в ECS) ===
    const droneHits = checkEnemyBulletVsDrones(enemyBullets, drones);
    const dronesToRemove = new Set<number>();
    const bulletToRemoveNow = new Set<number>();
    for (const hit of droneHits) {
      const b = enemyBullets[hit.bulletIndex];
      const dead = this.ecs.damageAllyDrone(drones[hit.droneIndex].marker.entityId, b.dmg);
      if (dead) dronesToRemove.add(hit.droneIndex);
      bulletToRemoveNow.add(hit.bulletIndex);
    }
    for (const i of bulletToRemoveNow) {
      if (enemyBullets[i]) this.ecs.removeEnemyBullet(enemyBullets[i]);
    }
    // Дроны хранятся в ECS-мире — удаляем по EntityRef-идентификатору.
    for (const i of dronesToRemove) {
      this.ecs.removeAllyDroneById(drones[i].marker.entityId);
    }
    // Публикуем факт попадания по дрону (звуковой/визуальный фидбек).
    for (const hit of droneHits) {
      const d = drones[hit.droneIndex];
      const b = enemyBullets[hit.bulletIndex];
      this.eventBus.publish("drone_hit", {
        x: d.position.x,
        y: d.position.y,
        dmg: b ? b.dmg : 0,
        dead: dronesToRemove.has(hit.droneIndex),
      });
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
    const player = world.player;
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
        const e = enemy as EnemyRef;

        // Урон игроку — не более одного раза за кадр и только не в неуязвимости.
        // По формуле урон = масса врага × dmgScale(wave).
        if (!playerHit && player.marker.invuln <= 0 && player.life.remaining > 0) {
          const dmg = (e.marker.mass || massForRadius(e.radius.r)) * dmgScale(wave);
          this.eventBus.publish('player_damaged', {
            dmg,
          });
          playerHit = true;
        }

        // Каждый врезавшийся враг гибнет сразу, даже если их несколько.
        if (!e.marker.dead && enemies.includes(e)) {
          this.ecs.damageEnemy(e.marker.ecsId ?? "", e.life.remaining);
        }
      }

      // === player-asteroid: взаимный урон + мягкий импульс в custom-физике ===
      // Игрок получает урон = масса астероида × dmgScale(wave);
      // астероид получает урон = масса игрока × dmgScale(wave) и при
      // hp <= 0 уничтожается через канонический путь asteroid_hit.
      if (
        !playerHit &&
        player.marker.invuln <= 0 &&
        player.life.remaining > 0 &&
        ((kindA === 'player' && kindB === 'asteroid') || (kindA === 'asteroid' && kindB === 'player'))
      ) {
        const ast = kindA === 'asteroid' ? a : b;
        const rock = ast as AsteroidRef;
        const rockIndex = asteroids.indexOf(rock);
        if (rockIndex >= 0 && !rock.marker.dead) {
          const playerMass = player.marker.mass || massForRadius(player.radius.r);
          const dgS = dmgScale(wave);
          const { position, velocity, marker } = rock;

          // Урон игроку = масса астероида × dmgScale.
          this.eventBus.publish('player_damaged', {
            dmg: marker.mass * dgS,
          });
          playerHit = true;

          // Урон астероиду = масса игрока × dmgScale.
          // Идём через asteroid_hit, чтобы осколки/score/гибель обработались
          // в AsteroidField.damageAt (единый путь для пуль и столкновений).
          this.eventBus.publish('asteroid_hit', {
            index: rockIndex,
            dmg: playerMass * dgS,
            x: position.x,
            y: position.y,
            vx: velocity.vx,
            vy: velocity.vy,
          });

          if (softImpulse) {
            const impulse = 80;
            const result = softResolveCollision(
              player.position.x, player.position.y, playerMass,
              player.velocity.vx, player.velocity.vy,
              position.x, position.y, marker.mass, velocity.vx, velocity.vy,
              impulse
            );
            velocity.vx = result.nb.vx;
            velocity.vy = result.nb.vy;
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
        const e = enemy as EnemyRef;
        const rock = ast as AsteroidRef;
        if (e.marker.dead || !enemies.includes(e)) continue;
        if (rock.marker.dead || !asteroids.includes(rock)) continue;
        const { position, velocity, marker } = rock;

        if (softImpulse) {
          const enemyMass = e.marker.mass || massForRadius(e.radius.r);
          const impulse = 60;
          const result = softResolveCollision(
            e.position.x, e.position.y, enemyMass,
            e.velocity.vx, e.velocity.vy,
            position.x, position.y, marker.mass, velocity.vx, velocity.vy,
            impulse
          );
          e.velocity.vx = result.na.vx;
          e.velocity.vy = result.na.vy;
          velocity.vx = result.nb.vx;
          velocity.vy = result.nb.vy;
        }
        // Урон/смерть врага — единый канонический путь через ECS-мир.
        this.ecs.damageEnemy(e.marker.ecsId ?? "", 1);
      }
    }
  }

  /**
   * Soft avoidance between player and companion drones.
   */
  private checkDroneAvoidance(
    world: WorldFrame
  ): void {
    const player = world.player;
    const drones = world.allyDrones;
    if (player.marker.invuln <= 0 && player.life.remaining > 0) {
      for (const d of drones) {
        const dx = d.position.x - player.position.x;
        const dy = d.position.y - player.position.y;
        const dist = Math.hypot(dx, dy);
        const minDist = DRONE_PROXIMITY + player.radius.r;

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