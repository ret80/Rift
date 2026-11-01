/**
 * DroneStrategy — поведение дронов: рой, а не одиночные тараны.
 *
 * Режимы (marker.mode):
 *   APPROACH (0) — подход к кольцу 240–280 px вокруг игрока.
 *                  Угол слота = seed·2π, чтобы стая подходила с разных сторон.
 *   HOLD     (1) — удержание на кольце, касательный стрейф.
 *                  Длительность 0.35–0.9 с (по seed).
 *   DIVE     (2) — фиксированное направление (зафиксировано в APPROACH),
 *                  скорость ×1.15. После прохода — COOLDOWN.
 *   COOLDOWN (3) — пауза 0.8 с, затем снова APPROACH.
 *
 * Дроны, выпущенные носителем (droneState === 'attacking'),
 * пропускают HOLD и сразу переходят к APPROACH.
 *
 * Базовые константы вынесены в balance/enemies.ts.
 */

import type { EnemyRef } from '../../ecs';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { lerpAngle, angleTo, smoothVelocity } from '../../math';

// === Состояния ===
const APPROACH = 0;
const HOLD = 1;
const DIVE = 2;
const COOLDOWN = 3;

// === Константы роя ===
/** Радиус кольца вокруг игрока, на котором дроны формируют рой. */
const DRONE_RING_RADIUS = 260;
/** Минимальное время удержания на кольце, с. */
const DRONE_HOLD_MIN = 0.35;
/** Максимальное время удержания на кольце, с. */
const DRONE_HOLD_MAX = 0.9;
/** Множитель скорости в пикировании. */
const DRONE_DIVE_MULT = 1.15;
/** Длительность кулдауна после пикирования, с. */
const DRONE_COOLDOWN = 0.8;
/** Скорость доворота в пикировании. */
const DRIVE_TURN_RATE = 4;
/** Скорость доворота в подходе. */
const APPROACH_TURN_RATE = 5;
/** Скорость доворота при стрейфе. */
const HOLD_TURN_RATE = 3;
/** Скорость доворота в кулдауне. */
const COOLDOWN_TURN_RATE = 2;
/** Множитель скорости в подходе. */
const APPROACH_SPEED_MULT = 1.0;
/** Скорость стрейфа при удержании (доля от базовой). */
const HOLD_STRAFE_MULT = 0.4;
/** Порог дистанции для перехода HOLD → DIVE. */
const DIVE_DIST_THRESHOLD = 120;

export class DroneStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    // Режим орбиты — вращение вокруг Carrier (не меняем)
    if (enemy.marker.droneState === 'orbiting') {
      this.updateOrbiting(enemy, context, dt);
      return;
    }

    // Режим атаки от носителя — переключаем на роевой режим
    if (enemy.marker.droneState === 'attacking') {
      // Если дрон только что выпущен — начинаем с APPROACH (без HOLD)
      if (enemy.marker.mode !== DIVE && enemy.marker.mode !== COOLDOWN) {
        enemy.marker.mode = APPROACH;
        enemy.marker.modeT = 0;
      }
    }

    // Обычное поведение (без parent) — тоже роевое
    this.updateSwarm(enemy, context, dt);
  }

  /**
   * Роевое поведение: APPROACH → HOLD → DIVE → COOLDOWN.
   */
  private updateSwarm(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;
    const dist = Math.hypot(playerX - pos.x, playerY - pos.y) || 1;
    const angleToPlayer = angleTo(pos.x, pos.y, playerX, playerY);

    // Инициализация состояния при первом входе
    if (marker.mode < APPROACH || marker.mode > COOLDOWN) {
      marker.mode = APPROACH;
      marker.modeT = 0;
    }

    switch (marker.mode) {
      case APPROACH: {
        // Подход к кольцу: точка на дуге вокруг игрока, угол = seed·2π.
        const slotAngle = marker.seed * Math.PI * 2;
        const tx = playerX + Math.cos(slotAngle) * DRONE_RING_RADIUS;
        const ty = playerY + Math.sin(slotAngle) * DRONE_RING_RADIUS;
        const targetAngle = Math.atan2(ty - pos.y, tx - pos.x);

        const speed = marker.speed * APPROACH_SPEED_MULT;
        const targetVx = Math.cos(targetAngle) * speed;
        const targetVy = Math.sin(targetAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, APPROACH_TURN_RATE, dt);

        // Вращение: смотреть по направлению движения
        const dsp = Math.hypot(vel.vx, vel.vy);
        if (dsp > 5) {
          const movementAngle = Math.atan2(vel.vy, vel.vx);
          marker.angle = lerpAngle(marker.angle, movementAngle, 1 - Math.exp(-5 * dt));
        }

        // Достигли кольца — переходим к HOLD
        if (dist < DRONE_RING_RADIUS + 40) {
          marker.mode = HOLD;
          marker.modeT = DRONE_HOLD_MIN + marker.seed * (DRONE_HOLD_MAX - DRONE_HOLD_MIN);
          // Запоминаем направление стрейфа
          marker.strafeDir = marker.seed > 0.5 ? 1 : -1;
          // Фиксируем направление пикирования
          marker.angle = angleToPlayer + (Math.PI / 4) * marker.strafeDir;
        }
        break;
      }

      case HOLD: {
        // Удержание на кольце, касательный стрейф.
        marker.modeT -= dt;

        const strafeAngle = angleToPlayer + (Math.PI / 2) * marker.strafeDir;
        const speed = marker.speed * HOLD_STRAFE_MULT;
        const targetVx = Math.cos(strafeAngle) * speed;
        const targetVy = Math.sin(strafeAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, HOLD_TURN_RATE, dt);

        // Вращение: смотреть по курсу стрейфа
        const dsp = Math.hypot(vel.vx, vel.vy);
        if (dsp > 5) {
          const movementAngle = Math.atan2(vel.vy, vel.vx);
          marker.angle = lerpAngle(marker.angle, movementAngle, 1 - Math.exp(-4 * dt));
        }

        // Таймер истёк — пикируем
        if (marker.modeT <= 0) {
          marker.mode = DIVE;
          marker.modeT = 0;
          // Фиксируем направление пикирования
          marker.angle = angleToPlayer;
        }
        break;
      }

      case DIVE: {
        // Пикирование: фиксированное направление, ускорение.
        marker.modeT -= dt;

        const speed = marker.speed * DRONE_DIVE_MULT;
        const targetVx = Math.cos(marker.angle) * speed;
        const targetVy = Math.sin(marker.angle) * speed;
        smoothVelocity(vel, targetVx, targetVy, DRIVE_TURN_RATE, dt);

        // Вращение: смотреть по фиксированному направлению
        marker.angle = lerpAngle(marker.angle, marker.angle, 1 - Math.exp(-DRIVE_TURN_RATE * dt));

        // Пролетели игрока или истёк таймер — кулдаун
        const distToPlayer = Math.hypot(playerX - pos.x, playerY - pos.y);
        if (distToPlayer < 30 || marker.modeT <= -0.5) {
          marker.mode = COOLDOWN;
          marker.modeT = DRONE_COOLDOWN;
        }
        break;
      }

      case COOLDOWN: {
        marker.modeT -= dt;

        // Свободный дрейф — без наведения
        const speed = marker.speed * 0.5;
        const currentAngle = Math.atan2(vel.vy, vel.vx);
        const targetVx = Math.cos(currentAngle) * speed;
        const targetVy = Math.sin(currentAngle) * speed;
        smoothVelocity(vel, targetVx, targetVy, COOLDOWN_TURN_RATE, dt);

        if (marker.modeT <= 0) {
          // Новый цикл — снова подход к кольцу
          marker.mode = APPROACH;
          marker.modeT = 0;
        }
        break;
      }
    }
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
      // Carrier мёртв — переходим к атаке
      marker.droneState = 'attacking';
      this.updateSwarm(enemy, context, dt);
      return;
    }

    const orbitSpeed = 1.5; // радиан в секунду
    marker.orbitAngle += orbitSpeed * dt;

    // Устанавливаем позицию напрямую на орбите
    pos.x = carrier.position.x + Math.cos(marker.orbitAngle) * marker.orbitRadius;
    pos.y = carrier.position.y + Math.sin(marker.orbitAngle) * marker.orbitRadius;

    // Вычисляем velocity для отрисовки и collision
    const tangentX = -Math.sin(marker.orbitAngle);
    const tangentY = Math.cos(marker.orbitAngle);
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
