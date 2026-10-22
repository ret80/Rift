/**
 * CruiserStrategy - эскорт + двойные турели.
 * Крейсер эскортирует рядом с носителем (Carrier), или удерживает позицию на дистанции.
 */

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { EnemyKind } from '../../balance';
import { lerpAngle, smoothVelocity } from '../../math';

export class CruiserStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY, enemies, zoneRadius } = context;

    // Найти ближайший Carrier для эскор
    let escort: Enemy | null = null;
    let ed = 1e9;
    for (const o of enemies) {
      if (o.kind !== EnemyKind.Carrier || o.dead) continue;
      const dd = Math.hypot(enemy.x - o.x, enemy.y - o.y);
      if (dd < ed) {
        ed = dd;
        escort = o;
      }
    }

    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    let desX: number;
    let desY: number;

    if (escort && ed < 290) {
      // Эскорт: двигаться относительно Carrier
      const ox = enemy.x - escort.x;
      const oy = enemy.y - escort.y;
      const od = Math.hypot(ox, oy) || 1;
      const radial = (od - 150) * 1.2;
      desX = (ox / od) * radial + (-oy / od) * enemy.strafeDir * enemy.speed;
      desY = (oy / od) * radial + (ox / od) * enemy.strafeDir * enemy.speed;
    } else {
      // Удержание дистанции от зоны
      const zr = zoneRadius > 0 ? zoneRadius : 420;
      const HOLD = Math.min(400, zr * 0.8);
      const radial = (dist - HOLD) * 1.0;
      desX = dirX * radial + -dirY * enemy.strafeDir * enemy.speed * 0.6;
      desY = dirY * radial + dirX * enemy.strafeDir * enemy.speed * 0.6;
    }

    // Избегание других врагов
    for (const o of enemies) {
      if (o === enemy || o.dead) continue;
      const ddx = enemy.x - o.x;
      const ddy = enemy.y - o.y;
      const d2 = ddx * ddx + ddy * ddy;
      const minSep = (enemy.r + o.r) * 1.1;
      if (d2 < minSep * minSep && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minSep - d) / d * 180;
        desX += (ddx / d) * push;
        desY += (ddy / d) * push;
      }
    }

    // Применяем скорость с сглаживанием
    smoothVelocity(enemy, desX, desY, 2.8, dt);

    // Вращение: смотреть по направлению движения
    const sp = Math.hypot(enemy.vx, enemy.vy);
    if (sp > 5) {
      const targetAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, targetAngle, 1 - Math.exp(-4 * dt));
    }
  }
}
