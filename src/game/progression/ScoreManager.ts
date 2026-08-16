/**
 * ScoreManager - управление очками, комбо и рекордами.
 */

import type { EventBus } from '../core/EventBus';
import type { EnemyKind } from '../balance';

const BEST_KEY = 'rift9_best';

export interface ScoreData {
  score: number;
  best: number;
  kills: number;
  combo: number;
  comboMult: number;
  comboT: number;
  minerals: number;
}

export class ScoreManager {
  private score: number = 0;
  private best: number = 0;
  private kills: number = 0;
  private combo: number = 0;
  private comboT: number = 0;
  private minerals: number = 0;
  
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    
    // Загрузка рекорда
    try {
      this.best = Number(localStorage.getItem(BEST_KEY)) || 0;
    } catch {
      this.best = 0;
    }

    // Подписка на события
    this.eventBus.subscribe('enemy_killed', (e) => this.onEnemyKilled(e));
    this.eventBus.subscribe('pickup_collected', (e) => this.onPickupCollected(e));
  }

  /**
   * Обработать убийство врага.
   */
  private onEnemyKilled(event: { type: string; payload: Record<string, unknown> }): void {
    const { kind, baseScore, x, y } = event.payload;
    
    // Комбо-множитель
    this.combo++;
    this.comboT = 3.0; // окно комбо
    
    const comboMult = Math.min(1 + this.combo * 0.1, 5.0);
    const earned = Math.round((baseScore as number) * comboMult);
    
    this.score += earned;
    this.kills++;
    
    // Публикация события изменения счета
    this.eventBus.publish('score_changed', {
      score: this.score,
      best: this.best,
      combo: this.combo,
      comboMult,
    });
  }

  /**
   * Обратить сбор бонуса.
   */
  private onPickupCollected(event: { type: string; payload: Record<string, unknown> }): void {
    const { kind } = event.payload;
    
    if (kind === 'mineral') {
      this.minerals++;
      this.score += 5;
      
      this.eventBus.publish('score_changed', {
        score: this.score,
        minerals: this.minerals,
      });
    }
  }

  /**
   * Обновить таймеры (комбо и т.д.).
   */
  update(dt: number): void {
    if (this.comboT > 0) {
      this.comboT -= dt;
      if (this.comboT <= 0) {
        this.combo = 0;
        
        this.eventBus.publish('score_changed', {
          score: this.score,
          combo: 0,
          comboMult: 1,
        });
      }
    }
  }

  /**
   * Добавить очки напрямую (для минералов, достижений).
   */
  addScore(amount: number): void {
    this.score += amount;
    
    this.eventBus.publish('score_changed', {
      score: this.score,
    });
  }

  /**
   * Проверить и обновить рекорд.
   * @returns true если установлен новый рекорд
   */
  checkBest(): boolean {
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem(BEST_KEY, String(this.best));
      } catch {
        // Игнорируем ошибки localStorage
      }
      return true;
    }
    return false;
  }

  /**
   * Получить текущие данные о счете.
   */
  getData(): ScoreData {
    const comboMult = Math.min(1 + this.combo * 0.1, 5.0);
    
    return {
      score: this.score,
      best: this.best,
      kills: this.kills,
      combo: this.combo,
      comboMult,
      comboT: this.comboT,
      minerals: this.minerals,
    };
  }

  /**
   * Сбросить счет для нового раунда.
   */
  reset(): void {
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboT = 0;
    this.minerals = 0;
    
    this.eventBus.publish('score_changed', {
      score: 0,
      combo: 0,
      comboMult: 1,
      minerals: 0,
    });
  }

  /**
   * Получить рекорд.
   */
  getBest(): number {
    return this.best;
  }
}
