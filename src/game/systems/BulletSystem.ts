/**
 * BulletSystem - управление пулями игрока и врагов.
 * Отвечает за создание, обновление и удаление пуль.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';

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
  
  // Пули игрока
  private bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }> = [];
  // Пули врагов
  private enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }> = [];

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
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
   * Обновить все пули.
   */
  update(dt: number): void {
    // Обновление пуль игрока
    for (let i = this.bullets.length - 1; i >= 0; i--) {
      const b = this.bullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      
      if (b.life <= 0) {
        this.bullets.splice(i, 1);
      }
    }
    
    // Обновление пуль врагов
    for (let i = this.enemyBullets.length - 1; i >= 0; i--) {
      const b = this.enemyBullets[i];
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      
      if (b.life <= 0) {
        this.enemyBullets.splice(i, 1);
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
