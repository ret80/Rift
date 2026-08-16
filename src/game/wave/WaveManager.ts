/**
 * WaveManager - управление волнами врагов.
 * Отвечает за генерацию волн, спавн врагов, подсчет убитых и переходы между волнами.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Enemy } from '../entities/Enemy';
import type { EnemyKind } from '../balance';

export interface SpawnPosition {
  x: number;
  y: number;
}

export interface WaveData {
  waveNumber: number;
  totalEnemies: number;
  enemiesRemaining: number;
  allocated: number;
}

export class WaveManager {
  private eventBus: EventBus;
  private state: GameState;
  
  // Текущая волна
  private currentWave: number = 1;
  private totalEnemies: number = 0;
  private killedCount: number = 0;
  private allocatedCount: number = 0;
  
  // Пул врагов для спавна
  private spawnQueue: Array<{ kind: EnemyKind; x: number; y: number }> = [];
  
  // Таймеры
  private spawnTimer: number = 0;
  private spawnInterval: number = 0.5; // секунды между спавнами
  
  // Состояние волны
  private waveActive: boolean = false;
  private waveCleared: boolean = false;
  private clearTimer: number = 0;

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
    
    // Подписка на события
    this.eventBus.subscribe('enemy_killed', (e) => this.onEnemyKilled(e));
  }

  /**
   * Инициализировать новую волну.
   */
  startWave(waveNumber: number, zoneX: number, zoneY: number, zoneRadius: number): void {
    this.currentWave = waveNumber;
    this.waveActive = true;
    this.waveCleared = false;
    this.killedCount = 0;
    this.allocatedCount = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    
    // Получаем конфигурацию волны
    const config = this.getWaveConfig(waveNumber);
    this.totalEnemies = config.total;
    
    // Планируем спавн всех врагов
    this.planSpawns(config, zoneX, zoneY, zoneRadius);
    
    // Публикуем событие начала волны
    this.eventBus.publish('wave_started', {
      wave: waveNumber,
      total: this.totalEnemies,
    });
    
    // Обновляем состояние
    this.state.wave.wave = waveNumber;
    this.state.wave.total = this.totalEnemies;
    this.state.wave.killed = 0;
    this.state.wave.allocated = 0;
  }

  /**
   * Запланировать спавн врагов для волны.
   */
  private planSpawns(
    config: { total: number; kinds: Array<{ kind: EnemyKind; count: number }> },
    zoneX: number,
    zoneY: number,
    zoneRadius: number
  ): void {
    // Распределяем врагов по кругу зоны
    const angleStep = (Math.PI * 2) / config.total;
    let enemyIndex = 0;
    
    for (const kindConfig of config.kinds) {
      for (let i = 0; i < kindConfig.count; i++) {
        const angle = angleStep * enemyIndex + Math.random() * 0.5;
        const radius = zoneRadius * (0.7 + Math.random() * 0.3);
        
        const x = zoneX + Math.cos(angle) * radius;
        const y = zoneY + Math.sin(angle) * radius;
        
        this.spawnQueue.push({
          kind: kindConfig.kind,
          x,
          y,
        });
        
        enemyIndex++;
      }
    }
    
    // Перемешиваем очередь для менее предсказуемого спавна
    this.shuffleQueue();
  }

  /**
   * Перемешать очередь спавна (Fisher-Yates).
   */
  private shuffleQueue(): void {
    for (let i = this.spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.spawnQueue[i], this.spawnQueue[j]] = [this.spawnQueue[j], this.spawnQueue[i]];
    }
  }

  /**
   * Получить конфигурацию волны.
   */
  private getWaveConfig(waveNumber: number): { 
    total: number; 
    kinds: Array<{ kind: EnemyKind; count: number }>;
  } {
    // Простая прогрессия сложности
    const baseCount = 5 + waveNumber * 2;
    const difficultyMult = 1 + waveNumber * 0.15;
    
    const total = Math.round(baseCount * difficultyMult);
    
    // Распределение типов врагов по волнам
    const kinds: Array<{ kind: EnemyKind; count: number }> = [];
    
    // Дроны - базовые враги, появляются всегда
    const droneCount = Math.round(total * 0.5);
    kinds.push({ kind: 'drone', count: droneCount });
    
    // Охотники - появляются с 2 волны
    if (waveNumber >= 2) {
      const hunterCount = Math.round(total * 0.3);
      kinds.push({ kind: 'hunter', count: hunterCount });
    }
    
    // Истребители - появляются с 4 волны
    if (waveNumber >= 4) {
      const fighterCount = Math.round(total * 0.2);
      kinds.push({ kind: 'fighter', count: fighterCount });
    }
    
    return { total, kinds };
  }

  /**
   * Обновить менеджер волн.
   * @param dt - дельта времени
   * @param createEnemy - коллбек для создания врага
   */
  update(dt: number, createEnemy: (kind: EnemyKind, x: number, y: number) => Enemy | null): void {
    if (!this.waveActive) return;
    
    // Спавн врагов из очереди
    if (this.spawnQueue.length > 0 && this.allocatedCount < this.totalEnemies) {
      this.spawnTimer += dt;
      
      if (this.spawnTimer >= this.spawnInterval) {
        this.spawnTimer = 0;
        this.trySpawn(createEnemy);
      }
    }
    
    // Проверка зачистки волны
    if (this.killedCount >= this.totalEnemies && !this.waveCleared) {
      this.waveCleared = true;
      this.clearTimer = 0;
      this.waveActive = false;
      
      // Публикуем событие зачистки
      this.eventBus.publish('wave_cleared', {
        wave: this.currentWave,
        kills: this.killedCount,
      });
      
      // Начинаем схлопывание зоны
      this.eventBus.publish('zone_collapsing', {});
    }
    
    // Таймер после зачистки (перед следующей волной)
    if (this.waveCleared) {
      this.clearTimer += dt;
      if (this.clearTimer >= 2.0) {
        // Волна завершена, готова следующая
        this.state.wave.killed = this.killedCount;
        this.state.wave.allocated = this.allocatedCount;
      }
    }
    
    // Синхронизация состояния
    this.state.wave.killed = this.killedCount;
    this.state.wave.allocated = this.allocatedCount;
  }

  /**
   * Попытаться заспавнить врага из очереди.
   */
  private trySpawn(createEnemy: (kind: EnemyKind, x: number, y: number) => Enemy | null): void {
    if (this.spawnQueue.length === 0) return;
    
    const next = this.spawnQueue.shift();
    if (!next) return;
    
    const enemy = createEnemy(next.kind, next.x, next.y);
    if (enemy) {
      this.allocatedCount++;
      
      this.eventBus.publish('enemy_spawned', {
        kind: next.kind,
        x: next.x,
        y: next.y,
      });
    } else {
      // Если не удалось создать, возвращаем в очередь
      this.spawnQueue.unshift(next);
    }
  }

  /**
   * Обработать убийство врага.
   */
  private onEnemyKilled(event: { type: string; payload: Record<string, unknown> }): void {
    this.killedCount++;
    
    // Обновляем состояние
    this.state.wave.killed = this.killedCount;
  }

  /**
   * Получить данные о текущей волне.
   */
  getWaveData(): WaveData {
    return {
      waveNumber: this.currentWave,
      totalEnemies: this.totalEnemies,
      enemiesRemaining: this.totalEnemies - this.killedCount,
      allocated: this.allocatedCount,
    };
  }

  /**
   * Проверить, активна ли волна.
   */
  isWaveActive(): boolean {
    return this.waveActive;
  }

  /**
   * Проверить, зачищена ли волна.
   */
  isWaveCleared(): boolean {
    return this.waveCleared;
  }

  /**
   * Получить номер текущей волны.
   */
  getCurrentWave(): number {
    return this.currentWave;
  }

  /**
   * Сбросить состояние для нового раунда.
   */
  reset(): void {
    this.currentWave = 1;
    this.totalEnemies = 0;
    this.killedCount = 0;
    this.allocatedCount = 0;
    this.spawnQueue = [];
    this.spawnTimer = 0;
    this.waveActive = false;
    this.waveCleared = false;
    this.clearTimer = 0;
  }
}
