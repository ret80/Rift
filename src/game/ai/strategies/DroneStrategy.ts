/**
 * DroneStrategy — поведение дронов: патруль зоны + редкие атаки.
 *
 * Режимы (marker.mode):
 *   ORBIT  (0) — кружение вокруг центра зоны на радиусе ~0.7R.
 *                Направление орбиты задаётся strafeDir (±1),
 *                поэтому половина роя летит по часовой, половина — против.
 *   ATTACK (1) — срыв с орбиты и пикирование на игрока.
 *                Скорость ×1.25, лёгкое самонаведение.
 *   COOLDOWN (2) — возврат на орбиту после атаки.
 *
 * Дроны, выпущенные носителем (droneState === 'orbiting'),
 * вращаются вокруг Carrier через updateOrbiting().
 *
 * Базовые константы вынесены в balance/enemies.ts.
 */

import { solveInterceptTime } from '../../aiming/AimSolver';
import type { EnemyRef } from '../../ecs';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { angleTo, clamp, lerpAngle } from '../../math';

// === Состояния ===
const ORBIT = 0;
const ATTACK = 1;
const COOLDOWN = 2;

// === Константы патруля зоны ===
/** Доля радиуса зоны, на которой дроны держат орбиту. */
const DRONE_ZONE_ORBIT_R = 0.7;
/** Скорость орбиты, рад/с. */
const DRONE_ORBIT_SPEED = 1.0;
/** Минимальный интервал между атаками, с. */
const DRONE_ATTACK_INTERVAL_MIN = 3;
/** Максимальный интервал между атаками, с. */
const DRONE_ATTACK_INTERVAL_MAX = 5;
/** Шанс атаки каждый тик (в процентах). */
const DRONE_ATTACK_CHANCE = 0.15;
/** Множитель скорости в пикировании. */
const DRONE_DIVE_MULT = 1.25;
/** Длительность пикирования, с. */
const DRONE_DIVE_DURATION = 0.7;
/** Длительность кулдауна после атаки, с. */
const DRONE_COOLDOWN = 0.6;
/** Максимальный горизонт упреждения при пикировании, с. */
const DRONE_LEAD_MAX = 0.5;
/** Скорость доворота в пикировании (лёгкое самонаведение). */
const DRIVE_TURN_RATE = 2.0;
/** Скорость доворота на орбите. */
const ORBIT_TURN_RATE = 4;
/** Скорость доворота при возврате на орбиту. */
const COOLDOWN_TURN_RATE = 3;

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    // Режим орбиты — вращение вокруг Carrier (не меняем)
    if (enemy.marker.droneState === 'orbiting') {
      this.updateOrbiting(enemy, context, dt);
      return;
    }

    // Режим атаки от носителя — переключаем на патруль зоны
    if (enemy.marker.droneState === 'attacking') {
      enemy.marker.mode = ORBIT;
      enemy.marker.modeT = 0;
    }

    // Обычное поведение (без parent) — патруль зоны
    this.updateZonePatrol(enemy, context, dt);
  }

  /**
   * Патруль зоны: дроны кружат вокруг центра зоны на фиксированном радиусе.
   * Периодически 10-20% срываются в атаку на игрока.
   */
  private updateZonePatrol(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { playerX, playerY, zoneX, zoneY, zoneRadius } = context;
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;
    const dist = Math.hypot(playerX - pos.x, playerY - pos.y) || 1;
    const angleToPlayer = angleTo(pos.x, pos.y, playerX, playerY);
    // Стабильная «единичная» случайность конкретного дрона.
    const roll = marker.seed - Math.floor(marker.seed);

    // Инициализация состояния при первом входе
    if (marker.mode < ORBIT || marker.mode > COOLDOWN) {
      marker.mode = ORBIT;
      marker.modeT = 0;
      // Направление орбиты: половина по часовой, половина против.
      marker.strafeDir = roll > 0.5 ? 1 : -1;
      // Таймер до следующей возможности атаки.
      marker.modeT = roll * (DRONE_ATTACK_INTERVAL_MAX - DRONE_ATTACK_INTERVAL_MIN) + DRONE_ATTACK_INTERVAL_MIN;
    }

    switch (marker.mode) {
      case ORBIT: {
        // Держим орбиту вокруг центра зоны.
        const orbitRadius = zoneRadius * DRONE_ZONE_ORBIT_R;
        if (orbitRadius <= 0) {
          // Зона не активна — дрейфуем.
          marker.modeT -= dt;
          if (marker.modeT <= 0) {
            marker.modeT = DRONE_ATTACK_INTERVAL_MIN;
          }
          break;
        }

        marker.modeT -= dt;

        // Двигаемся по орбите.
        marker.orbitAngle += DRONE_ORBIT_SPEED * marker.strafeDir * dt;

        // Позиция на орбите.
        pos.x = zoneX + Math.cos(marker.orbitAngle) * orbitRadius;
        pos.y = zoneY + Math.sin(marker.orbitAngle) * orbitRadius;

        // Скорость — по касательной.
        const tangentX = -Math.sin(marker.orbitAngle) * marker.strafeDir;
        const tangentY = Math.cos(marker.orbitAngle) * marker.strafeDir;
        vel.vx = tangentX * marker.speed * 0.5;
        vel.vy = tangentY * marker.speed * 0.5;

        // Нос смотрит по касательной.
        marker.angle = Math.atan2(vel.vy, vel.vx);

        // Проверяем: пора ли атаковать?
        // Шанс атаки каждый тик, но не раньше таймера.
        if (marker.modeT <= 0 && Math.random() < DRONE_ATTACK_CHANCE) {
          marker.mode = ATTACK;
          marker.modeT = DRONE_DIVE_DURATION;
        }
        break;
      }

      case ATTACK: {
        // Пикирование на игрока.
        marker.modeT -= dt;

        const speed = marker.speed * DRONE_DIVE_MULT;
        const desired = this.interceptAngle(enemy, context, speed);
        vel.vx = Math.cos(desired) * speed;
        vel.vy = Math.sin(desired) * speed;

        // Лёгкое самонаведение.
        marker.angle = lerpAngle(marker.angle, desired, 1 - Math.exp(-DRIVE_TURN_RATE * dt));

        // Пролетели игрока или истёк таймер — кулдаун.
        const closing = (playerX - pos.x) * vel.vx + (playerY - pos.y) * vel.vy;
        if (marker.modeT <= 0 || (closing < 0 && dist > 45) || dist < 20) {
          marker.mode = COOLDOWN;
          marker.modeT = DRONE_COOLDOWN;
        }
        break;
      }

      case COOLDOWN: {
        // Возврат на орбиту.
        marker.modeT -= dt;

        // Дрейфуем в сторону орбиты.
        const orbitRadius = zoneRadius * DRONE_ZONE_ORBIT_R;
        const toCenterX = zoneX - pos.x;
        const toCenterY = zoneY - pos.y;
        const toCenterDist = Math.hypot(toCenterX, toCenterY) || 1;

        // Направляемся к точке на орбите.
        const targetAngle = Math.atan2(toCenterY, toCenterX);
        const speed = marker.speed * 0.6;
        vel.vx = Math.cos(targetAngle) * speed;
        vel.vy = Math.sin(targetAngle) * speed;

        marker.angle = lerpAngle(marker.angle, targetAngle, 1 - Math.exp(-COOLDOWN_TURN_RATE * dt));

        if (marker.modeT <= 0) {
          marker.mode = ORBIT;
          marker.modeT = 0;
          // Новый таймер до атаки.
          const roll = marker.seed - Math.floor(marker.seed);
          marker.modeT = roll * (DRONE_ATTACK_INTERVAL_MAX - DRONE_ATTACK_INTERVAL_MIN) + DRONE_ATTACK_INTERVAL_MIN;
        }
        break;
      }
    }
  }

  /**
   * Угол на упреждённую точку встречи с игроком. Если дрон не может догнать
   * игрока по прямой, берём текущую позицию (лучше, чем ничего).
   */
  private interceptAngle(enemy: EnemyRef, context: GameContext, speed: number): number {
    const pos = enemy.position;
    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const t = solveInterceptTime(dx, dy, context.playerVx, context.playerVy, speed);
    const lead = t === null ? 0 : clamp(t, 0, DRONE_LEAD_MAX);
    return Math.atan2(
      context.playerY + context.playerVy * lead - pos.y,
      context.playerX + context.playerVx * lead - pos.x
    );
  }

  /**
   * Орбитальное движение вокруг Carrier (без изменений).
   */
  private updateOrbiting(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;
    const carrier = this.findParentById(enemy, context);
    if (!carrier || carrier.marker.dead) {
      // Carrier мёртв — переходим к патрулю зоны
      marker.droneState = 'attacking';
      this.updateZonePatrol(enemy, context, dt);
      return;
    }

    const orbitSpeed = 1.5; // радиан в секунду
    // Знак задаёт направление: половина роя летит по часовой, половина — против.
    const dir = marker.strafeDir >= 0 ? 1 : -1;
    marker.orbitAngle += orbitSpeed * dir * dt;

    // Устанавливаем позицию напрямую на орбите
    pos.x = carrier.position.x + Math.cos(marker.orbitAngle) * marker.orbitRadius;
    pos.y = carrier.position.y + Math.sin(marker.orbitAngle) * marker.orbitRadius;

    // Вычисляем velocity для отрисовки и collision
    const tangentX = -Math.sin(marker.orbitAngle) * dir;
    const tangentY = Math.cos(marker.orbitAngle) * dir;
    vel.vx = tangentX * marker.speed;
    vel.vy = tangentY * marker.speed;

    // Вращение: смотреть по касательной
    marker.angle = Math.atan2(vel.vy, vel.vx);
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
