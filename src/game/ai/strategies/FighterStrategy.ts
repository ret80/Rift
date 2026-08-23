/**
 * FighterStrategy - атака с дистанции: сближение → удержание идеальной дистанции → страф.
 * Истребитель сближается, затем держит оптимальную дистанцию и двигается по касательной.
 */

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { lerpAngle } from '../../math';

export class FighterStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;

    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    // Идеальная дистанция стрельбы — 200-280
    const idealDist = 220 + Math.sin(enemy.modeT * 0.3) * 30;

    if (dist > idealDist * 1.2) {
      // Сближение
      const targetAngle = angleToPlayer;
      enemy.angle = lerpAngle(enemy.angle, targetAngle, dt * 5);
      const speed = enemy.speed * 1.1;
      const k = 1 - Math.exp(-5 * dt);
      enemy.vx += (Math.cos(targetAngle) * speed - enemy.vx) * k;
      enemy.vy += (Math.sin(targetAngle) * speed - enemy.vy) * k;
    } else if (dist < idealDist * 0.7) {
      // Отступление
      const targetAngle = angleToPlayer + Math.PI;
      enemy.angle = lerpAngle(enemy.angle, targetAngle, dt * 4);
      const speed = enemy.speed * 0.7;
      const k = 1 - Math.exp(-4 * dt);
      enemy.vx += (Math.cos(targetAngle) * speed - enemy.vx) * k;
      enemy.vy += (Math.sin(targetAngle) * speed - enemy.vy) * k;
    } else {
      // Удержание дистанции + движение по касательной (страф)
      const tangent = angleToPlayer + Math.PI / 2 * enemy.strafeDir;
      enemy.angle = lerpAngle(enemy.angle, tangent, dt * 3);
      const speed = enemy.speed * 0.6;
      const k = 1 - Math.exp(-4 * dt);
      enemy.vx += (Math.cos(tangent) * speed - enemy.vx) * k;
      enemy.vy += (Math.sin(tangent) * speed - enemy.vy) * k;
    }

    // Обновление таймера режима (для фазы атаки)
    enemy.modeT -= dt;
    if (enemy.modeT <= 0) {
      enemy.modeT = Math.random() * (3 - 1.5) + 1.5; // rand(1.5, 3)
      enemy.strafeDir *= -1; // меняем направление страфа
    }

    // Вращение: плавно следить за направлением движения
    const kAngle = 1 - Math.exp(-6 * dt);
    const sp = Math.hypot(enemy.vx, enemy.vy);
    if (sp > 5) {
      const movementAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, movementAngle, kAngle);
    }
  }
}
