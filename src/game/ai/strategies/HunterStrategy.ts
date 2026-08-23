/**
 * HunterStrategy - предсказание позиции игрока (lead pursuit).
 * Охотник вычисляет будущую позицию игрока и движется наперехват.
 */

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { lerpAngle } from '../../math';

export class HunterStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY, playerVx, playerVy } = context;

    // Улучшенное предсказание с прогрессией — чем выше волна, тем лучше предсказание
    const lookahead = 0.4 + context.wave * 0.03;
    const leadX = playerX + playerVx * lookahead;
    const leadY = playerY + playerVy * lookahead;
    const hx = leadX - enemy.x;
    const hy = leadY - enemy.y;
    const hd = Math.hypot(hx, hy) || 1;
    const k = 1 - Math.exp(-(hd < 120 ? 7.5 : 4.5) * dt);
    enemy.vx += ((hx / hd) * enemy.speed - enemy.vx) * k;
    enemy.vy += ((hy / hd) * enemy.speed - enemy.vy) * k;

    // Вращение: смотреть по направлению движения
    const hv = Math.hypot(enemy.vx, enemy.vy);
    if (hv > 5) {
      const targetAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, targetAngle, 1 - Math.exp(-6 * dt));
    }
  }
}
