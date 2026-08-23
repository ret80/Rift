/**
 * DroneStrategy - прямое преследование игрока с фланговым смещением.
 * Дроны летят к игроку с лёгким хаотичным смещением для непредсказуемости.
 */

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { lerpAngle } from '../../math';

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;

    // Прямое преследование игрока
    const angleToPlayer = Math.atan2(playerY - enemy.y, playerX - enemy.x);

    // Фланговое смещение — лёгкое смещение для непредсказуемости
    const flankFactor = Math.min(0.3, 0.05 + context.wave * 0.01);
    const flankAngle = Math.sin(enemy.seed + context.wave * 0.5) * flankFactor;
    const targetAngle = angleToPlayer + flankAngle;

    const speed = enemy.speed;

    // Плавное ускорение к целевому вектору
    const k = 1 - Math.exp(-6 * dt);
    enemy.vx += (Math.cos(targetAngle) * speed - enemy.vx) * k;
    enemy.vy += (Math.sin(targetAngle) * speed - enemy.vy) * k;

    // Вращение: смотреть по направлению движения
    const dsp = Math.hypot(enemy.vx, enemy.vy);
    if (dsp > 5) {
      const movementAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, movementAngle, 1 - Math.exp(-5 * dt));
    }
  }
}
