/**
 * DroneStrategy - поведение дронов.
 * 
 * - droneState === 'orbiting': вращается на орбите вокруг parent (Carrier)
 * - droneState === 'attacking': преследует игрока
 * - droneState === 'none': обычное поведение (прямое преследование)
 */

import type { EnemyRef } from '../../ecs';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { lerpAngle, angleTo, smoothVelocity } from '../../math';

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    // Режим атаки — преследование игрока
    if (enemy.marker.droneState === 'attacking') {
      this.updateAttacking(enemy, context, dt);
      return;
    }

    // Режим орбиты — вращение вокруг Carrier
    if (enemy.marker.droneState === 'orbiting') {
      this.updateOrbiting(enemy, context, dt);
      return;
    }

    // Обычное поведение (без parent)
    this.updateNormal(enemy, context, dt);
  }

  /**
    * Орбитальное движение вокруг Carrier
    */
   private updateOrbiting(enemy: EnemyRef, context: GameContext, dt: number): void {
     const marker = enemy.marker;
     const pos = enemy.position;
     const vel = enemy.velocity;
     const carrier = this.findParentById(enemy, context);
     if (!carrier || carrier.marker.dead) {
       // Carrier мёртв — переходим к атаке
       marker.droneState = 'attacking';
       this.updateAttacking(enemy, context, dt);
       return;
     }

     const orbitSpeed = 1.5; // радиан в секунду
     marker.orbitAngle += orbitSpeed * dt;

     // Устанавливаем позицию напрямую на орбите
     pos.x = carrier.position.x + Math.cos(marker.orbitAngle) * marker.orbitRadius;
     pos.y = carrier.position.y + Math.sin(marker.orbitAngle) * marker.orbitRadius;

     // Вычисляем velocity для отрисовки и collision
     const tangentX = -Math.sin(marker.orbitAngle);
     const tangentY = Math.cos(marker.orbitAngle);
     vel.vx = tangentX * marker.speed;
     vel.vy = tangentY * marker.speed;

     // Вращение: смотреть по касательной
     marker.angle = Math.atan2(vel.vy, vel.vx);
   }

  /**
    * Атака — преследование игрока
    */
   private updateAttacking(enemy: EnemyRef, context: GameContext, dt: number): void {
      const { playerX, playerY } = context;
      const marker = enemy.marker;
      const pos = enemy.position;
      const vel = enemy.velocity;
      const angleToPlayer = angleTo(pos.x, pos.y, playerX, playerY);

     // Фланговое смещение
     const flankFactor = Math.min(0.3, 0.05 + context.wave * 0.01);
     const flankAngle = Math.sin(marker.seed + context.wave * 0.5) * flankFactor;
     const targetAngle = angleToPlayer + flankAngle;

     const speed = marker.speed;

     // Целевая скорость в направлении targetAngle
     const targetVx = Math.cos(targetAngle) * speed;
     const targetVy = Math.sin(targetAngle) * speed;
     smoothVelocity(vel, targetVx, targetVy, 6, dt);

     const dsp = Math.hypot(vel.vx, vel.vy);
     if (dsp > 5) {
       const movementAngle = Math.atan2(vel.vy, vel.vx);
       marker.angle = lerpAngle(marker.angle, movementAngle, 1 - Math.exp(-5 * dt));
     }
   }

  /**
    * Обычное поведение — прямое преследование (без parent)
    */
   private updateNormal(enemy: EnemyRef, context: GameContext, dt: number): void {
      const { playerX, playerY } = context;
      const marker = enemy.marker;
      const pos = enemy.position;
      const vel = enemy.velocity;
      const angleToPlayer = angleTo(pos.x, pos.y, playerX, playerY);
     const flankFactor = Math.min(0.3, 0.05 + context.wave * 0.01);
     const flankAngle = Math.sin(marker.seed + context.wave * 0.5) * flankFactor;
     const targetAngle = angleToPlayer + flankAngle;

     const speed = marker.speed;
     // Целевая скорость в направлении targetAngle
     const targetVx = Math.cos(targetAngle) * speed;
     const targetVy = Math.sin(targetAngle) * speed;
     smoothVelocity(vel, targetVx, targetVy, 6, dt);

     const dsp = Math.hypot(vel.vx, vel.vy);
     if (dsp > 5) {
       const movementAngle = Math.atan2(vel.vy, vel.vx);
       marker.angle = lerpAngle(marker.angle, movementAngle, 1 - Math.exp(-5 * dt));
     }
   }

  /** Найти живого родителя (Carrier) по parentId из списка врагов контекста. */
  private findParentById(enemy: EnemyRef, context: GameContext): EnemyRef | null {
    const parentId = enemy.marker.parentId;
    if (parentId === null || parentId === undefined) return null;
    for (const o of context.enemies) {
      if (o.marker.ecsId === parentId) return o;
    }
    return null;
  }
}