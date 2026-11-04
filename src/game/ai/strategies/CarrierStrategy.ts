/**
 * CarrierStrategy — носитель дронов («матка»).
 *
 * Цикл работы CARRIER:
 *
 * ФАЗА 1: НАКОПЛЕНИЕ
 * - Carrier спавнит дронов по одному раз в 0.5с.
 * - Считаются ЖИВЫЕ дети: не спавнит новую партию, пока живы >= 6.
 * - После спавна всех дронов (ENEMY_MAX_DRONES) или при достижении лимита
 *   живых переходит к ОЖИДАНИЮ.
 *
 * ФАЗА 2: ОЖИДАНИЕ (5-8 секунд)
 * - Carrier ждёт 5-8 секунд. Дроны ждут на орбите.
 *
 * ФАЗА 3: АТАКА
 * - Carrier отпускает всех орбитальных дронов.
 * - Если игрок ближе 300 — сброс роя досрочно.
 *
 * ФАЗА 4: СБРОС
 * - Carrier очищает счётчики и начинает цикл заново.
 *
 * Движение:
 * - Удержание на 0.8R от зоны.
 * - Если игрок дальше 1.1R — медленно сближается.
 * - Если игрок ближе 0.5R — отходит.
 * - Стрейф меняет направление по таймеру.
 */

import {
  CARRIER_ADVANCE_R,
  CARRIER_DRONE_ORBIT_GAP,
  CARRIER_HOLD_R,
  CARRIER_RETREAT_R,
  ENEMY_MAX_DRONES,
} from '../../balance';
import type { EnemyRef } from '../../ecs';
import { lerpAngle, smoothVelocity } from '../../math';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

/** Минимальное количество живых дронов для остановки спавна. */
const CARRIER_MIN_LIVE_DRONES = 6;
/** Дистанция для досрочного сброса роя, px. */
const CARRIER_EMERGENCY_RELEASE_DIST = 300;
/** Таймер смены направления стрейфа, с. */
const CARRIER_STRAFE_CHANGE_INTERVAL = 4;
/** Скорость доворота при стрейфе. */
const CARRIER_TURN_RATE = 2.2;

export class CarrierStrategy implements IEnemyStrategy {
  private liveDroneCount = 0;
  private strafeTimer = 0;

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

    // Обновляем счётчик живых дронов
    this.liveDroneCount = this.countLiveDrones(context, marker.ecsId);

    // Смена направления стрейфа по таймеру
    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      marker.strafeDir = -marker.strafeDir;
      this.strafeTimer = CARRIER_STRAFE_CHANGE_INTERVAL + context.rng.range(0, 2);
    }

    // Удержание позиции — стрейф, с учётом радиуса зоны.
    const holdDist = context.zoneRadius * CARRIER_HOLD_R;
    let radial = 0;
    if (dist > context.zoneRadius * CARRIER_ADVANCE_R) {
      radial = Math.min(marker.speed * 0.3, (dist - holdDist) * 0.2);
    } else if (dist < context.zoneRadius * CARRIER_RETREAT_R) {
      radial = (holdDist - dist) * 0.5;
    } else if (dist > holdDist) {
      radial = Math.min(0, (dist - holdDist) * 0.5);
    }
    const desX = dirX * radial + -dirY * marker.strafeDir * marker.speed * 0.4;
    const desY = dirY * radial + dirX * marker.strafeDir * marker.speed * 0.4;

    smoothVelocity(vel, desX, desY, CARRIER_TURN_RATE, dt);

    // Вращение: смотреть по направлению движения
    const sp = Math.hypot(vel.vx, vel.vy);
    if (sp > 5) {
      const targetAngle = Math.atan2(vel.vy, vel.vx);
      marker.angle = lerpAngle(marker.angle, targetAngle, 1 - Math.exp(-5 * dt));
    }

    // === ЦИКЛ РАБОТЫ CARRIER ===
    const maxDrones = ENEMY_MAX_DRONES;

    if (marker.droneState === 'accumulating') {
      // ФАЗА 1: НАКОПЛЕНИЕ
      // Если живых дронов >= лимита — не спавним, переходим к ожиданию
      if (this.liveDroneCount >= CARRIER_MIN_LIVE_DRONES) {
        marker.droneState = 'waiting';
        marker.waitTimer = context.rng.range(5, 8);
        return;
      }

      if (marker.orbitTimer > 0) {
        marker.orbitTimer -= dt;
        return;
      }
      marker.orbitTimer -= dt;

      // Спавним дрона, если ещё не все выпущены
      if (marker.orbitTimer <= 0 && marker.carrierChildren < maxDrones) {
        const angle = context.rng.range(0, Math.PI * 2);
        const offset = enemy.radius.r + CARRIER_DRONE_ORBIT_GAP;
        context.carrierSpawns.push({
          x: pos.x + Math.cos(angle) * offset,
          y: pos.y + Math.sin(angle) * offset,
        });
        marker.orbitTimer = 0.5;
        marker.carrierChildren++;
      }

      // Когда все дроны спавнены — переходим к ОЖИДАНИЮ
      if (marker.carrierChildren >= maxDrones) {
        marker.waitTimer = context.rng.range(5, 8);
        marker.droneState = 'waiting';
      }
    }
    else if (marker.droneState === 'waiting') {
      // ФАЗА 2: ОЖИДАНИЕ
      marker.waitTimer -= dt;

      // Если игрок ближе 300 — досрочный сброс роя
      if (dist < CARRIER_EMERGENCY_RELEASE_DIST) {
        marker.droneState = 'attacking';
      }
      // Таймер истёк — переходим в атаку
      else if (marker.waitTimer <= 0) {
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
   * Посчитать количество живых дронов этого носителя.
   */
  private countLiveDrones(context: GameContext, carrierEcsId: string | number): number {
    let count = 0;
    for (const e of context.enemies) {
      if (e.marker.parentId === carrierEcsId && !e.marker.dead) {
        count++;
      }
    }
    return count;
  }

  /**
   * Перевести все орбитальные дроны в режим атаки.
   */
  private triggerAttack(enemies: EnemyRef[], carrier: EnemyRef): void {
    for (const e of enemies) {
      if (e.marker.parentId === carrier.marker.ecsId && !e.marker.dead && e.marker.droneState === 'orbiting') {
        e.marker.droneState = 'attacking';
      }
    }
  }
}
