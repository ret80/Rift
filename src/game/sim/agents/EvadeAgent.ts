/**
 * EvadeAgent — кайт плюс уклонение от вражеских снарядов.
 *
 * Уклонение не заменяет базовую тактику, а складывается с ней: кайт даёт
 * рабочую дистанцию, вектор угрозы добавляет боковой импульс оттуда, куда
 * снаряд придёт. Приоритет — не оказаться на линии огня, а не «убежать от
 * всего»: вес уклонения ограничен.
 */

import { normalize, type PlayerView, type Vec2 } from "./PlayerAgent";
import { KiteAgent, type KiteAgentOptions } from "./KiteAgent";
import type { Rng } from "../../core/rng";

export interface EvadeAgentOptions extends KiteAgentOptions {
  /** Горизонт прогноза угрозы, секунды. */
  threatHorizon?: number;
  /** Радиус, внутри которого снаряд считается опасным, px. */
  threatRadius?: number;
  /** Вес уклонения относительно кайта. */
  evadeWeight?: number;
}

export class EvadeAgent extends KiteAgent {
  private readonly threatHorizon: number;
  private readonly threatRadius: number;
  private readonly evadeWeight: number;

  constructor(options: EvadeAgentOptions, rng: Rng) {
    super(options, rng);
    this.threatHorizon = options.threatHorizon ?? 0.9;
    this.threatRadius = options.threatRadius ?? 120;
    this.evadeWeight = options.evadeWeight ?? 1.4;
  }

  protected desiredMove(view: PlayerView): Vec2 {
    const base = this.kiteMove(view);
    const threat = this.threatVector(view);
    const combined = normalize(
      base.x + threat.x * this.evadeWeight,
      base.y + threat.y * this.evadeWeight,
    );
    return this.keepInsideZone(view, combined);
  }

  /**
   * Суммарный вектор уклонения.
   *
   * Для каждого снаряда считается время до сближения и минимальная
   * дистанция на этом отрезке; близкие и скорые снаряды дают больший вес.
   * Направление ухода — по нормали к траектории снаряда, в сторону,
   * противоположную его смещению относительно корабля.
   */
  private threatVector(view: PlayerView): Vec2 {
    let tx = 0;
    let ty = 0;
    const px = view.player.x;
    const py = view.player.y;

    for (const bullet of view.enemyBullets) {
      const relX = bullet.x - px;
      const relY = bullet.y - py;
      // Относительная скорость снаряда (корабль тоже движется).
      const relVx = bullet.vx - view.player.vx;
      const relVy = bullet.vy - view.player.vy;
      const speed2 = relVx * relVx + relVy * relVy;
      if (speed2 < 1e-6) continue;

      // Время до точки наибольшего сближения.
      const t = -(relX * relVx + relY * relVy) / speed2;
      if (t <= 0 || t > this.threatHorizon) continue;

      const closestX = relX + relVx * t;
      const closestY = relY + relVy * t;
      const closest = Math.hypot(closestX, closestY);
      if (closest > this.threatRadius) continue;

      // Нормаль к траектории: уходим в сторону, противоположную смещению.
      const bulletSpeed = Math.sqrt(speed2);
      const nx = -relVy / bulletSpeed;
      const ny = relVx / bulletSpeed;
      const side = relX * nx + relY * ny;
      const dir = side >= 0 ? 1 : -1;

      // Ближе и скорее — сильнее: вес = (1 - d/R) * (1 - t/horizon).
      const weight =
        (1 - closest / this.threatRadius) * (1 - t / this.threatHorizon);
      tx += nx * dir * weight;
      ty += ny * dir * weight;
    }

    return normalize(tx, ty);
  }

  /** Способность — по готовности и при плотной угрозе (задел под quantum_swap). */
  protected wantAbility(view: PlayerView): boolean {
    return view.enemyBullets.length > 0 && this.rng.next() < 0.02;
  }
}
