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

import type { EnemyRef } from "../ecs";
import type { PlayerSnapshot } from "./Weapon";

/** Дальность автонаведения по умолчанию (базовая для пушки). */
export const DEFAULT_TARGET_RANGE = 420;

export class Targeting {
  /** Ручной прицел (мышь/тач); null — прицел не задан. */
  private manualAngle: number | null = null;
  /** Игрок держит огонь. */
  private manualFiring = false;
  /** Текущая автоцель. */
  private target: EnemyRef | null = null;
  /** Угол до автоцели. */
  private autoAngle: number | null = null;
  /** Зона глушилки: в ней автонаведение отключено. */
  private isJammed?: (x: number, y: number) => boolean;

  constructor(private range: number) {}

  /** Задать ручной прицел. */
  setManualAim(angle: number | null): void {
    this.manualAngle = angle;
  }

  /** Сообщить, что игрок держит огонь. */
  setManualFiring(firing: boolean): void {
    this.manualFiring = firing;
  }

  /** Подключить проверку зоны глушилки. */
  setJammerSource(source: (x: number, y: number) => boolean): void {
    this.isJammed = source;
  }

  /** Обновить автоцель: ближайший живой враг в зоне поражения. */
  update(player: PlayerSnapshot, enemies: readonly EnemyRef[]): void {
    // В зоне глушилки автонаведение выключено; ручной прицел остаётся.
    if (this.isJammed?.(player.x, player.y)) {
      this.target = null;
      this.autoAngle = null;
      return;
    }

    let nearest: EnemyRef | null = null;
    let nearestDist = this.range;

    for (const e of enemies) {
      if (e.marker.dead) continue;
      const dist = Math.hypot(e.position.x - player.x, e.position.y - player.y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    this.target = nearest;
    this.autoAngle = nearest
      ? Math.atan2(nearest.position.y - player.y, nearest.position.x - player.x)
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
  get currentTarget(): EnemyRef | null {
    return this.target;
  }
}
