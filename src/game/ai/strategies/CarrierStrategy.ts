/**
 * CarrierStrategy - носитель дронов.
 * Удерживает позицию на большом расстоянии, спавнит дронов burst-ами.
 */

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { EnemyKind } from '../../balance';
import { TAU, lerpAngle } from '../../math';

export class CarrierStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;

    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Удержание позиции
    const HOLD = 480;
    const radial = (dist - HOLD) * 0.7;
    let desX = dirX * radial + -dirY * enemy.strafeDir * enemy.speed * 0.4;
    let desY = dirY * radial + dirX * enemy.strafeDir * enemy.speed * 0.4;

    // Избегание других врагов (исключая своих дронов)
    for (const o of context.enemies) {
      if (o === enemy || o.dead) continue;
      // Исключаем parent-child коллизии: carrier не должен избегать дроны, которые он спавнит
      if (o.parent === enemy || enemy.parent === o) continue;
      const ddx = enemy.x - o.x;
      const ddy = enemy.y - o.y;
      const d2 = ddx * ddx + ddy * ddy;
      const minSep = (enemy.r + o.r) * 1.05;
      if (d2 < minSep * minSep && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minSep - d) / d * 120;
        desX += (ddx / d) * push;
        desY += (ddy / d) * push;
      }
    }

    // Применяем скорость с сглаживанием
    const k = 1 - Math.exp(-2.2 * dt);
    enemy.vx += (desX - enemy.vx) * k;
    enemy.vy += (desY - enemy.vy) * k;

    // Вращение: смотреть по направлению движения
    const sp = Math.hypot(enemy.vx, enemy.vy);
    if (sp > 5) {
      const targetAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, targetAngle, 1 - Math.exp(-5 * dt));
    }

    // Burst spawn: carrier управляет своими таймерами сам
    // (стратегия только обновляет состояние, спавн обрабатывается в EnemySystem)
    const maxDrones = 12 + Math.floor(context.wave / 5);

    if (enemy.burstActive) {
      enemy.burstCd -= dt;
      if (enemy.burstCd <= 0 && enemy.burstSpawned < maxDrones) {
        enemy.burstCd = 0.35;
        enemy.burstSpawned++;
      }
      if (enemy.burstSpawned >= maxDrones) {
        enemy.burstActive = false;
        enemy.burstRestT = Math.random() * (6 - 3) + 3;
      }
    } else {
      enemy.burstRestT -= dt;
      if (enemy.burstRestT <= 0) {
        enemy.burstActive = true;
        enemy.burstSpawned = 0;
      }
    }
  }
}
