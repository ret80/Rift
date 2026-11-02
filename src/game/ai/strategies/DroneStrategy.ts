/**
 * DroneStrategy — поведение дронов: рой, а не одиночные тараны.
 *
 * Режимы (marker.mode):
 *   APPROACH (0) — подход к кольцу вокруг игрока. Угол слота = seed·2π,
 *                  чтобы стая подходила с разных сторон.
 *   HOLD     (1) — удержание на кольце, касательный стрейф. Направление
 *                  стрейфа/орбиты у каждого дрона своё (seed задаёт сторону),
 *                  поэтому часть роя идёт по часовой, часть — против.
 *   DIVE     (2) — пикирование на упреждённую точку. Лёгкое самонаведение
 *                  (доворот 2.4 рад/с), скорость ×1.35.
 *   PURSUE   (3) — короткий рывок на игрока (0.8 с, скорость ×1.1).
 *                  Лишь ~20% дронов выбирают его — остальные пикируют.
 *   COOLDOWN (4) — пауза 0.8–1.3 с, затем снова APPROACH.
 *
 * Дроны, выпущенные носителем, первый заход делают сразу, без HOLD.
 *
 * Базовые константы вынесены в balance/enemies.ts.
 */

import { solveInterceptTime } from '../../aiming/AimSolver';
import type { EnemyRef } from '../../ecs';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';
import { angleTo, clamp, lerpAngle, smoothVelocity } from '../../math';

// === Состояния ===
const APPROACH = 0;
const HOLD = 1;
const DIVE = 2;
const PURSUE = 3;
const COOLDOWN = 4;

// === Константы роя ===
/** Радиус кольца вокруг игрока, на котором дроны формируют рой. */
const DRONE_RING_RADIUS = 230;
/** Минимальное время удержания на кольце, с. */
const DRONE_HOLD_MIN = 0.5;
/** Максимальное время удержания на кольце, с. */
const DRONE_HOLD_MAX = 1.2;
/** Множитель скорости в пикировании. */
const DRONE_DIVE_MULT = 1.35;
/** Длительность пикирования, с. */
const DRONE_DIVE_DURATION = 0.9;
/** Множитель скорости в преследовании. */
const DRONE_PURSUE_MULT = 1.1;
/** Длительность преследования, с. Короткий рывок, не погоня. */
const DRONE_PURSUE_DURATION = 0.8;
/** Длительность кулдауна после атаки, с. */
const DRONE_COOLDOWN = 0.8;
/** Максимальный горизонт упреждения при пикировании, с. */
const DRONE_LEAD_MAX = 0.6;
/** Скорость доворота в пикировании (лёгкое самонаведение). */
const DRIVE_TURN_RATE = 2.4;
/** Скорость доворота в подходе. */
const APPROACH_TURN_RATE = 5;
/** Скорость доворота при стрейфе. */
const HOLD_TURN_RATE = 3.5;
/** Скорость доворота в преследовании. */
const PURSUE_TURN_RATE = 5.5;
/** Скорость доворота в кулдауне. */
const COOLDOWN_TURN_RATE = 2.5;
/** Множитель скорости в подходе. */
const APPROACH_SPEED_MULT = 1.0;
/** Скорость стрейфа при удержании (доля от базовой). */
const HOLD_STRAFE_MULT = 0.5;
/** Порог дистанции для перехода HOLD → атака. */
const DIVE_DIST_THRESHOLD = 200;

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
   * Роевое поведение: APPROACH → HOLD → DIVE/PURSUE → COOLDOWN.
   * Дроны в основном кружат вокруг игрока на кольце.
   * Лишь ~20% срываются в атаку (пике или редкое преследование).
   */
  private updateSwarm(enemy: EnemyRef, context: GameContext, dt: number): void {
    const { playerX, playerY } = context;
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;
    const dist = Math.hypot(playerX - pos.x, playerY - pos.y) || 1;
    const angleToPlayer = angleTo(pos.x, pos.y, playerX, playerY);
    // Стабильная «единичная» случайность конкретного дрона.
    const roll = marker.seed - Math.floor(marker.seed);

    // Инициализация состояния при первом входе
    if (marker.mode < APPROACH || marker.mode > COOLDOWN) {
      marker.mode = APPROACH;
      marker.modeT = 0;
      marker.strafeDir = roll > 0.5 ? 1 : -1;
    }

    switch (marker.mode) {
      case APPROACH: {
        // Подход к кольцу: точка на дуге вокруг игрока, угол = seed·2π.
        // Направление обхода задаёт seed/strafeDir: половина роя идёт
        // по часовой, половина — против.
        const slot = marker.seed * Math.PI * 2;
        const tx = playerX + Math.cos(slot) * DRONE_RING_RADIUS;
        const ty = playerY + Math.sin(slot) * DRONE_RING_RADIUS;
        const targetAngle = Math.atan2(ty - pos.y, tx - pos.x);

        const speed = marker.speed * APPROACH_SPEED_MULT;
        smoothVelocity(vel, Math.cos(targetAngle) * speed, Math.sin(targetAngle) * speed, APPROACH_TURN_RATE, dt);

        // Вращение: смотреть по направлению движения
        this.faceVelocity(enemy, 6, dt);

        // Достигли кольца — переходим к HOLD
        if (dist < DRONE_RING_RADIUS + 40) {
          marker.mode = HOLD;
          marker.modeT = DRONE_HOLD_MIN + roll * (DRONE_HOLD_MAX - DRONE_HOLD_MIN);
          marker.strafeDir = roll > 0.5 ? 1 : -1;
        }
        break;
      }

      case HOLD: {
        // Удержание на кольце, касательный стрейф в свою сторону.
        marker.modeT -= dt;

        const strafeAngle = angleToPlayer + (Math.PI / 2) * marker.strafeDir;
        const speed = marker.speed * HOLD_STRAFE_MULT;
        smoothVelocity(vel, Math.cos(strafeAngle) * speed, Math.sin(strafeAngle) * speed, HOLD_TURN_RATE, dt);

        // Вращение: смотреть по курсу стрейфа
        this.faceVelocity(enemy, 5, dt);

        // Таймер истёк или игрок уже вплотную — атакуем.
        if (marker.modeT <= 0 || dist < DIVE_DIST_THRESHOLD) {
          if (roll > 0.8) {
            // Редкий дрон срывается в прямое преследование.
            marker.mode = PURSUE;
            marker.modeT = DRONE_PURSUE_DURATION;
          } else {
            // Обычный дрон — короткое пике на упреждённую точку.
            marker.mode = DIVE;
            marker.modeT = DRONE_DIVE_DURATION;
            marker.lockAngle = this.interceptAngle(enemy, context, marker.speed * DRONE_DIVE_MULT);
          }
        }
        break;
      }

      case DIVE: {
        // Пикирование: летим на упреждённую точку, слегка подруливая.
        marker.modeT -= dt;

        const speed = marker.speed * DRONE_DIVE_MULT;
        const desired = this.interceptAngle(enemy, context, speed);
        smoothVelocity(vel, Math.cos(desired) * speed, Math.sin(desired) * speed, DRIVE_TURN_RATE, dt);
        this.faceVelocity(enemy, 10, dt);

        // Пролетели игрока или истёк таймер — кулдаун.
        const closing = (playerX - pos.x) * vel.vx + (playerY - pos.y) * vel.vy;
        if (marker.modeT <= 0 || (closing < 0 && dist > 45) || dist < 20) {
          marker.mode = COOLDOWN;
          marker.modeT = DRONE_COOLDOWN + roll * 0.5;
        }
        break;
      }

      case PURSUE: {
        // Короткое прямое преследование: дрон реально гонится за игроком,
        // а не просто летит мимо. Через 1.25 с снова уходит на кольцо.
        marker.modeT -= dt;

        const speed = marker.speed * DRONE_PURSUE_MULT;
        const desired = this.interceptAngle(enemy, context, speed);
        smoothVelocity(vel, Math.cos(desired) * speed, Math.sin(desired) * speed, PURSUE_TURN_RATE, dt);
        this.faceVelocity(enemy, 8, dt);

        if (marker.modeT <= 0 || dist > 520) {
          marker.mode = COOLDOWN;
          marker.modeT = DRONE_COOLDOWN + roll * 0.5;
        }
        break;
      }

      case COOLDOWN: {
        marker.modeT -= dt;

        // Отход в сторону, чтобы перестроиться для следующего захода.
        const escape = angleToPlayer + Math.PI + (Math.PI / 3) * marker.strafeDir;
        const speed = marker.speed * 0.55;
        smoothVelocity(vel, Math.cos(escape) * speed, Math.sin(escape) * speed, COOLDOWN_TURN_RATE, dt);
        this.faceVelocity(enemy, 5, dt);

        if (marker.modeT <= 0) {
          // Новый цикл — снова подход к кольцу.
          marker.mode = APPROACH;
          marker.modeT = 0;
        }
        break;
      }
    }
  }

  /** Направить нос по вектору скорости. */
  private faceVelocity(enemy: EnemyRef, rate: number, dt: number): void {
    const vel = enemy.velocity;
    const speed = Math.hypot(vel.vx, vel.vy);
    if (speed <= 5) return;
    const movementAngle = Math.atan2(vel.vy, vel.vx);
    enemy.marker.angle = lerpAngle(enemy.marker.angle, movementAngle, 1 - Math.exp(-rate * dt));
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
      // Carrier мёртв — переходим к атаке
      marker.droneState = 'attacking';
      this.updateSwarm(enemy, context, dt);
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
