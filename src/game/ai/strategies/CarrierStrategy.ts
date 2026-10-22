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

import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { ENEMY_MAX_DRONES } from '../../balance';
import { lerpAngle, smoothVelocity } from '../../math';

export class CarrierStrategy implements IEnemyStrategy {

  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;

    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Удержание позиции — стрейф, без преследования игрока
    const HOLD = 480;
    const radial = Math.min(0, (dist - HOLD) * 0.7); // только отталкивание (отрицательное), без приближения
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
    smoothVelocity(enemy, desX, desY, 2.2, dt);

    // Вращение: смотреть по направлению движения
    const sp = Math.hypot(enemy.vx, enemy.vy);
    if (sp > 5) {
      const targetAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, targetAngle, 1 - Math.exp(-5 * dt));
    }

    // === ЦИКЛ РАБОТЫ CARRIER ===
    const maxDrones = ENEMY_MAX_DRONES;

    if (enemy.droneState === 'accumulating') {
      // ФАЗА 1: НАКОПЛЕНИЕ — спавним дронов по одному раз в 0.5с
      if (enemy.orbitTimer > 0) {
        enemy.orbitTimer -= dt;
        return; // ждём задержку
      }
      enemy.orbitTimer -= dt;
      if (enemy.orbitTimer <= 0 && enemy.carrierChildren < maxDrones) {
        const angle = Math.random() * Math.PI * 2;
        const offset = enemy.r + 80;
        context.carrierSpawns.push({
          x: enemy.x + Math.cos(angle) * offset,
          y: enemy.y + Math.sin(angle) * offset,
        });
        enemy.orbitTimer = 0.5;
        enemy.carrierChildren++;
      }
      // Когда все 10 дронов спавнены — переходим к ОЖИДАНИЮ
      if (enemy.carrierChildren >= maxDrones) {
        enemy.waitTimer = Math.random() * (8 - 5) + 5;
        enemy.droneState = 'waiting';
      }
    } 
    else if (enemy.droneState === 'waiting') {
      // ФАЗА 2: ОЖИДАНИЕ — Carrier ждёт, дроны ждут на орбите
      enemy.waitTimer -= dt;
      if (enemy.waitTimer <= 0) {
        // Таймер истёк — переходим в атаку (сигнал дронам выполнится в state attacking)
        enemy.droneState = 'attacking';
      }
    }
    else if (enemy.droneState === 'attacking') {
      // ФАЗА 3: АТАКА — сигнал дронам + мгновенный сброс
      this.triggerAttack(context.enemies, enemy);
      enemy.carrierChildren = 0;
      enemy.waitTimer = 0;
      enemy.droneState = 'accumulating';
    }
    else {
      // ИНИЦИАЛИЗАЦИЯ — первая инициализация
      enemy.droneState = 'accumulating';
      enemy.orbitTimer = 0;
      enemy.carrierChildren = 0;
    }
  }

  /**
   * Перевести все орбитальные дроны в режим атаки
   */
  private triggerAttack(enemies: Enemy[], carrier: Enemy): void {
    for (const e of enemies) {
      if (e.parent === carrier && !e.dead && e.droneState === 'orbiting') {
        e.droneState = 'attacking';
      }
    }
  }
}
