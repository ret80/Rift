/**
 * AsteroidAvoidance — мягкое уклонение врагов от астероидов.
 *
 * Расталкивание врагов (EnemyAvoidance) разводит корпуса позициями: там
 * нет скоростей, поэтому оно не может увернуться от камня, летящего на
 * корпус. Здесь считается прогноз сближения по относительной скорости:
 * если через t секунд камень пройдёт ближе суммы радиусов, враг получает
 * боковое ускорение в сторону от точки пролёта. Ускорение добавляется в
 * скорость, а не в позицию, — в режиме Planck его применяет физика, в
 * custom-режиме — интеграция EnemySystem.
 *
 * Уклонение реагирует только на быстрые камни (см. MIN_ASTEROID_SPEED):
 * медленно притянутый тягачом камень — его приманка, а не угроза, и
 * избегать его враг не должен. Запущенный камень летит быстрее порога,
 * поэтому от него уклоняются все.
 */

import type { AsteroidRef, EnemyRef } from "../ecs";

/** Горизонт прогноза сближения, секунды. */
const LOOKAHEAD = 1.15;
/** Дальше этого расстояния камень не рассматривается, px. */
const SCAN_RADIUS = 260;
/** Зазор сверх суммы радиусов: уклонение начинается раньше контакта, px. */
const PADDING = 14;
/** Боковое ускорение уклонения, px/с². */
const STEER_ACCEL = 2200;
/** Предельная боковая скорость манёвра, px/с. */
const MAX_ESCAPE_SPEED = 520;
/** Запас требуемой боковой скорости сверх расчётной, px/с. */
const ESCAPE_MARGIN = 2.2;
/** Предел полной скорости после уклонения, px/с. */
const MAX_SPEED = 700;
/** Астероиды медленнее этого порога игнорируются, px/с. */
const MIN_ASTEROID_SPEED = 300;

export class AsteroidAvoidance {
  /**
   * Отвернуть врагов от камней, которые пересекут их курс.
   * @param enemies живые связки врагов
   * @param asteroids все астероиды мира
   * @param dt дельта времени кадра
   */
  solve(enemies: EnemyRef[], asteroids: AsteroidRef[], dt: number): void {
    if (!asteroids.length) return;

    for (const enemy of enemies) {
      if (enemy.marker.dead) continue;
      // Орбитальные дроны кинематические: их позицию задаёт стратегия носителя.
      if (enemy.marker.droneState === "orbiting") continue;

      const ex = enemy.position.x;
      const ey = enemy.position.y;
      const evx = enemy.velocity.vx;
      const evy = enemy.velocity.vy;
      if (Math.hypot(evx, evy) < 20) continue;

      let bestScore = 0;
      let bestTime = 0;
      let bestNeed = 0;
      let steerX = 0;
      let steerY = 0;

      for (const rock of asteroids) {
        if (rock.marker.dead) continue;

        const rockSpeed = Math.hypot(rock.velocity.vx, rock.velocity.vy);
        if (rockSpeed < MIN_ASTEROID_SPEED) continue;

        const rx = rock.position.x - ex;
        const ry = rock.position.y - ey;
        const clearance = enemy.radius.r + rock.radius.r + PADDING;
        const scan = SCAN_RADIUS + rock.radius.r;
        if (rx * rx + ry * ry > scan * scan) continue;

        // Относительное движение камня в системе врага.
        const rvx = rock.velocity.vx - evx;
        const rvy = rock.velocity.vy - evy;
        const rvSq = rvx * rvx + rvy * rvy;
        if (rvSq < 1) continue;

        // Камень уже расходится с врагом — уклоняться поздно и не нужно.
        const closing = rx * rvx + ry * rvy;
        if (closing >= 0) continue;

        const t = Math.min(LOOKAHEAD, Math.max(0, -closing / rvSq));
        const missX = rx + rvx * t;
        const missY = ry + rvy * t;
        const miss = Math.hypot(missX, missY);
        if (miss >= clearance) continue;

        // Опасность — насколько глубоко камень войдёт в зазор и как скоро.
        const need = clearance - miss;
        const score = need / Math.max(t, 0.1);
        if (score <= bestScore) continue;

        let dx: number;
        let dy: number;
        if (miss > 0.001) {
          // Сторона отворота — от точки пролёта, а не от самого камня.
          dx = -missX / miss;
          dy = -missY / miss;
        } else {
          const rv = Math.sqrt(rvSq);
          dx = -rvy / rv;
          dy = rvx / rv;
        }

        bestScore = score;
        bestTime = t;
        bestNeed = need;
        steerX = dx;
        steerY = dy;
      }

      if (bestScore <= 0) continue;

      // Чтобы успеть до пролёта, боковая скорость должна сдвинуть корпус
      // на остаток зазора за время t — добавляем её с ограничением ускорения.
      const escapeSpeed = Math.min(
        MAX_ESCAPE_SPEED,
        (bestNeed / Math.max(bestTime, 0.1)) * ESCAPE_MARGIN,
      );
      const lateral = evx * steerX + evy * steerY;
      if (lateral < escapeSpeed) {
        const delta = Math.min(escapeSpeed - lateral, STEER_ACCEL * dt);
        enemy.velocity.vx += steerX * delta;
        enemy.velocity.vy += steerY * delta;
      }

      const maxSpeed = Math.max(60, Math.min(MAX_SPEED, enemy.marker.speed * 2.4));
      const speed = Math.hypot(enemy.velocity.vx, enemy.velocity.vy);
      if (speed > maxSpeed) {
        const k = maxSpeed / speed;
        enemy.velocity.vx *= k;
        enemy.velocity.vy *= k;
      }
    }
  }
}
