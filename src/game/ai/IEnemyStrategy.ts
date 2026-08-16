/**
 * IEnemyStrategy - интерфейс для ИИ стратегий врагов.
 * Каждая стратегия инкапсулирует поведение конкретного типа врага.
 */

import type { Enemy } from '../entities/Enemy';
import type { GameContext } from './GameContext';

export interface IEnemyStrategy {
  /**
   * Обновить состояние врага (движение, атаки, решения ИИ).
   * @param enemy - враг, которым управляет эта стратегия
   * @param context - контекст игры (игрок, другие враги, зона и т.д.)
   * @param dt - дельта времени в секундах
   */
  update(enemy: Enemy, context: GameContext, dt: number): void;

  /**
   * Отрисовать врага (опционально, может быть вынесено в рендерер).
   * @param enemy - враг для отрисовки
   * @param context - контекст для получения дополнительных данных
   */
  draw?(enemy: Enemy, context: GameContext): void;
}
