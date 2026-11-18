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

/** Результат проверки вражеских снарядов против дронов. */
export interface DroneHit {
  /** Индекс снаряда в пуле вражеских снарядов. */
  bulletIndex: number;
  /** Индекс дрона в пуле дронов. */
  droneIndex: number;
}

/**
 * Check if a bullet hits a collidable target.
 *
 * Квадрат дистанции с запасом 0.1 % отсекает промахи без sqrt; для близких
 * целей решение принимает hypot, как и раньше — поведение не меняется.
 */
function bulletHits(bx: number, by: number, tx: number, ty: number, tr: number): boolean {
  const dx = bx - tx;
  const dy = by - ty;
  const reach = tr * 1.001;
  if (dx * dx + dy * dy >= reach * reach) return false;
  return Math.hypot(dx, dy) < tr;
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

      if (bulletHits(b.position.x, b.position.y, e.position.x, e.position.y, e.radius.r)) {
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
        if (bulletHits(b.position.x, b.position.y, a.position.x, a.position.y, a.radius.r)) {
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
        eventBus.publish('player_damaged', {
          dmg: b.bullet.dmg,
          source: b.bullet.cruiser ? "cruiser" : "fighter",
          // Направление на снаряд: активный щит сравнивает его с курсом.
          angle: Math.atan2(b.position.y - hitbox.y, b.position.x - hitbox.x),
        });
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
      if (!bulletHits(b.position.x, b.position.y, d.position.x, d.position.y, d.radius.r)) continue;

      hits.push({ bulletIndex: i, droneIndex: j });
      break;
    }
  }

  return hits;
}
