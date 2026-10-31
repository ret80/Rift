/**
 * BulletCollision - handles all bullet-related collision detection.
 * Publishes events and marks targets for removal; the caller performs splicing.
 */

import type { EventBus } from '../core/EventBus';
import type { AsteroidRef, BulletRef, DroneRef, EnemyBulletRef, EnemyRef } from '../ecs';
import {
  segmentGrazesHitbox,
  segmentHitsHitbox,
  type EnemyBulletCheck,
  type PlayerHitbox,
} from './GrazeCollision';

/** A collidable target with position and radius. */
interface Collidable {
  x: number;
  y: number;
  r: number;
}

/** Результат проверки вражеских снарядов против дронов. */
export interface DroneHit {
  /** Индекс снаряда в пуле вражеских снарядов. */
  bulletIndex: number;
  /** Индекс дрона в пуле дронов. */
  droneIndex: number;
}

/**
 * Check if a bullet hits a collidable target.
 */
function bulletHits(bx: number, by: number, target: Collidable): boolean {
  const dx = bx - target.x;
  const dy = by - target.y;
  const dist = Math.hypot(dx, dy);
  return dist < target.r;
}

/**
 * Check player bullets against enemies and asteroids.
 * Детектирует попадания, но НЕ мутирует врага/астероид — урон/смерть
 * применяет вызывающая сторона через единый канонический путь (ecs.damageEnemy).
 * Returns bullet indices and which enemy each hit bullet struck.
 */
export interface BulletEnemyHit {
  bulletIndex: number;
  /** EntityRef-идентификатор задетого врага (или null, если это астероид). */
  enemyId: number | string | null;
}

export function checkBulletCollisions(
  bullets: BulletRef[],
  enemies: EnemyRef[],
  asteroids: AsteroidRef[],
  damageAsteroidFn: (index: number, dmg: number, vx: number, vy: number, x: number, y: number) => void
): BulletEnemyHit[] {
  const hits: BulletEnemyHit[] = [];

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let bulletHit = false;

    // Check collision with enemies
    for (const e of enemies) {
      if (e.marker.dead) continue;

      if (bulletHits(b.position.x, b.position.y, { x: e.position.x, y: e.position.y, r: e.radius.r })) {
        hits.push({ bulletIndex: i, enemyId: e.marker.ecsId ?? null });
        bulletHit = true;
        break;
      }
    }

    // Check collision with asteroids (базовые компоненты через AsteroidRef)
    if (!bulletHit) {
      for (let ai = 0; ai < asteroids.length; ai++) {
        const a = asteroids[ai];
        if (a.marker.dead) continue;
        if (bulletHits(b.position.x, b.position.y, { x: a.position.x, y: a.position.y, r: a.radius.r })) {
          bulletHit = true;
          hits.push({ bulletIndex: i, enemyId: null });
          damageAsteroidFn(ai, b.bullet.dmg, b.velocity.vx, b.velocity.vy, a.position.x, a.position.y);
          break;
        }
      }
    }
  }

  return hits;
}

/**
 * Проверка вражеских снарядов против игрока.
 * Возвращает индекс попавшего снаряда и индексы засчитанных касаний.
 *
 * Попадание и касание считаются по отрезку движения снаряда, поэтому
 * быстрый снаряд не может «проскочить» сквозь корабль между кадрами.
 */
export function checkEnemyBulletVsPlayer(
  eventBus: EventBus,
  enemyBullets: EnemyBulletRef[],
  hitbox: PlayerHitbox,
  playerInvuln: number,
  playerHp: number,
  grazeBand: number
): EnemyBulletCheck {
  const result: EnemyBulletCheck = { hitIndex: -1, grazeIndices: [] };
  if (playerHp <= 0) return result;

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    if (!b) continue;
    const { px, py } = b.sweep;
    const hit = segmentHitsHitbox(hitbox, px, py, b.position.x, b.position.y);
    if (hit) {
      // За кадр игрок получает не больше одного урона: первое попадание
      // засчитывается, остальные снаряды просто поглощаются.
      if (playerInvuln <= 0 && result.hitIndex < 0) {
        eventBus.publish('player_damaged', { dmg: b.bullet.dmg });
        result.hitIndex = i;
      }
      continue;
    }
    if (!b.sweep.grazed && segmentGrazesHitbox(hitbox, px, py, b.position.x, b.position.y, grazeBand)) {
      b.sweep.grazed = true;
      result.grazeIndices.push(i);
    }
  }
  return result;
}

/**
 * Check enemy bullets against drones.
 * Дрон теряет корпус от попаданий и погибает только когда HP кончились.
 * Returns the list of hits; the caller removes bullets and dead drones.
 */
export function checkEnemyBulletVsDrones(
  enemyBullets: EnemyBulletRef[],
  drones: DroneRef[]
): DroneHit[] {
  const hits: DroneHit[] = [];

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    if (!b) continue;
    for (let j = drones.length - 1; j >= 0; j--) {
      const d = drones[j];
      if (!bulletHits(b.position.x, b.position.y, { x: d.position.x, y: d.position.y, r: d.radius.r })) continue;

      hits.push({ bulletIndex: i, droneIndex: j });
      break;
    }
  }

  return hits;
}
