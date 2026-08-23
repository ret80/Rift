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
import { lerpAngle } from '../../math';

export class CarrierStrategy implements IEnemyStrategy {
  /** Максимальное количество дронов у одного Carrier */
  public static readonly MAX_DRONES = 10;

  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;

    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // Удержание позиции — убегает от игрока если тот приближается
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

    // === ЦИКЛ РАБОТЫ CARRIER ===
    const maxDrones = CarrierStrategy.MAX_DRONES;

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
        console.log(`[CARRIER] [НАКОПЛЕНИЕ] Спавн дрон #${enemy.carrierChildren}/${maxDrones}`);
      }
      // Когда все 10 дронов спавнены — переходим к ОЖИДАНИЮ
      if (enemy.carrierChildren >= maxDrones) {
        enemy.waitTimer = Math.random() * (8 - 5) + 5;
        enemy.droneState = 'waiting';
        console.log(`[CARRIER] [ОЖИДАНИЕ] Все ${maxDrones} дронов спавнены. Ждём ${enemy.waitTimer.toFixed(1)}с`);
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
      console.log(`[CARRIER] [СБРОС] Цикл завершён. Начинаю накопление заново.`);
    }
    else {
      // ИНИЦИАЛИЗАЦИЯ — первая инициализация
      enemy.droneState = 'accumulating';
      enemy.orbitTimer = 0;
      enemy.carrierChildren = 0;
      console.log(`[CARRIER] Инициализация. Начинаю фазу накопления.`);
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
    console.log(`[CARRIER] [ОТПУСК] Дроны отпущены. Перехожу в накопление.`);
  }
}
