/**
 * HunterStrategy - перехват (intercept pursuit).
 * Хантер предугадывает курс игрока по его текущей скорости и аналитически
 * вычисляет точку встречи (intercept point): решает уравнение
 *   | P + Vp·t - H | = Vs·t
 * относительно времени t и движется в точку P + Vp·t.
 *
 * Точка пересчитывается КАЖДЫЙ кадр — как только игрок меняет курс,
 * точка встречи смещается, и хантер автоматически корректирует маршрут.
 */

import { lerpAngle } from '../../math';
import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

// Максимальное время упреждения: хантер не летит "в никуда" слишком далеко
// (ограничивает точку перехвата при длинных прямых курсах игрока)
const MAX_LOOKAHEAD = 1.8;
// Порог скорости игрока: ниже считаем его неподвижным → точка = его позиция
const MIN_SPEED_EPS = 8;
// На этой дистанции до цели хантер начинает тормозить, чтобы не проскочить
const BRAKE_DIST = 70;

export class HunterStrategy implements IEnemyStrategy {
  /**
   * Аналитический расчёт точки перехвата.
   * Возвращает точку мира, в которую нужно лететь, или null,
   * если догнать игрока по прямой невозможно (игрок быстрее и уходит).
   */
  private computeIntercept(
    hx: number, hy: number,
    px: number, py: number,
    pvx: number, pvy: number,
    hunterSpeed: number
  ): { x: number; y: number } | null {
    // Игрок практически стоит — перехватываем в его текущей позиции
    const pSpeed2 = pvx * pvx + pvy * pvy;
    if (pSpeed2 < MIN_SPEED_EPS * MIN_SPEED_EPS) {
      return { x: px, y: py };
    }

    const dx = px - hx;
    const dy = py - hy;
    const d2 = dx * dx + dy * dy;

    const vs2 = hunterSpeed * hunterSpeed;
    const a = pSpeed2 - vs2;
    const b = 2 * (dx * pvx + dy * pvy);
    const c = d2;

    // Момент встречи t из квадратного уравнения a·t² + b·t + c = 0
    let t = -1;
    if (Math.abs(a) < 1e-6) {
      // Линейный случай (|Vp| ≈ |Vs|): t = -c / b
      if (Math.abs(b) > 1e-6) {
        t = -c / b;
      }
    } else {
      const disc = b * b - 4 * a * c;
      if (disc >= 0) {
        const sq = Math.sqrt(disc);
        const t1 = (-b - sq) / (2 * a);
        const t2 = (-b + sq) / (2 * a);
        // Берём минимальный положительный корень
        if (t1 > 0 && !(t2 > 0 && t2 < t1)) t = t1;
        else if (t2 > 0) t = t2;
      }
    }

    if (t <= 0) return null; // догнать по прямой нельзя — игрок быстрее

    t = Math.min(t, MAX_LOOKAHEAD);
    return { x: px + pvx * t, y: py + pvy * t };
  }

  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY, playerVx, playerVy } = context;

    // Точка встречи, пересчитанная в этом кадре
    const intercept = this.computeIntercept(
      enemy.x, enemy.y,
      playerX, playerY,
      playerVx, playerVy,
      enemy.speed
    );

    // Цель маршрута: точка перехвата; если её нет — прямой pursuit
    const tx = intercept ? intercept.x : playerX;
    const ty = intercept ? intercept.y : playerY;

    const gx = tx - enemy.x;
    const gy = ty - enemy.y;
    const gd = Math.hypot(gx, gy) || 1;

    // У самой точки встречи тормозим, чтобы не проскочить мимо игрока
    const targetSpeed = enemy.speed * Math.min(1, gd / BRAKE_DIST);

    const k = 1 - Math.exp(-(gd < 120 ? 7.5 : 4.5) * dt);
    enemy.vx += ((gx / gd) * targetSpeed - enemy.vx) * k;
    enemy.vy += ((gy / gd) * targetSpeed - enemy.vy) * k;

    // Вращение: смотреть по направлению движения
    const hv = Math.hypot(enemy.vx, enemy.vy);
    if (hv > 5) {
      const targetAngle = Math.atan2(enemy.vy, enemy.vx);
      enemy.angle = lerpAngle(enemy.angle, targetAngle, 1 - Math.exp(-6 * dt));
    }
  }
}
