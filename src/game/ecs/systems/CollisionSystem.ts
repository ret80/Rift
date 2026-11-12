/**
 * CollisionSystem — столкновения снарядов с целями.
 *
 * Проверяет пули игрока по врагам/астероидам/якорям и вражеские снаряды
 * по игроку. Контакты тел, дроны и вражеские снаряды по дронам обрабатывает
 * отдельная ECS-система `EnemyCollisionSystem`. Сбор пикапов вынесен в ECS
 * (`PickupCollectionSystem`).
 */

import { PhasedSystem, Phase } from "../SystemSchedule";
import {
  GRAZE_BAND,
  PLAYER_BULLET_HIT_OFFSET,
} from '../../balance/player';
import type { EventBus } from '../../core/EventBus';
import type { WorldFrame } from '../../core/WorldFrame';

import {
  checkBulletCollisions,
  checkEnemyBulletVsPlayer,
} from '../../utils/BulletCollision';
import type { PlayerHitbox } from '../../utils/GrazeCollision';
import type { EcsWorld } from '..';
import type { AnchorSystem, Anchor } from './AnchorSystem';

/** Источник мирового сечения (buildWorld из GameContext). */
export type WorldSource = () => WorldFrame;

export class CollisionSystem extends PhasedSystem {
  private eventBus: EventBus;
  private ecs: EcsWorld;
  private getWorld: WorldSource;
  private anchorSystem: AnchorSystem | null;
  private onAnchorDestroyed: (anchor: Anchor) => void;

  constructor(
    eventBus: EventBus,
    ecs: EcsWorld,
    getWorld: WorldSource,
    anchorSystem: AnchorSystem | null = null,
    onAnchorDestroyed: (anchor: Anchor) => void = () => {},
  ) {
    super(Phase.Collisions);
    this.eventBus = eventBus;
    this.ecs = ecs;
    this.getWorld = getWorld;
    this.anchorSystem = anchorSystem;
    this.onAnchorDestroyed = onAnchorDestroyed;
  }

  /** Тик коллизий внутри engine.run(dt): собрать мир, применить столкновения. */
  process(): void {
    this.update(this.getWorld());
  }

  /** Обработать столкновения снарядов текущего кадра. */
  update(world: WorldFrame): void {
    const player = world.player;
    const enemies = world.enemies;
    const bullets = world.bullets;
    const enemyBullets = world.enemyBullets;
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
        if (b) this.ecs.damageEnemy(hit.enemyId, b.bullet.dmg);
      }
    }
    // Удаляем снаряды по объектной идентичности через ECS-мир.
    for (const i of bulletToRemove) {
      this.ecs.removeBullet(bullets[i]);
    }

    // === Bullet → Anchor ===
    if (this.anchorSystem) {
      const anchorToRemove = new Set<number>();
      for (let i = 0; i < bullets.length; i++) {
        const b = bullets[i];
        if (!b) continue;
        const anchor = this.anchorSystem.findAt(b.position.x, b.position.y, 4);
        if (!anchor) continue;
        const destroyed = this.anchorSystem.damage(anchor.id, b.bullet.dmg);
        anchorToRemove.add(i);
        if (destroyed) this.onAnchorDestroyed(anchor);
      }
      for (const i of anchorToRemove) {
        if (bullets[i]) this.ecs.removeBullet(bullets[i]);
      }
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
      // Метку grazed уже выставил checkEnemyBulletVsPlayer в BulletSweepComponent —
      // здесь остаётся только событие для звука/визуала.
      this.eventBus.publish('bullet_grazed', {
        count: bulletCheck.grazeIndices.length,
        x: player.position.x,
        y: player.position.y,
      });
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
