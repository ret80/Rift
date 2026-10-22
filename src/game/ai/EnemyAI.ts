/**
 * EnemyAI - фабрика и менеджер ИИ стратегий для врагов.
 * Создает стратегии для каждого типа врага и управляет их обновлением.
 */

import type { Enemy } from '../types';
import type { GameContext } from './GameContext';
import type { IEnemyStrategy } from './IEnemyStrategy';
import { EnemyKind } from '../balance';
import { DroneStrategy } from './strategies/DroneStrategy';
import { HunterStrategy } from './strategies/HunterStrategy';
import { FighterStrategy } from './strategies/FighterStrategy';
import { CruiserStrategy } from './strategies/CruiserStrategy';
import { CarrierStrategy } from './strategies/CarrierStrategy';
import { angleTo, smoothVelocity, TAU } from '../math';

export class EnemyAI {
  private strategies: Map<string, IEnemyStrategy> = new Map();

  constructor() {
    this.registerStrategies();
  }

  /**
   * Зарегистрировать все доступные стратегии.
   */
  private registerStrategies(): void {
    this.strategies.set(EnemyKind.Drone, new DroneStrategy());
    this.strategies.set(EnemyKind.Hunter, new HunterStrategy());
    this.strategies.set(EnemyKind.Fighter, new FighterStrategy());
    this.strategies.set(EnemyKind.Cruiser, new CruiserStrategy());
    this.strategies.set(EnemyKind.Carrier, new CarrierStrategy());
  }

  /**
   * Получить стратегию для типа врага.
   */
  getStrategy(kind: EnemyKind): IEnemyStrategy | null {
    return this.strategies.get(kind) || null;
  }

  /**
   * Обновить AI всех врагов (только движение).
   * Позиция применяется отдельно в EnemySystem.
   * @param enemies - массив врагов для обновления
   * @param context - контекст игры
   * @param dt - дельта времени
   */
  updateAI(enemies: Enemy[], context: GameContext, dt: number): void {
    for (const enemy of enemies) {
      if (enemy.dead) continue;

      // Получаем стратегию для типа врага
      const strategy = this.getStrategy(enemy.kind);

      if (strategy) {
        strategy.update(enemy, context, dt);
      } else {
        // Fallback - простое движение к игроку
        this.fallbackUpdate(enemy, context, dt);
      }
    }
  }

  /**
    * Резервное обновление для врагов без стратегии.
    */
  private fallbackUpdate(enemy: Enemy, context: GameContext, dt: number): void {
    const angleToPlayer = angleTo(enemy.x, enemy.y, context.playerX, context.playerY);
    const speed = enemy.speed;
    smoothVelocity(enemy, Math.cos(angleToPlayer) * speed, Math.sin(angleToPlayer) * speed, 6, dt);
    enemy.angle = angleToPlayer;
  }

}
