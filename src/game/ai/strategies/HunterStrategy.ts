/**
 * HunterStrategy - стратегия охотника.
 * Предсказывает позицию игрока и движется наперехват.
 */

import type { Enemy } from '../../entities/Enemy';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

export class HunterStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY, playerVx, playerVy } = context;
    
    // Предсказание позиции игрока (lookahead)
    const lookahead = 0.4; // секунды
    const predictedX = playerX + playerVx * lookahead;
    const predictedY = playerY + playerVy * lookahead;
    
    // Угол к предсказанной позиции
    const targetAngle = Math.atan2(predictedY - enemy.y, predictedX - enemy.x);
    
    // Плавный поворот
    enemy.angle = this.lerpAngle(enemy.angle, targetAngle, dt * 3);
    
    // Движение вперед с полной скоростью
    const speed = enemy.speed;
    enemy.vx = Math.cos(enemy.angle) * speed;
    enemy.vy = Math.sin(enemy.angle) * speed;
    
    // Интеграция позиции
    enemy.integrate(dt);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }
}
