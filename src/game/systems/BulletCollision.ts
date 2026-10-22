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

/** Попадание снаряда врага в дрона. */
export interface DroneHit {
  /** Индекс снаряда в пуле вражеских снарядов. */
  bulletIndex: number;
  /** Индекс дрона в пуле дронов. */
  droneIndex: number;
  /** Дрон погиб и должен быть удалён. */
  killed: boolean;
}

/** Результат столкновения твёрдых снарядов игрока с вражескими. */
export interface BulletInterception {
  /** Индексы снарядов игрока, израсходованных на перехват. */
  playerBullets: number[];
  /** Индексы перехваченных вражеских снарядов. */
  enemyBullets: number[];
  /** Число перехватов — по нему начисляются очки. */
  count: number;
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
 * Returns indices of bullets to remove.
 */
export function checkBulletCollisions(
  eventBus: EventBus,
  bullets: Bullet[],
  enemies: Enemy[],
  asteroids: Array<{ x: number; y: number; r: number; dead?: boolean }>,
  damageAsteroidFn: (index: number, dmg: number, vx: number, vy: number, x: number, y: number) => void
): Set<number> {
  const toRemove = new Set<number>();

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    let bulletHit = false;

    // Check collision with enemies
    for (const e of enemies) {
      if (e.dead) continue;

      if (bulletHits(b.x, b.y, { x: e.x, y: e.y, r: e.r })) {
        e.hp -= b.dmg;
        e.flash = 1;
        e.hitCd = 0.15;
        bulletHit = true;

        if (e.hp <= 0) {
          e.dead = true;
          eventBus.publish('enemy_killed', {
            score: e.score,
            kind: e.kind,
            x: e.x,
            y: e.y,
            seed: e.seed,
          });
        }
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
          damageAsteroidFn(ai, b.dmg, b.vx, b.vy, a.x, a.y);
          break;
        }
      }
    }

    if (bulletHit) {
      toRemove.add(i);
    }
  }

  return toRemove;
}

/**
 * Check enemy bullets against the player.
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
 * Столкновение твёрдых снарядов игрока с вражескими снарядами.
 *
 * Твёрдый снаряд игрока (с радиусом) гасит вражеский снаряд: оба исчезают,
 * игрок получает очки. Бестелесные снаряды (без радиуса) в столкновении
 * не участвуют.
 */
export function checkBulletInterceptions(
  bullets: Bullet[],
  enemyBullets: EBullet[]
): BulletInterception {
  const result: BulletInterception = { playerBullets: [], enemyBullets: [], count: 0 };

  for (let i = bullets.length - 1; i >= 0; i--) {
    const b = bullets[i];
    if (!b.r || b.r <= 0) continue;

    for (let j = enemyBullets.length - 1; j >= 0; j--) {
      const eb = enemyBullets[j];
      const dx = b.x - eb.x;
      const dy = b.y - eb.y;
      const reach = b.r + eb.r;
      if (dx * dx + dy * dy > reach * reach) continue;

      result.playerBullets.push(i);
      result.enemyBullets.push(j);
      result.count++;
      break;
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
  eventBus: EventBus,
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

      d.hp -= b.dmg;
      d.flash = 1;
      const killed = d.hp <= 0;
      eventBus.publish('drone_hit', {
        x: d.x,
        y: d.y,
        dmg: b.dmg,
        dead: killed,
      });
      hits.push({ bulletIndex: i, droneIndex: j, killed });
      break;
    }
  }

  return hits;
}
