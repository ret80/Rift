/**
 * BulletSystem - player and enemy bullet management.
 * Responsible for bullet lifecycle: creation, movement, and cleanup.
 *
 * Authoritative owner: entityPool arrays (bulletList, enemyBulletList).
 * BulletSystem processes these arrays but does NOT own them.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import type { AudioManager } from './AudioManager';
import {
  PLAYER_BULLET_SPEED,
  PLAYER_BULLET_LIFE,
  PLAYER_BULLET_DMG,
  GUN_OFFS,
} from '../balance';

// Enemy bullet balance constants
const ENEMY_BULLET_SPEED = 300;
const ENEMY_BULLET_LIFE = 1.35;

export interface PlayerBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
}

export interface EnemyBullet extends PlayerBullet {
  heavy?: boolean;
  cruiser?: boolean;
}

export interface PlayerBulletState {
  x: number;
  y: number;
  angle: number;
  guns: number;
  accuracy?: number;
}

export interface EnemyBulletState {
  x: number;
  y: number;
  angle: number;
  r: number;
  boltDmg: number;
}

export class BulletSystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioManager;
  private bulletDmg: number = PLAYER_BULLET_DMG;

  constructor(eventBus: EventBus, state: GameState, fx: Fx, audio: AudioManager) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
  }

  /** Set player bullet damage (from upgrades) */
  setBulletDmg(dmg: number): void {
    this.bulletDmg = dmg;
  }

  // ── Public API ──────────────────────────────────────────────────

  /**
   * Update all bullets (movement + lifetime cleanup).
   * Mutates the passed arrays — these are owned by entityPool.
   */
   update(
     dt: number,
     bullets: PlayerBullet[],
     enemyBullets: EnemyBullet[],
     _enemies: Array<{ x: number; y: number; dead: boolean }>
   ): void {
    // Update player bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) {
        bullets.splice(i, 1);
      }
    }

    // Update enemy bullets
    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) {
        enemyBullets.splice(i, 1);
      }
    }
  }

  /**
   * Create player bullets in multiple directions.
   * Spread/accuracy follows enemy pattern: random angle deviation.
   */
  firePlayerBullets(
    playerState: PlayerBulletState,
    angle: number,
    bullets: Array<{
      x: number; y: number; vx: number; vy: number;
      life: number; dmg: number;
    }>
  ): void {
    const sp = PLAYER_BULLET_SPEED;
    // Player gun accuracy: accuracy ~0.98 → spread ≈ 0.006 rad (~0.34°)
    // Can be improved with upgrades to 0.99-1.0 (spread → 0)
    const accuracy = playerState.accuracy ?? 0.98;
    const spread = (1 - accuracy) * 0.3; // same as enemies: (1 - acc) * factor
    const bulletAngle = angle + (Math.random() - 0.5) * 2 * spread;
    const gunCount = Math.min(playerState.guns ?? 1, GUN_OFFS.length);

    for (let i = 0; i < gunCount; i++) {
      const o = GUN_OFFS[i] ?? 0;
      const nx = playerState.x + Math.cos(angle) * 14 - Math.sin(angle) * o;
      const ny = playerState.y + Math.sin(angle) * 14 + Math.cos(angle) * o;
      bullets.push({
        x: nx,
        y: ny,
        vx: Math.cos(bulletAngle) * sp,
        vy: Math.sin(bulletAngle) * sp,
        life: PLAYER_BULLET_LIFE,
        dmg: this.bulletDmg,
      });
    }
  }

  /**
   * Create enemy bullet and push to external array.
   */
  fireEnemyBullet(
    enemy: EnemyBulletState,
    enemyBullets: EnemyBullet[]
  ): void {
    const a = enemy.angle;
    enemyBullets.push({
      x: enemy.x + Math.cos(a) * (enemy.r + 6),
      y: enemy.y + Math.sin(a) * (enemy.r + 6),
      vx: Math.cos(a) * ENEMY_BULLET_SPEED,
      vy: Math.sin(a) * ENEMY_BULLET_SPEED,
      life: ENEMY_BULLET_LIFE,
      dmg: enemy.boltDmg,
      heavy: false,
      cruiser: false,
    });
  }

  /**
   * Check bullet collision with target.
   * Callback receives only the bullet — index is caller's responsibility.
   */
  checkCollision(
    targetX: number,
    targetY: number,
    targetR: number,
    callback: (
      bullet: { x: number; y: number; vx: number; vy: number; life: number; dmg: number }
    ) => void
  ): void {
    // This method exists for backwards compatibility;
    // actual collision detection is done by CollisionSystem.
    void targetX;
    void targetY;
    void targetR;
    void callback;
  }

  /**
   * Clear all bullets.
   */
  clear(_bullets: Array<unknown>, _enemyBullets: Array<unknown>): void {
    // No-op — bullets are owned by entityPool
  }

  /**
   * Get bullet counts (from entityPool — passed as args).
   */
  getCount(bullets: Array<unknown>, enemyBullets: Array<unknown>): { player: number; enemy: number } {
    return {
      player: bullets.length,
      enemy: enemyBullets.length,
    };
  }
}
