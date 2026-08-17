/**
 * BulletSystem - управление пулями игрока и врагов.
 * Отвечает за создание, обновление и удаление пуль.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import type { AudioEngine } from '../audio';

export interface BulletData {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  isEnemy: boolean;
}

export class BulletSystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioEngine;
  
  // Пули игрока
  private bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }> = [];
  // Пули врагов
  private enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }> = [];

  constructor(eventBus: EventBus, state: GameState, fx: Fx, audio: AudioEngine) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
  }

  /**
   * Создать пулю игрока.
   */
  createPlayerBullet(x: number, y: number, vx: number, vy: number, dmg: number, life: number): void {
    this.bullets.push({ x, y, vx, vy, life, dmg });
  }

  /**
    * Создать пулю врага.
    */
  createEnemyBullet(x: number, y: number, vx: number, vy: number, dmg: number, life: number, heavy: boolean = false): void {
    this.enemyBullets.push({ x, y, vx, vy, life, dmg, heavy });
  }

  /**
    * Создать пули игрока (несколько направлений).
    */
  firePlayerBullets(playerState: { x: number; y: number; angle: number; guns: number }, angle: number, bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }>): void {
    const GUN_OFFS = [0];
    const sp = 560;
    for (let i = 0; i < 3; i++) { // Макс 3 пули
      const o = GUN_OFFS[i] ?? 0;
      const nx = playerState.x + Math.cos(angle) * 14 - Math.sin(angle) * o;
      const ny = playerState.y + Math.sin(angle) * 14 + Math.cos(angle) * o;
      bullets.push({
        x: nx,
        y: ny,
        vx: Math.cos(angle) * sp,
        vy: Math.sin(angle) * sp,
        life: 1.5,
        dmg: 10,
      });
    }
  }

  /**
    * Создать пулю врага.
    */
  fireEnemyBullet(enemy: { x: number; y: number; angle: number; r: number; boltDmg: number }, enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }>): void {
    const speed = 300;
    const life = 1.35;
    const heavy = false;
    const a = enemy.angle;
    enemyBullets.push({
      x: enemy.x + Math.cos(a) * (enemy.r + 6),
      y: enemy.y + Math.sin(a) * (enemy.r + 6),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life,
      dmg: enemy.boltDmg,
      heavy,
    });
  }

  /**
    * Обновить все пули.
    */
  update(dt: number, bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }>, enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }>, enemies: Array<{ x: number; y: number; dead: boolean }>): void {
    // Обновление пуль игрока
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      
      if (b.life <= 0) {
        bullets.splice(i, 1);
      }
    }
    
    // Обновление пуль врагов
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
   * Получить все пули игрока.
   */
  getPlayerBullets(): Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }> {
    return this.bullets;
  }

  /**
   * Получить все пули врагов.
   */
  getEnemyBullets(): Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }> {
    return this.enemyBullets;
  }

  /**
   * Проверить столкновение пули с целью.
   */
  checkCollision(
    targetX: number,
    targetY: number,
    targetR: number,
    callback: (bulletIndex: number, isEnemy: boolean) => void
  ): void {
    // Проверка пуль игрока
    for (let i = 0; i < this.bullets.length; i++) {
      const b = this.bullets[i];
      const dx = b.x - targetX;
      const dy = b.y - targetY;
      const dist = Math.hypot(dx, dy);
      
      if (dist < targetR) {
        callback(i, false);
      }
    }
    
    // Проверка пуль врагов
    for (let i = 0; i < this.enemyBullets.length; i++) {
      const b = this.enemyBullets[i];
      const dx = b.x - targetX;
      const dy = b.y - targetY;
      const dist = Math.hypot(dx, dy);
      
      if (dist < targetR) {
        callback(i, true);
      }
    }
  }

  /**
   * Удалить пулю игрока по индексу.
   */
  removePlayerBullet(index: number): void {
    if (index >= 0 && index < this.bullets.length) {
      this.bullets.splice(index, 1);
    }
  }

  /**
   * Удалить пулю врага по индексу.
   */
  removeEnemyBullet(index: number): void {
    if (index >= 0 && index < this.enemyBullets.length) {
      this.enemyBullets.splice(index, 1);
    }
  }

  /**
   * Сбросить все пули.
   */
  clear(): void {
    this.bullets = [];
    this.enemyBullets = [];
  }

  /**
   * Получить количество пуль.
   */
  getCount(): { player: number; enemy: number } {
    return {
      player: this.bullets.length,
      enemy: this.enemyBullets.length,
    };
  }
}
