/**
 * FighterStrategy - стратегия истребителя.
 * Движется по орбите вокруг игрока, периодически атакуя.
 */

import type { Enemy } from '../../entities/Enemy';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

const ORBIT_RADIUS = 180;
const ORBIT_SPEED = 1.5;

export class FighterStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;
    
    // Вектор к игроку
    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy);
    const angleToPlayer = Math.atan2(dy, dx);
    
    // Орбитальное движение
    if (dist > ORBIT_RADIUS) {
      // Движение к игроку пока не достигнем орбиты
      enemy.angle = angleToPlayer;
      const speed = enemy.speed;
      enemy.vx = Math.cos(enemy.angle) * speed;
      enemy.vy = Math.sin(enemy.angle) * speed;
    } else {
      // Орбитальное движение вокруг игрока
      const orbitAngle = angleToPlayer + enemy.modeT * ORBIT_SPEED;
      const targetX = playerX + Math.cos(orbitAngle) * ORBIT_RADIUS;
      const targetY = playerY + Math.sin(orbitAngle) * ORBIT_RADIUS;
      
      const angleToOrbit = Math.atan2(targetY - enemy.y, targetX - enemy.x);
      enemy.angle = this.lerpAngle(enemy.angle, angleToOrbit, dt * 4);
      
      const speed = enemy.speed * 0.7;
      enemy.vx = Math.cos(enemy.angle) * speed;
      enemy.vy = Math.sin(enemy.angle) * speed;
    }
    
    // Интеграция позиции
    enemy.integrate(dt);
    
    // Обновление таймера режима (для фазы атаки)
    enemy.modeT += dt;
    
    // Стрельба когда смотрит на игрока
    if (enemy.canFire()) {
      const angleDiff = Math.abs(this.normalizeAngle(angleToPlayer - enemy.angle));
      if (angleDiff < 0.3) {
        enemy.fireCd = 1.2; // кулдаун между выстрелами
        // Событие выстрела будет обработано в EnemyAI
        enemy.mode = 1; // режим атаки
      }
    }
  }

  private lerpAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= Math.PI * 2;
    while (diff < -Math.PI) diff += Math.PI * 2;
    return a + diff * t;
  }

  private normalizeAngle(angle: number): number {
    while (angle > Math.PI) angle -= Math.PI * 2;
    while (angle < -Math.PI) angle += Math.PI * 2;
    return angle;
  }
}
