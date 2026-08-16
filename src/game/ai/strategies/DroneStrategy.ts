/**
 * DroneStrategy - роевое поведение для дронов (Boids-lite).
 * Дроны двигаются хаотично, стремясь к игроку, но избегая столкновений.
 */

import type { Enemy } from '../../entities/Enemy';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { TAU } from '../../math';

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY, enemies } = context;
    
    // Базовое направление к игроку
    const angleToPlayer = Math.atan2(playerY - enemy.y, playerX - enemy.x);
    
    // Сепарация - избегать слишком близких соседей
    let sepX = 0;
    let sepY = 0;
    const sepDist = 40;
    
    for (const other of enemies) {
      if (other === enemy || other.dead) continue;
      if (other.kind !== 'drone') continue;
      
      const dx = enemy.x - other.x;
      const dy = enemy.y - other.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < sepDist && dist > 0) {
        const force = (sepDist - dist) / sepDist;
        sepX += (dx / dist) * force;
        sepY += (dy / dist) * force;
      }
    }
    
    // Добавляем немного случайности для хаотичного движения
    const noise = Math.sin(enemy.seed + context.state.wave.wave * 0.1) * 0.3;
    
    // Комбинируем направления
    const targetAngle = angleToPlayer + noise + Math.atan2(sepY, sepX);
    
    // Плавный поворот к цели
    enemy.angle = this.lerpAngle(enemy.angle, targetAngle, dt * 5);
    
    // Движение вперед
    const speed = enemy.speed;
    enemy.vx = Math.cos(enemy.angle) * speed;
    enemy.vy = Math.sin(enemy.angle) * speed;
    
    // Интеграция позиции
    enemy.integrate(dt);
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    return a + diff * t;
  }
}
