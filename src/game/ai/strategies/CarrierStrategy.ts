/**
 * CarrierStrategy - носитель дронов.
 * Цикл работы CARRIER:
 * 
 * ФАЗА 1: НАКОПЛЕНИЕ
 * - Carrier спавнит ровно 10 дронов на орбите (интервал 0.5с).
 * - После спавна всех 10 дронов переходит к ФАЗЕ 2.
 * 
 * ФАЗА 2: ОЖИДАНИЕ (5-8 секунд)
 * - Carrier ждёт 5-8 секунд. Дроны ждут на орбите.
 * 
 * ФАЗА 3: АТАКА
 * - Carrier отпускает всех дронов — они срываются и атакуют игрока.
 * - Carrier очищает свой список детей.
 * 
 * ФАЗА 4: СБРОС
 * - Carrier очищает счётчики и начинает цикл заново (возврат к ФАЗЕ 1).
 */

import type { EnemyRef } from '../../ecs';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { ENEMY_MAX_DRONES } from '../../balance';
import { lerpAngle, smoothVelocity } from '../../math';

export class CarrierStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;

    const dx = playerX - pos.x;
    const dy = playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Удержание позиции — стрейф, без преследования игрока
    const HOLD = 480;
    const radial = Math.min(0, (dist - HOLD) * 0.7); // только отталкивание (отрицательное), без приближения
    let desX = dirX * radial + -dirY * marker.strafeDir * marker.speed * 0.4;
    let desY = dirY * radial + dirX * marker.strafeDir * marker.speed * 0.4;

    // Избегание других врагов (исключая своих дронов)
    for (const o of context.enemies) {
      if (o === enemy || o.marker.dead) continue;
      // Исключаем parent-child коллизии: carrier не должен избегать дроны, которые он спавнит
      if (o.marker.parentId === marker.ecsId || marker.parentId === o.marker.ecsId) continue;
      const ddx = pos.x - o.position.x;
      const ddy = pos.y - o.position.y;
      const d2 = ddx * ddx + ddy * ddy;
      const minSep = (enemy.radius.r + o.radius.r) * 1.05;
      if (d2 < minSep * minSep && d2 > 0.0001) {
        const d = Math.sqrt(d2);
        const push = (minSep - d) / d * 120;
        desX += (ddx / d) * push;
        desY += (ddy / d) * push;
      }
    }

    // Применяем скорость с сглаживанием
    smoothVelocity(vel, desX, desY, 2.2, dt);

    // Вращение: смотреть по направлению движения
    const sp = Math.hypot(vel.vx, vel.vy);
    if (sp > 5) {
      const targetAngle = Math.atan2(vel.vy, vel.vx);
      marker.angle = lerpAngle(marker.angle, targetAngle, 1 - Math.exp(-5 * dt));
    }

    // === ЦИКЛ РАБОТЫ CARRIER ===
    const maxDrones = ENEMY_MAX_DRONES;

    if (marker.droneState === 'accumulating') {
      // ФАЗА 1: НАКОПЛЕНИЕ — спавним дронов по одному раз в 0.5с
      if (marker.orbitTimer > 0) {
        marker.orbitTimer -= dt;
        return; // ждём задержку
      }
      marker.orbitTimer -= dt;
      if (marker.orbitTimer <= 0 && marker.carrierChildren < maxDrones) {
        const angle = Math.random() * Math.PI * 2;
        const offset = enemy.radius.r + 80;
        context.carrierSpawns.push({
          x: pos.x + Math.cos(angle) * offset,
          y: pos.y + Math.sin(angle) * offset,
        });
        marker.orbitTimer = 0.5;
        marker.carrierChildren++;
      }
      // Когда все 10 дронов спавнены — переходим к ОЖИДАНИЮ
      if (marker.carrierChildren >= maxDrones) {
        marker.waitTimer = Math.random() * (8 - 5) + 5;
        marker.droneState = 'waiting';
      }
    } 
    else if (marker.droneState === 'waiting') {
      // ФАЗА 2: ОЖИДАНИЕ — Carrier ждёт, дроны ждут на орбите
      marker.waitTimer -= dt;
      if (marker.waitTimer <= 0) {
        // Таймер истёк — переходим в атаку (сигнал дронам выполнится в state attacking)
        marker.droneState = 'attacking';
      }
    }
    else if (marker.droneState === 'attacking') {
      // ФАЗА 3: АТАКА — сигнал дронам + мгновенный сброс
      this.triggerAttack(context.enemies, enemy);
      marker.carrierChildren = 0;
      marker.waitTimer = 0;
      marker.droneState = 'accumulating';
    }
    else {
      // ИНИЦИАЛИЗАЦИЯ — первая инициализация
      marker.droneState = 'accumulating';
      marker.orbitTimer = 0;
      marker.carrierChildren = 0;
    }
  }

  /**
   * Перевести все орбитальные дроны в режим атаки
   */
  private triggerAttack(enemies: EnemyRef[], carrier: EnemyRef): void {
    for (const e of enemies) {
      if (e.marker.parentId === carrier.marker.ecsId && !e.marker.dead && e.marker.droneState === 'orbiting') {
        e.marker.droneState = 'attacking';
      }
    }
  }
}