/**
 * CruiserStrategy - эскорт + двойные турели.
 * Крейсер эскортирует рядом с носителем (Carrier), или удерживает позицию на дистанции.
 */

import type { EnemyRef } from '../../ecs';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { EnemyKind } from '../../balance';
import { lerpAngle, smoothVelocity } from '../../math';

export class CruiserStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { playerX, playerY, enemies, zoneRadius } = context;
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;

    // Найти ближайший Carrier для эскор
    let escort: EnemyRef | null = null;
    let ed = 1e9;
    for (const o of enemies) {
      if (o.marker.kind !== EnemyKind.Carrier || o.marker.dead) continue;
      const dd = Math.hypot(pos.x - o.position.x, pos.y - o.position.y);
      if (dd < ed) {
        ed = dd;
        escort = o;
      }
    }

    const dx = playerX - pos.x;
    const dy = playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    let desX: number;
    let desY: number;

    if (escort && ed < 290) {
      // Эскорт: двигаться относительно Carrier
      const ox = pos.x - escort.position.x;
      const oy = pos.y - escort.position.y;
      const od = Math.hypot(ox, oy) || 1;
      const radial = (od - 150) * 1.2;
      desX = (ox / od) * radial + (-oy / od) * marker.strafeDir * marker.speed;
      desY = (oy / od) * radial + (ox / od) * marker.strafeDir * marker.speed;
    } else {
      // Удержание дистанции от зоны
      const zr = zoneRadius > 0 ? zoneRadius : 420;
      const HOLD = Math.min(400, zr * 0.8);
      const radial = (dist - HOLD) * 1.0;
      desX = dirX * radial + -dirY * marker.strafeDir * marker.speed * 0.6;
      desY = dirY * radial + dirX * marker.strafeDir * marker.speed * 0.6;
    }

    // Избегание других врагов
    for (const o of enemies) {
      if (o === enemy || o.marker.dead) continue;
      const ddx = pos.x - o.position.x;
      const ddy = pos.y - o.position.y;
      const d2 = ddx * ddx + ddy * ddy;
      const minSep = (enemy.radius.r + o.radius.r) * 1.1;
      if (d2 < minSep * minSep && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minSep - d) / d * 180;
        desX += (ddx / d) * push;
        desY += (ddy / d) * push;
      }
    }

    // Применяем скорость с сглаживанием
    smoothVelocity(vel, desX, desY, 2.8, dt);

    // Вращение: смотреть по направлению движения
    const sp = Math.hypot(vel.vx, vel.vy);
    if (sp > 5) {
      const targetAngle = Math.atan2(vel.vy, vel.vx);
      marker.angle = lerpAngle(marker.angle, targetAngle, 1 - Math.exp(-4 * dt));
    }
  }
}