/**
 * IEnemyStrategy - интерфейс для ИИ стратегий врагов.
 * Каждая стратегия инкапсулирует поведение конкретного типа врага.
 */

import type { Enemy } from '../types';
import type { GameContext } from './GameContext';

export interface IEnemyStrategy {
  /**
   * Обновить состояние врага (движение, атаки, решения ИИ).
   * @param enemy - враг, которым управляет эта стратегия
   * @param context - контекст игры (игрок, другие враги, зона и т.д.)
   * @param dt - дельта времени в секундах
   */
  update(enemy: Enemy, context: GameContext, dt: number): void;
}
