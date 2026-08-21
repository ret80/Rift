/**
 * BulletSystem - управление пулями игрока и врагов.
 * Отвечает за создание, обновление и удаление пуль.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import type { AudioEngine } from '../audio';
import { PLAYER_BULLET_SPEED } from '../balance';

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
  private bulletDmg: number = 14;  // bullet damage, set by game when upgrades are applied
  
  // Пули игрока
  private bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }> = [];
  // Пули врагов
  private enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean; cruiser: boolean }> = [];

  constructor(eventBus: EventBus, state: GameState, fx: Fx, audio: AudioEngine) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
  }

  /** Установить урон пуль игрока (из апгрейдов) */
  setBulletDmg(dmg: number): void {
    this.bulletDmg = dmg;
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
  createEnemyBullet(x: number, y: number, vx: number, vy: number, dmg: number, life: number, heavy: boolean = false, cruiser: boolean = false): void {
    this.enemyBullets.push({ x, y, vx, vy, life, dmg, heavy, cruiser });
  }

  /**
    * Создать пули игрока (несколько направлений).
    * Spread/accuracy — как у орудий врагов: случайное отклонение угла.
    */
  firePlayerBullets(playerState: { x: number; y: number; angle: number; guns: number; accuracy?: number }, angle: number, bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }>): void {
    const GUN_OFFS = [0, 9, -9, 17, -17];
    const sp = 560;
    // Точность пушки игрока: accuracy ~0.98 → spread ≈ 0.006 рад (~0.34°)
    // Можно улучшать апгрейдами до 0.99-1.0 (разброс → 0)
    const accuracy = playerState.accuracy ?? 0.98;
    const spread = (1 - accuracy) * 0.3; // как у врагов: (1 - acc) * factor
    const bulletAngle = angle + (Math.random() - 0.5) * 2 * spread;
    const gunCount = Math.min(playerState.guns ?? 1, 5);
    for (let i = 0; i < gunCount; i++) {
      const o = GUN_OFFS[i] ?? 0;
      const nx = playerState.x + Math.cos(angle) * 14 - Math.sin(angle) * o;
      const ny = playerState.y + Math.sin(angle) * 14 + Math.cos(angle) * o;
      bullets.push({
        x: nx,
        y: ny,
        vx: Math.cos(bulletAngle) * sp,
        vy: Math.sin(bulletAngle) * sp,
        life: 1.5,
        dmg: this.bulletDmg,
      });
    }
  }

  /**
     * Создать пулю врага.
     */
  fireEnemyBullet(enemy: { x: number; y: number; angle: number; r: number; boltDmg: number }, enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean; cruiser: boolean }>): void {
    const speed = 300;
    const life = 1.35;
    const heavy = false;
    const cruiser = false;
    const a = enemy.angle;
    enemyBullets.push({
      x: enemy.x + Math.cos(a) * (enemy.r + 6),
      y: enemy.y + Math.sin(a) * (enemy.r + 6),
      vx: Math.cos(a) * speed,
      vy: Math.sin(a) * speed,
      life,
      dmg: enemy.boltDmg,
      heavy,
      cruiser,
    });
  }

  /**
     * Обновить все пули.
     */
  update(dt: number, bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }>, enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean; cruiser: boolean }>, enemies: Array<{ x: number; y: number; dead: boolean }>): void {
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
  getEnemyBullets(): Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean; cruiser: boolean }> {
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
