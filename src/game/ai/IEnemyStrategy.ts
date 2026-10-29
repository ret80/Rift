/**
 * IEnemyStrategy - интерфейс для ИИ стратегий врагов.
 * Каждая стратегия инкапсулирует поведение конкретного типа врага.
 */

import type { EnemyRef } from '../ecs';
import type { GameContext } from './GameContext';

export interface IEnemyStrategy {
  /**
   * Обновить состояние врага (движение, атаки, решения ИИ).
   * @param enemy - живая связка компонентов врага (маркер + базовые компоненты)
   * @param context - контекст игры (игрок, другие враги, зона и т.д.)
   * @param dt - дельта времени в секундах
   */
  update(enemy: EnemyRef, context: GameContext, dt: number): void;
}
