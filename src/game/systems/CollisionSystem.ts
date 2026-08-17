/**
 * CollisionSystem - обработка столкновений с использованием PhysicsSystem.
 * Отвечает за проверку и обработку коллизий между объектами через kinetics.ts.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { PhysicsSystem } from '../core/PhysicsSystem';

interface Collidable {
  x: number;
  y: number;
  r: number;
}

interface Enemy {
  x: number;
  y: number;
  r: number;
  dead: boolean;
  hp: number;
  kind: string;
  seed: number;
  flash: number;
  hitCd: number;
  spawnCd: number;
  parent: any;
  maxHp: number;
  score: number;
  vx: number;
  vy: number;
  boltDmg: number;
  angle: number;
  mode: number;
  modeT: number;
  speed: number;
  contact: number;
  strafeDir: number;
  fireCd: number;
}

interface PlayerBody {
  x: number;
  y: number;
  r: number;
  hp: number;
  invuln: number;
}

interface Asteroid {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  dead?: boolean;
}

export class CollisionSystem {
  private eventBus: EventBus;
  private state: GameState;
  private physics: PhysicsSystem | null = null;

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
  }

  setPhysicsSystem(physics: PhysicsSystem): void {
    this.physics = physics;
  }

  /**
   * Проверить столкновение пули с целью.
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
   * Обновить коллизии между всеми объектами.
   */
  update(
    dt: number,
    playerState: PlayerBody,
    enemies: Enemy[],
    bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }>,
    enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }>,
    pickups: Array<{ x: number; y: number; r: number }>,
    mines: Array<{ x: number; y: number; r: number }>,
    drones: Array<{ x: number; y: number; r: number }>,
    asteroids: Asteroid[] = []
  ): void {
    // Проверка пуль игрока против врагов
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      let bulletHit = false;
      
      // Check collision with enemies
      for (const e of enemies) {
        if (e.dead) continue;
        
        if (this.checkBulletCollision(b.x, b.y, { x: e.x, y: e.y, r: e.r })) {
          // Нанести урон врагу
          e.hp -= b.dmg;
          e.flash = 1;
          e.hitCd = 0.15;
          bulletHit = true;
          
          if (e.hp <= 0) {
            e.dead = true;
            this.eventBus.publish('enemy_killed', {
              scoreValue: e.score,
              kind: e.kind,
              x: e.x,
              y: e.y,
            });
          }
          break; // пуля попала в одного врага
        }
      }
      
      // Check collision with asteroids
      if (!bulletHit) {
        for (let ai = 0; ai < asteroids.length; ai++) {
          const a = asteroids[ai];
          if (a.dead) continue;
          if (this.checkBulletCollision(b.x, b.y, { x: a.x, y: a.y, r: a.r })) {
            bulletHit = true;
            // Damage asteroid using the damageAt method
            this.damageAsteroid(ai, b.dmg, b.vx, b.vy);
            break;
          }
        }
      }
      
      if (bulletHit) {
        bullets.splice(i, 1);
      }
    }

    // Проверка пуль врагов против игрока
    if (playerState.invuln <= 0) {
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        if (this.checkBulletCollision(b.x, b.y, playerState)) {
          this.eventBus.publish('player_hit', {
            dmg: b.dmg,
            x: playerState.x,
            y: playerState.y,
          });
          enemyBullets.splice(i, 1);
          break;
        }
      }
    }

    // Проверка столкновения игрока с врагами
    if (playerState.invuln <= 0) {
      for (const e of enemies) {
        if (e.dead) continue;
        const dx = playerState.x - e.x;
        const dy = playerState.y - e.y;
        const dist = Math.hypot(dx, dy);
        const minDist = playerState.r + e.r;
        
        if (dist < minDist) {
          this.eventBus.publish('player_hit', {
            dmg: e.contact,
            x: e.x,
            y: e.y,
          });
          break;
        }
      }
    }

    // Проверка столкновения игрока с астероидами
    if (playerState.invuln <= 0) {
      for (const a of asteroids) {
        if (a.dead) continue;
        const dx = playerState.x - a.x;
        const dy = playerState.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = playerState.r + a.r;
        
        if (dist < minDist) {
          this.eventBus.publish('player_hit', {
            dmg: 20,
            x: a.x,
            y: a.y,
          });
          // Push asteroid away
          const pushX = dx / (dist || 1);
          const pushY = dy / (dist || 1);
          a.vx += pushX * 100;
          a.vy += pushY * 100;
          break;
        }
      }
    }

    // Проверка столкновения врагов с астероидами (враги не сталкиваются друг с другом)
    for (const e of enemies) {
      if (e.dead) continue;
      for (const a of asteroids) {
        if (a.dead) continue;
        const dx = e.x - a.x;
        const dy = e.y - a.y;
        const dist = Math.hypot(dx, dy);
        const minDist = e.r + a.r;
        
        if (dist < minDist) {
          // Push enemy away from asteroid
          const pushX = dx / (dist || 1);
          const pushY = dy / (dist || 1);
          e.vx += pushX * 50;
          e.vy += pushY * 50;
          // Also damage enemy slightly
          e.hp -= 1;
          if (e.hp <= 0) {
            e.dead = true;
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

    // Проверка подбора бонусов игроком
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i] as { x: number; y: number; r: number; kind?: string };
      const dx = playerState.x - p.x;
      const dy = playerState.y - p.y;
      const dist = Math.hypot(dx, dy);
      if (dist < playerState.r + p.r) {
        this.eventBus.publish('pickup_collected', {
          kind: p.kind || 'unknown',
          x: p.x,
          y: p.y,
        });
        pickups.splice(i, 1);
      }
    }
  }
  
  /**
   * Нанести урон астероиду через событие.
   */
  private damageAsteroid(index: number, dmg: number, vx: number, vy: number): void {
    this.eventBus.publish('asteroid_hit', { index, dmg, vx, vy });
  }
}
