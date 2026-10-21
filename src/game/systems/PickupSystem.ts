/**
 * PickupSystem - управление бонусами (power-ups, минералы).
 * Отвечает за обновление и удаление бонусов (движение, магнит, таймаут).
 * Хранение и спавн — в EntityPoolSystem.pickupList.
 * Проверка сбора — в checkPickupCollection().
 */

import { ZONE_PICKUP_MAGNET } from '../balance';

export class PickupSystem {
  /**
   * Обновить все бонусы в пуле.
   * Мутабельно обновляет переданный массив (движение, магнит, удаление по таймауту).
   */
  update(
    dt: number,
    pickups: Array<{
      kind: string;
      x: number;
      y: number;
      vx: number;
      vy: number;
      life: number;
      seed: number;
      r?: number;
    }>,
    playerX: number,
    playerY: number
  ): void {
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];

      // Движение
      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // Магнитное притяжение к игроку — чем ближе, тем сильнее
      const dx = playerX - p.x;
      const dy = playerY - p.y;
      const dist = Math.hypot(dx, dy);

      if (dist < ZONE_PICKUP_MAGNET && dist > 2) {
        const fraction = Math.pow(1 - dist / ZONE_PICKUP_MAGNET, 0.5) * 25;
        p.x += dx * fraction * dt;
        p.y += dy * fraction * dt;
      }

      p.life -= dt;

      // Удаление по времени жизни
      if (p.life <= 0) {
        pickups.splice(i, 1);
      }
    }
  }
}
