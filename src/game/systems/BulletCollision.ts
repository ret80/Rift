/**
 * BulletCollision - handles all bullet-related collision detection.
 * Publishes events and marks targets for removal; the caller performs splicing.
 */

import type { EventBus } from '../core/EventBus';
import type { AllyDrone, Bullet, EBullet, Enemy } from '../types';
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
  bullets: Bullet[],
  enemies: Enemy[],
  asteroids: Array<{ x: number; y: number; r: number; dead?: boolean; key?: string }>,
  damageAsteroidFn: (index: number, dmg: number, vx: number, vy: number, x: number, y: number) => void
): BulletEnemyHit[] {
  const hits: BulletEnemyHit[] = [];

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let bulletHit = false;

    // Check collision with enemies
    for (const e of enemies) {
      if (e.dead) continue;

      if (bulletHits(b.x, b.y, { x: e.x, y: e.y, r: e.r })) {
        hits.push({ bulletIndex: i, enemyId: e.ecsId ?? null });
        bulletHit = true;
        break;
      }
    }

    // Check collision with asteroids
    if (!bulletHit) {
      for (let ai = 0; ai < asteroids.length; ai++) {
        const a = asteroids[ai];
        if (a.dead) continue;
        if (bulletHits(b.x, b.y, { x: a.x, y: a.y, r: a.r })) {
          bulletHit = true;
          hits.push({ bulletIndex: i, enemyId: null });
          damageAsteroidFn(ai, b.dmg, b.vx, b.vy, a.x, a.y);
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
  enemyBullets: EBullet[],
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
    const hit = segmentHitsHitbox(hitbox, b.px, b.py, b.x, b.y);
    if (hit) {
      // За кадр игрок получает не больше одного урона: первое попадание
      // засчитывается, остальные снаряды просто поглощаются.
      if (playerInvuln <= 0 && result.hitIndex < 0) {
        eventBus.publish('player_damaged', { dmg: b.dmg });
        result.hitIndex = i;
      }
      continue;
    }
    if (!b.grazed && segmentGrazesHitbox(hitbox, b.px, b.py, b.x, b.y, grazeBand)) {
      b.grazed = true;
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
  enemyBullets: EBullet[],
  drones: AllyDrone[]
): DroneHit[] {
  const hits: DroneHit[] = [];

  for (let i = enemyBullets.length - 1; i >= 0; i--) {
    const b = enemyBullets[i];
    if (!b) continue;
    for (let j = drones.length - 1; j >= 0; j--) {
      const d = drones[j];
      if (!bulletHits(b.x, b.y, { x: d.x, y: d.y, r: d.r })) continue;

      hits.push({ bulletIndex: i, droneIndex: j });
      break;
    }
  }

  return hits;
}
