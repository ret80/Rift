/**
 * MineSystem - управление минами игрока.
 * Отвечает за размещение, обновление и детонацию мин.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState, EnemyEntity } from '../core/GameState';
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
  
  private mines: Array<{ 
    x: number; 
    y: number; 
    fuse: number; 
    seed: number;
    armed: boolean;
  }> = [];

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
    
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
  update(dt: number, playerX: number, playerY: number): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const m = this.mines[i];
      
      // Активация мины после задержки
      if (!m.armed && m.fuse > 0) {
        m.fuse -= dt;
        if (m.fuse <= 0) {
          m.armed = true;
        }
      }
      
      // Проверка детонации при приближении врагов
      if (m.armed) {
        const enemies = this.state.world.enemies;
        let shouldDetonate = false;
        
        for (const enemy of enemies) {
          if (enemy.dead) continue;
          const dist = Math.hypot(enemy.x - m.x, enemy.y - m.y);
          if (dist < MINE_RADIUS + enemy.r) {
            shouldDetonate = true;
            break;
          }
        }
        
        // Детонация по таймеру жизни
        const totalTime = MINE_LIFE - m.fuse;
        if (totalTime >= MINE_LIFE) {
          shouldDetonate = true;
        }
        
        if (shouldDetonate) {
          this.detonate(m, i);
        }
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
