/**
 * MineSystem - управление минами игрока.
 * Отвечает за размещение, обновление и детонацию мин.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState, EnemyEntity } from '../core/GameState';
import type { Fx } from '../fx';
import type { AudioEngine } from '../audio';
import { MINE_DELAY, MINE_RADIUS, MINE_DMG, MINE_LIFE } from '../balance';

export interface MineData {
  x: number;
  y: number;
  fuse: number;
  seed: number;
}

export class MineSystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioEngine;
  
  private mines: Array<{ 
    x: number; 
    y: number; 
    fuse: number; 
    seed: number;
    armed: boolean;
  }> = [];

  constructor(eventBus: EventBus, state: GameState, fx: Fx, audio: AudioEngine) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
    
    // Подписка на событие детонации
    this.eventBus.subscribe('mine_detonated', (e) => {
      // Обработка события (например, для звуков или эффектов)
    });
  }

  /**
   * Разместить мину.
   */
  drop(x: number, y: number): void {
    this.mines.push({
      x,
      y,
      fuse: MINE_DELAY, // задержка перед активацией
      seed: Math.random(),
      armed: false,
    });
  }

  /**
    * Обновить все мины.
    */
  update(dt: number, mines: Array<{ x: number; y: number; fuse: number; seed: number }>): void {
    // Обновление мин (список mines передается извне)
    for (let i = mines.length - 1; i >= 0; i--) {
      const m = mines[i];
      m.fuse -= dt;
      if (m.fuse <= 0) {
        mines.splice(i, 1);
      }
    }
  }

  /**
   * Детонировать мину.
   */
  private detonate(mine: { x: number; y: number; seed: number }, index: number): void {
    // Удаление мины
    this.mines.splice(index, 1);
    
    // Публикация события детонации
    this.eventBus.publish('mine_detonated', {
      x: mine.x,
      y: mine.y,
      damage: MINE_DMG,
      radius: MINE_RADIUS,
    });
    
    // Нанесение урона врагам в радиусе
    const enemies = this.state.world.enemies;
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      const dist = Math.hypot(enemy.x - mine.x, enemy.y - mine.y);
      if (dist < MINE_RADIUS + enemy.r) {
        // Враг получит урон через систему коллизий
        enemy.hp -= MINE_DMG;
        if (enemy.hp <= 0) {
          enemy.dead = true;
          this.eventBus.publish('enemy_killed', {
            enemy: enemy,
            score: enemy.score || 0,
          });
        }
      }
    }
  }

  /**
   * Получить все мины.
   */
  getMines(): Array<{ 
    x: number; 
    y: number; 
    fuse: number; 
    seed: number;
    armed: boolean;
  }> {
    return this.mines;
  }

  /**
   * Сбросить все мины.
   */
  clear(): void {
    this.mines = [];
  }

  /**
   * Получить количество мин.
   */
  getCount(): number {
    return this.mines.length;
  }
}
