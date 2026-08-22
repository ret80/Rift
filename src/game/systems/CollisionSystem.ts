/**
 * CollisionSystem - обработка столкновений с учётом массы.
 * Мягкие столкновения: массивные объекты (астероиды, корабли) почти не отскакивают.
 * Импульс передаётся пропорционально массе.
 */

import { massForRadius, type AsteroidKind, EnemyKind } from '../balance';
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
  kind: EnemyKind;
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
  mass: number;
}

interface PlayerBody {
  x: number;
  y: number;
  r: number;
  hp: number;
  invuln: number;
  mass: number;
  vx: number;
  vy: number;
}

interface Asteroid {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  mass: number;
  kind: AsteroidKind;
  dead?: boolean;
}

/** Мягкое столкновение двух тел с учётом массы.
 *  Не отскакивает как мячик, а медленно меняет траекторию.
 *  impulse — сила импульса (чем больше, тем сильнее реакция).
 *  Вектор impulse направлен от центра A к центру B.
 */
function softResolveCollision(
  ax: number, ay: number, am: number, avx: number, avy: number,
  bx: number, by: number, bm: number, bvx: number, bvy: number,
  impulse: number
): { na: { vx: number; vy: number }; nb: { vx: number; vy: number } } {
  // Вектор от A к B
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy) || 0.01;
  const nx = dx / dist;
  const ny = dy / dist;

  // Относительная скорость вдоль нормали
  const dvx = avx - bvx;
  const dvy = avy - bvy;
  const dvn = dvx * nx + dvy * ny;

  // Если тела расходятся — ничего не делаем
  if (dvn <= 0) return { na: { vx: avx, vy: avy }, nb: { vx: bvx, vy: bvy } };

  const totalMass = am + bm;
  // Импульс пропорционален относительной скорости и взвешен массам
  // coefficient_of_restitution = 0.15 — очень мягкие столкновения
  const e = 0.15;
  const j = -(1 + e) * dvn / (1 / am + 1 / bm);

  const newAvx = avx + (j / am) * nx;
  const newAvy = avy + (j / am) * ny;
  const newBvx = bvx - (j / bm) * nx;
  const newBvy = bvy - (j / bm) * ny;

  // Ограничиваем максимальную передачу скорости для stability
  const maxVx = 200;
  const maxVy = 200;

  return {
    na: {
      vx: Math.max(-maxVx, Math.min(maxVx, newAvx)),
      vy: Math.max(-maxVy, Math.min(maxVy, newAvy)),
    },
    nb: {
      vx: Math.max(-maxVx, Math.min(maxVx, newBvx)),
      vy: Math.max(-maxVy, Math.min(maxVy, newBvy)),
    },
  };
}

export class CollisionSystem {
  private eventBus: EventBus;
  private state: GameState;
  private physics: PhysicsSystem | null = null;
  private onEnemyKilledCb: ((enemy: Enemy) => void) | null = null;

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
  }

  /** Set callback for enemy death events (used by PickupDropSystem) */
  setOnEnemyKilled(cb: (enemy: Enemy) => void): void {
    this.onEnemyKilledCb = cb;
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
    pickups: Array<{ x: number; y: number; r: number; kind?: string }>,
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
            this.onEnemyKilledCb?.(e);
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
            this.damageAsteroid(ai, b.dmg, b.vx, b.vy, a.x, a.y);
            break;
          }
        }
      }
      
      if (bulletHit) {
        bullets.splice(i, 1);
      }
    }

    // Проверка пуль врагов против игрока
    if (playerState.invuln <= 0 && playerState.hp > 0) {
      // Увеличенный радиус хитбокса для компенсации высокой скорости пуль.
      // При 700+ px/s пуля перелетает ~10px за кадр, поэтому добавляем ~10px к радиусу.
      const hitRadius = playerState.r + 12;
      for (let i = enemyBullets.length - 1; i >= 0; i--) {
        const b = enemyBullets[i];
        if (this.checkBulletCollision(b.x, b.y, { x: playerState.x, y: playerState.y, r: hitRadius })) {
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
    if (playerState.invuln <= 0 && playerState.hp > 0) {
      for (let ei = 0; ei < enemies.length; ei++) {
        const e = enemies[ei];
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
          // Уничтожаем врага при столкновении
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

    // Проверка столкновения игрока с астероидами (мягкое столкновение с учётом массы)
    if (playerState.invuln <= 0 && playerState.hp > 0) {
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
          
          // Мягкое столкновение: игрок (small mass) получает импульс от астероида (large mass)
          const playerMass = playerState.mass || massForRadius(playerState.r);
          const impulse = 80;
          const result = softResolveCollision(
            playerState.x, playerState.y, playerMass,
            playerState.vx || 0, playerState.vy || 0,
            a.x, a.y, a.mass, a.vx, a.vy,
            impulse
          );
          // У игрока скорость обновляется через playerSystem
          // Астероид получает малый импульс
          a.vx = result.nb.vx;
          a.vy = result.nb.vy;
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
          // Мягкое столкновение с учётом массы
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
          // Also damage enemy slightly
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

    // Столкновения астероидов между собой (мягкие, с учётом массы)
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
          // Мягкое столкновение астероидов
          const impulse = 30; // Очень мягкий импульс между астероидами
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

    // Проверка попадания вражеских пуль по дронам игрока
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      for (let j = drones.length - 1; j >= 0; j--) {
        const d = drones[j] as { x: number; y: number; r: number; hp?: number; maxHp?: number; flash?: number };
        if (this.checkBulletCollision(b.x, b.y, { x: d.x, y: d.y, r: d.r })) {
          if (d.hp != null && d.maxHp != null) {
            d.hp -= b.dmg;
            d.flash = 1;
            this.eventBus.publish('drone_hit', {
              x: d.x,
              y: d.y,
              dmg: b.dmg,
              dead: d.hp <= 0,
            });
            if (d.hp <= 0) {
              drones.splice(j, 1);
            }
          }
          enemyBullets.splice(i, 1);
          break;
        }
      }
    }
  }
  
  /**
   * Нанести урон астероиду через событие.
   */
  private damageAsteroid(index: number, dmg: number, vx: number, vy: number, x: number, y: number): void {
    this.eventBus.publish('asteroid_hit', { index, dmg, vx, vy, x, y });
  }
}
