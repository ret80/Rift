/**
 * BulletSystem — движение снарядов игрока и врагов.
 *
 * Авторитетные владельцы массивов снарядов — пулы entityPool.
 * BulletSystem обрабатывает эти массивы, но не владеет ими.
 *
 * Здесь же живёт самонаведение ракет: цель хранится живой ссылкой,
 * поэтому снаряд ведёт врага, а не застывшую точку.
 */

import type { Bullet, EBullet } from '../types';

export class BulletSystem {
  /**
   * Обновить все снаряды (движение + самонаведение + очистка по времени жизни).
   * Мутирует переданные массивы — они принадлежат entityPool.
   */
  update(dt: number, bullets: Bullet[], enemyBullets: EBullet[]): void {
    for (let i = bullets.length - 1; i >= 0; i--) {
      const b = bullets[i];
      this.steer(b, dt);
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
   * Поворот идёт по углу с ограничением скорости: так снаряд
   * корректно наводится даже когда цель строго за кормой,
   * где сглаживание векторов даёт нулевой результат.
   */
  private steer(b: Bullet, dt: number): void {
    const homing = b.homing;
    if (!homing) return;

    const target = homing.target;
    if (target.dead) return;

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
}
