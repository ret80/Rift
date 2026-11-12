/**
 * EnemyCollisionSystem — игровые последствия физических контактов врагов.
 *
 * Физический слой сообщает контакты (player-enemy, player-asteroid,
 * enemy-asteroid), а эта ECS-система превращает их в урон, гибель и мягкие
 * импульсы. Столкновения снарядов с врагами/астероидами остаются в
 * `CollisionSystem`: здесь только тела и их боевые последствия.
 */

import { PhasedSystem, Phase } from "../SystemSchedule";
import { AFFIXES } from "../../balance/affixes";
import {
  ASTEROID_CONTACT_BASE,
  ASTEROID_CONTACT_CAP_FRACTION,
  ENEMY_CONTACT_CAP_FRACTION,
  dmgScale,
  impactFactor,
  massForRadius,
} from "../../balance";
import type { EventBus } from "../../core/EventBus";
import type { WorldFrame } from "../../core/WorldFrame";
import type { PhysicsSystem } from "../../physics/index";
import type { EcsWorld, AsteroidRef, EnemyRef } from "..";
import { checkEnemyBulletVsDrones } from "../../utils/BulletCollision";
import { DRONE_PROXIMITY } from "../../utils/CollisionConstants";
import { softResolveCollision } from "../../utils/EntityCollision";

/** Источник мирового сечения (buildWorld из GameWorld). */
export type EnemyCollisionWorldSource = () => WorldFrame;
/** Источник текущего номера волны. */
export type EnemyCollisionWaveSource = () => number;

export class EnemyCollisionSystem extends PhasedSystem {
  constructor(
    private readonly eventBus: EventBus,
    private readonly physics: PhysicsSystem,
    private readonly ecs: EcsWorld,
    private readonly getWorld: EnemyCollisionWorldSource,
    private readonly getWave: EnemyCollisionWaveSource,
  ) {
    super(Phase.Collisions);
  }

  /** Тик контактов тел внутри engine.run(dt). */
  process(): void {
    this.update(this.getWorld(), this.getWave());
  }

  /**
   * Игровые последствия контактов тел из физического слоя:
   * player-enemy, player-asteroid, enemy-asteroid.
   * Астероид-астероид обрабатывает AsteroidField (custom) или Planck
   * (velocities are resolved inside the backend).
   */
  private update(world: WorldFrame, wave: number): void {
    const player = world.player;
    const enemies = world.enemies;
    const asteroids = world.asteroids;
    const softImpulse = !this.physics.resolvesVelocity;
    let playerHit = false;
    /** Враги, уже получившие урон от тарана в этом кадре. */
    const rammed = new Set<EnemyRef>();

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
        (kindA === "player" && kindB === "enemy") ||
        (kindA === "enemy" && kindB === "player")
      ) {
        const enemy = kindA === "enemy" ? a : b;
        const e = enemy as EnemyRef;

        const speed = this.closingSpeed(player, e);

        // Урон игроку — не более одного раза за кадр и только не в неуязвимости.
        // Урон = контакт (роль) × dmgScale(wave) × множитель скорости удара.
        // Масса остаётся физике, contact определяет боевой характер врага.
        if (!playerHit && player.marker.invuln <= 0 && player.life.remaining > 0) {
          const contact = e.marker.contact;
          const dmg = Math.min(
            contact * dmgScale(wave) * impactFactor(speed),
            player.life.max * ENEMY_CONTACT_CAP_FRACTION,
          );
          this.eventBus.publish("player_damaged", {
            dmg,
            source: String(e.marker.kind),
          });
          if (e.marker.affix === "vampiric") {
            const lifesteal = AFFIXES.vampiric.lifesteal ?? 0;
            this.ecs.healEnemy(e.marker.ecsId ?? "", dmg * lifesteal);
          }
          playerHit = true;
        }

        // Урон врагу от тарана игрока: корпус игрока наносит урон по массе
        // и скорости сближения. Враг гибнет только если HP закончилось; иначе
        // остаётся живым, чтобы таран не был мгновенным убийством босса.
        // Ограничение по hitCd не даёт снимать HP каждый кадр при удержании
        // контакта.
        if (!e.marker.dead && enemies.includes(e) && !rammed.has(e)) {
          rammed.add(e);
          if (e.marker.hitCd <= 0) {
            const playerMass = player.marker.mass || massForRadius(player.radius.r);
            const ramDmg = playerMass * dmgScale(wave) * impactFactor(speed);
            this.ecs.damageEnemy(e.marker.ecsId ?? "", ramDmg);
            e.marker.hitCd = 0.5;
          }
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
        ((kindA === "player" && kindB === "asteroid") ||
          (kindA === "asteroid" && kindB === "player"))
      ) {
        const ast = kindA === "asteroid" ? a : b;
        const rock = ast as AsteroidRef;
        const rockIndex = asteroids.indexOf(rock);
        if (rockIndex >= 0 && !rock.marker.dead) {
          const playerMass = player.marker.mass || massForRadius(player.radius.r);
          const dgS = dmgScale(wave);
          const { position, velocity, marker } = rock;

          // Урон игроку = базовый урон по размеру × dmgScale × скорость удара.
          const impact = this.closingSpeed(player, rock);
          const asteroidDmg = Math.min(
            ASTEROID_CONTACT_BASE[marker.kind] * dgS * impactFactor(impact),
            player.life.max * ASTEROID_CONTACT_CAP_FRACTION,
          );
          this.eventBus.publish("player_damaged", {
            dmg: asteroidDmg,
            source: "asteroid",
          });
          playerHit = true;

          // Урон астероиду = масса игрока × dmgScale.
          // Идём через asteroid_hit, чтобы осколки/score/гибель обработались
          // в AsteroidField.damageAt (единый путь для пуль и столкновений).
          this.eventBus.publish("asteroid_hit", {
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
              impulse,
            );
            velocity.vx = result.nb.vx;
            velocity.vy = result.nb.vy;
          }
        }
      }

      // === enemy-asteroid: импульс + небольшой урон врагу ===
      if (
        (kindA === "enemy" && kindB === "asteroid") ||
        (kindA === "asteroid" && kindB === "enemy")
      ) {
        const enemy = kindA === "enemy" ? a : b;
        const ast = kindA === "asteroid" ? a : b;
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
            impulse,
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

    // Мягкое расталкивание и вражеские снаряды по дронам идут после
    // контактов тел — как и в прежнем едином проходе коллизий.
    this.checkDroneAvoidance(world);
    this.enemyBulletsVsDrones(world);
  }

  /** Мягкое расталкивание игрока и дронов-компаньонов. */
  private checkDroneAvoidance(world: WorldFrame): void {
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
          this.eventBus.publish("drone_push_player", {
            vx: nx * push,
            vy: ny * push,
          });
        }
      }
    }
  }

  /** Попадания вражеских снарядов по дронам: урон/гибель применяет ECS. */
  private enemyBulletsVsDrones(world: WorldFrame): void {
    const enemyBullets = world.enemyBullets;
    const drones = world.allyDrones;
    const droneHits = checkEnemyBulletVsDrones(enemyBullets, drones);
    const dronesToRemove = new Set<number>();
    const bulletsToRemove = new Set<number>();

    for (const hit of droneHits) {
      const bullet = enemyBullets[hit.bulletIndex];
      const dead = this.ecs.damageAllyDrone(drones[hit.droneIndex].marker.entityId, bullet.bullet.dmg);
      if (dead) dronesToRemove.add(hit.droneIndex);
      bulletsToRemove.add(hit.bulletIndex);
    }
    for (const i of bulletsToRemove) {
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
        dmg: b ? b.bullet.dmg : 0,
        dead: dronesToRemove.has(hit.droneIndex),
      });
    }
  }

  /**
   * Скорость сближения двух тел по нормали контакта.
   * Берём скорости до шага физики: Planck к моменту контакта уже погасил
   * импульс, и после шага сила удара была бы занижена.
   */
  private closingSpeed(
    a: { position: { x: number; y: number }; velocity: { vx: number; vy: number } },
    b: { position: { x: number; y: number }; velocity: { vx: number; vy: number } },
  ): number {
    const dx = b.position.x - a.position.x;
    const dy = b.position.y - a.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;
    const av = this.physics.getPreStepVelocity(a) ?? a.velocity;
    const bv = this.physics.getPreStepVelocity(b) ?? b.velocity;
    const rvx = bv.vx - av.vx;
    const rvy = bv.vy - av.vy;
    return Math.max(0, -(rvx * nx + rvy * ny));
  }
}
