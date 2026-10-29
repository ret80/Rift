/**
 * DroneStrategy - поведение дронов.
 * 
 * - droneState === 'orbiting': вращается на орбите вокруг parent (Carrier)
 * - droneState === 'attacking': преследует игрока
 * - droneState === 'none': обычное поведение (прямое преследование)
 */

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { lerpAngle, angleTo, smoothVelocity } from '../../math';

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    // Режим атаки — преследование игрока
    if (enemy.droneState === 'attacking') {
      this.updateAttacking(enemy, context, dt);
      return;
    }

    // Режим орбиты — вращение вокруг Carrier
    if (enemy.droneState === 'orbiting') {
      this.updateOrbiting(enemy, context, dt);
      return;
    }

    // Обычное поведение (без parent)
    this.updateNormal(enemy, context, dt);
  }

  /**
    * Орбитальное движение вокруг Carrier
    */
   private updateOrbiting(enemy: Enemy, context: GameContext, dt: number): void {
     const carrier = this.findParentById(enemy, context);
     if (!carrier || carrier.dead) {
       // Carrier мёртв — переходим к атаке
       enemy.droneState = 'attacking';
       this.updateAttacking(enemy, context, dt);
       return;
     }

     const orbitSpeed = 1.5; // радиан в секунду
     enemy.orbitAngle += orbitSpeed * dt;

     // Устанавливаем позицию напрямую на орбите
     enemy.x = carrier.x + Math.cos(enemy.orbitAngle) * enemy.orbitRadius;
     enemy.y = carrier.y + Math.sin(enemy.orbitAngle) * enemy.orbitRadius;

     // Вычисляем velocity для отрисовки и collision
     const tangentX = -Math.sin(enemy.orbitAngle);
     const tangentY = Math.cos(enemy.orbitAngle);
     enemy.vx = tangentX * enemy.speed;
     enemy.vy = tangentY * enemy.speed;

     // Вращение: смотреть по касательной
     enemy.angle = Math.atan2(enemy.vy, enemy.vx);
   }

  /**
    * Атака — преследование игрока
    */
   private updateAttacking(enemy: Enemy, context: GameContext, dt: number): void {
      const { playerX, playerY } = context;
      const angleToPlayer = angleTo(enemy.x, enemy.y, playerX, playerY);

     // Фланговое смещение
     const flankFactor = Math.min(0.3, 0.05 + context.wave * 0.01);
     const flankAngle = Math.sin(enemy.seed + context.wave * 0.5) * flankFactor;
     const targetAngle = angleToPlayer + flankAngle;

     const speed = enemy.speed;

     // Целевая скорость в направлении targetAngle
     const targetVx = Math.cos(targetAngle) * speed;
     const targetVy = Math.sin(targetAngle) * speed;
     smoothVelocity(enemy, targetVx, targetVy, 6, dt);

     const dsp = Math.hypot(enemy.vx, enemy.vy);
     if (dsp > 5) {
       const movementAngle = Math.atan2(enemy.vy, enemy.vx);
       enemy.angle = lerpAngle(enemy.angle, movementAngle, 1 - Math.exp(-5 * dt));
     }
   }

  /**
    * Обычное поведение — прямое преследование (без parent)
    */
   private updateNormal(enemy: Enemy, context: GameContext, dt: number): void {
      const { playerX, playerY } = context;
      const angleToPlayer = angleTo(enemy.x, enemy.y, playerX, playerY);
     const flankFactor = Math.min(0.3, 0.05 + context.wave * 0.01);
     const flankAngle = Math.sin(enemy.seed + context.wave * 0.5) * flankFactor;
     const targetAngle = angleToPlayer + flankAngle;

     const speed = enemy.speed;
     // Целевая скорость в направлении targetAngle
     const targetVx = Math.cos(targetAngle) * speed;
     const targetVy = Math.sin(targetAngle) * speed;
     smoothVelocity(enemy, targetVx, targetVy, 6, dt);

     const dsp = Math.hypot(enemy.vx, enemy.vy);
     if (dsp > 5) {
       const movementAngle = Math.atan2(enemy.vy, enemy.vx);
       enemy.angle = lerpAngle(enemy.angle, movementAngle, 1 - Math.exp(-5 * dt));
     }
   }

  /** Найти живого родителя (Carrier) по parentId из списка врагов контекста. */
  private findParentById(enemy: Enemy, context: GameContext): Enemy | null {
    if (enemy.parentId === null || enemy.parentId === undefined) return null;
    for (const o of context.enemies) {
      if (o.ecsId === enemy.parentId) return o;
    }
    return null;
  }
}
