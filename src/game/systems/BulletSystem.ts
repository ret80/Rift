/**
 * BulletSystem — движение снарядов игрока и врагов.
 *
 * Авторитетные владельцы массивов снарядов — пулы entityPool.
 * BulletSystem обрабатывает эти массивы, но не владеет ими.
 *
 * Здесь же живёт самонаведение ракет: цель хранится живой ссылкой,
 * поэтому снаряд ведёт врага, а не застывшую точку.
 */

import type { Bullet, EBullet, Enemy } from '../types';

export class BulletSystem {
  /**
   * Обновить все снаряды (движение + самонаведение + очистка по времени жизни).
   * Мутирует переданные массивы — они принадлежат entityPool.
   */
  update(dt: number, bullets: Bullet[], enemyBullets: EBullet[], enemies: readonly Enemy[]): void {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      this.steer(b, dt, enemies);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) {
        bullets.splice(i, 1);
      }
    }

    for (let i = enemyBullets.length - 1; i >= 0; i--) {
      const b = enemyBullets[i];
      // Предыдущая позиция нужна для swept-проверки пролёта мимо корабля.
      b.px = b.x;
      b.py = b.y;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.life -= dt;
      if (b.life <= 0) {
        enemyBullets.splice(i, 1);
      }
    }
  }

  /**
   * Повернуть самонаводящийся снаряд к живой цели.
   *
   * Если текущая цель погибла, ракета перенаводится на ближайшего
   * живого врага в пределах радиуса захвата (lockRange). Целей нет —
   * ракета летит прямо до конца времени жизни.
   *
   * Поворот идёт по углу с ограничением скорости: так снаряд
   * корректно наводится даже когда цель строго за кормой,
   * где сглаживание векторов даёт нулевой результат.
   */
  private steer(b: Bullet, dt: number, enemies: readonly Enemy[]): void {
    const homing = b.homing;
    if (!homing) return;

    let target = homing.target;
    if (!target || target.dead) {
      target = this.findNearest(b.x, b.y, enemies, homing.lockRange);
      homing.target = target;
    }
    if (!target) return;

    const speed = Math.hypot(b.vx, b.vy) || 1;
    const current = Math.atan2(b.vy, b.vx);
    const desired = Math.atan2(target.y - b.y, target.x - b.x);

    // Разница углов в диапазоне (-PI, PI].
    let diff = desired - current;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    // Поворот не превышает скорость наведения.
    const step = Math.min(Math.abs(diff), homing.turnRate * dt);
    const next = current + Math.sign(diff) * step;

    b.vx = Math.cos(next) * speed;
    b.vy = Math.sin(next) * speed;
  }

  /** Ближайший живой враг в пределах радиуса захвата от точки. */
  private findNearest(
    x: number,
    y: number,
    enemies: readonly Enemy[],
    lockRange: number
  ): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = lockRange;

    for (const e of enemies) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - x, e.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    return nearest;
  }
}
