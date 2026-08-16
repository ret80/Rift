/**
 * EnemyAI - фабрика и менеджер ИИ стратегий для врагов.
 * Создает стратегии для каждого типа врага и управляет их обновлением.
 */

import type { Enemy } from '../entities/Enemy';
import type { GameContext } from './GameContext';
import type { IEnemyStrategy } from './IEnemyStrategy';
import { DroneStrategy } from './strategies/DroneStrategy';
import { HunterStrategy } from './strategies/HunterStrategy';
import { FighterStrategy } from './strategies/FighterStrategy';
import type { EventBus } from '../core/EventBus';

export class EnemyAI {
  private strategies: Map<string, IEnemyStrategy> = new Map();
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
    this.registerStrategies();
  }

  /**
   * Зарегистрировать все доступные стратегии.
   */
  private registerStrategies(): void {
    this.strategies.set('drone', new DroneStrategy());
    this.strategies.set('hunter', new HunterStrategy());
    this.strategies.set('fighter', new FighterStrategy());
    // CruiserStrategy и CarrierStrategy будут добавлены позже
  }

  /**
   * Получить стратегию для типа врага.
   */
  getStrategy(kind: string): IEnemyStrategy | null {
    return this.strategies.get(kind) || null;
  }

  /**
   * Назначить стратегию врагу.
   */
  assignStrategy(enemy: Enemy): void {
    const strategy = this.getStrategy(enemy.kind);
    if (strategy) {
      enemy.strategy = strategy;
    }
  }

  /**
   * Обновить всех врагов с их стратегиями.
   * @param enemies - массив врагов для обновления
   * @param context - контекст игры
   * @param dt - дельта времени
   */
  updateEnemies(enemies: Enemy[], context: GameContext, dt: number): void {
    for (const enemy of enemies) {
      if (enemy.dead) continue;

      // Если у врага нет стратегии, назначаем
      if (!enemy.strategy) {
        this.assignStrategy(enemy);
      }

      // Обновляем через стратегию
      if (enemy.strategy) {
        enemy.strategy.update(enemy, context, dt);
      } else {
        // Fallback - простое движение к игроку
        this.fallbackUpdate(enemy, context, dt);
      }

      // Проверка на выход за пределы зоны
      if (!context.isInsideZone(enemy.x, enemy.y)) {
        // Враг покинул зону - наносим урон или удаляем
        enemy.hp = 0;
        enemy.dead = true;
      }
    }
  }

  /**
   * Резервное обновление для врагов без стратегии.
   */
  private fallbackUpdate(enemy: Enemy, context: GameContext, dt: number): void {
    const angleToPlayer = Math.atan2(
      context.playerY - enemy.y,
      context.playerX - enemy.x
    );
    
    enemy.angle = angleToPlayer;
    enemy.vx = Math.cos(angleToPlayer) * enemy.speed;
    enemy.vy = Math.sin(angleToPlayer) * enemy.speed;
    enemy.integrate(dt);
  }

  /**
   * Обработать выстрел врага.
   * @returns true если выстрел произошел
   */
  tryFire(enemy: Enemy, context: GameContext): boolean {
    if (!enemy.canFire()) return false;

    // Проверяем, смотрит ли враг примерно на игрока
    const angleToPlayer = Math.atan2(
      context.playerY - enemy.y,
      context.playerX - enemy.x
    );
    
    const angleDiff = Math.abs(this.normalizeAngle(angleToPlayer - enemy.angle));
    
    if (angleDiff < 0.5) {
      // Вражеский выстрел
      const bulletSpeed = 280;
      const vx = Math.cos(enemy.angle) * bulletSpeed;
      const vy = Math.sin(enemy.angle) * bulletSpeed;
      
      // Публикуем событие выстрела
      this.eventBus.publish('enemy_fired', {
        x: enemy.x,
        y: enemy.y,
        vx,
        vy,
        dmg: enemy.boltDmg,
        kind: enemy.kind,
      });
      
      enemy.resetFireCooldown(1.0 + enemy.kind.length * 0.1);
      return true;
    }
    
    return false;
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}
