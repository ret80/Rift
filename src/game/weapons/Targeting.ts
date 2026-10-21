/**
 * Targeting — наведение оружия.
 *
 * Правило одно и простое: если в зоне поражения есть враг — стреляем
 * по нему (автонаведение), иначе берём ручной прицел (мышь/тач)
 * и стреляем, только если игрок держит огонь.
 *
 * Отдельно от оружия, чтобы любая пушка, ракета или дрон
 * пользовались одной и той же логикой выбора цели.
 */

import type { Enemy } from "../types";
import type { PlayerSnapshot } from "./Weapon";

export class Targeting {
  /** Ручной прицел (мышь/тач); null — прицел не задан. */
  private manualAngle: number | null = null;
  /** Игрок держит огонь. */
  private manualFiring = false;
  /** Текущая автоцель. */
  private target: Enemy | null = null;
  /** Угол до автоцели. */
  private autoAngle: number | null = null;

  constructor(private range: number) {}

  /** Задать ручной прицел. */
  setManualAim(angle: number | null): void {
    this.manualAngle = angle;
  }

  /** Сообщить, что игрок держит огонь. */
  setManualFiring(firing: boolean): void {
    this.manualFiring = firing;
  }

  /** Обновить автоцель: ближайший живой враг в зоне поражения. */
  update(player: PlayerSnapshot, enemies: readonly Enemy[]): void {
    let nearest: Enemy | null = null;
    let nearestDist = this.range;

    for (const e of enemies) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - player.x, e.y - player.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    this.target = nearest;
    this.autoAngle = nearest
      ? Math.atan2(nearest.y - player.y, nearest.x - player.x)
      : null;
  }

  /** Угол прицеливания: автонаведение приоритетнее ручного прицела. */
  get angle(): number | null {
    return this.autoAngle ?? this.manualAngle;
  }

  /** Оружие стреляет: есть автоцель либо игрок держит огонь. */
  get firing(): boolean {
    return this.target !== null || this.manualFiring;
  }

  /** Текущая автоцель (null — цели нет). */
  get currentTarget(): Enemy | null {
    return this.target;
  }
}
