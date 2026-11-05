/**
 * KiteAgent — держит дистанцию до ближайшего врага.
 *
 * Слишком близко — отходит, слишком далеко — сближается, в рабочем
 * диапазоне страйфит перпендикулярно цели. Такой профиль ближе к
 * аккуратной игре, чем орбита: агент не влетает в толпу.
 */

import {
  AbstractPlayerAgent,
  arenaCenter,
  nearestEnemy,
  normalize,
  type AgentParams,
  type PlayerView,
  type Vec2,
} from "./PlayerAgent";
import type { Rng } from "../../core/rng";

export interface KiteAgentOptions extends Partial<AgentParams> {
  /** Минимальная дистанция до цели, px. */
  minRange?: number;
  /** Максимальная дистанция до цели, px. */
  maxRange?: number;
  /** Направление страйфа. */
  direction?: 1 | -1;
  /** Доля радиуса зоны, до которой разрешена тактика (default 0.82). */
  zoneMargin?: number;
}

export class KiteAgent extends AbstractPlayerAgent {
  protected readonly minRange: number;
  protected readonly maxRange: number;
  protected readonly zoneMargin: number;
  protected direction: 1 | -1;

  constructor(options: KiteAgentOptions, rng: Rng) {
    super(options, rng);
    this.minRange = options.minRange ?? 240;
    this.maxRange = options.maxRange ?? 420;
    this.zoneMargin = options.zoneMargin ?? 0.82;
    this.direction = options.direction ?? 1;
  }

  protected desiredMove(view: PlayerView): Vec2 {
    const base = this.kiteMove(view);
    return this.keepInsideZone(view, base);
  }

  /** Базовый вектор кайта (используется и EvadeAgent). */
  protected kiteMove(view: PlayerView): Vec2 {
    const target = nearestEnemy(view);
    if (!target) {
      // Нет цели — к центру арены, но не в упор.
      const arena = arenaCenter(view);
      const toCenter = normalize(arena.x - view.player.x, arena.y - view.player.y);
      return toCenter;
    }

    const dx = target.x - view.player.x;
    const dy = target.y - view.player.y;
    const dist = Math.hypot(dx, dy) || 1;
    const toTarget = { x: dx / dist, y: dy / dist };
    const strafe = { x: -toTarget.y * this.direction, y: toTarget.x * this.direction };

    let radial = 0;
    if (dist < this.minRange) radial = -1;
    else if (dist > this.maxRange) radial = 1;

    // Расталкивание с ближними врагами: кайт по одной цели не спасает от
    // роя, который подходит с нескольких сторон.
    const separation = this.separation(view);
    return normalize(
      toTarget.x * radial + strafe.x * 0.85 + separation.x * 1.2,
      toTarget.y * radial + strafe.y * 0.85 + separation.y * 1.2,
    );
  }

  /** Суммарное отталкивание от врагов в радиусе `radius`. */
  protected separation(view: PlayerView, radius = 200): Vec2 {
    let sx = 0;
    let sy = 0;
    for (const enemy of view.enemies) {
      if (enemy.hp <= 0) continue;
      const dx = view.player.x - enemy.x;
      const dy = view.player.y - enemy.y;
      const dist = Math.hypot(dx, dy);
      if (dist > radius || dist < 1e-3) continue;
      const weight = 1 - dist / radius;
      sx += (dx / dist) * weight;
      sy += (dy / dist) * weight;
    }
    return normalize(sx, sy);
  }

  /**
   * Вернуть агента внутрь зоны.
   *
   * За краем зоны игрок получает прямой урон, поэтому возврат к центру
   * должен доминировать над тактикой: у самой границы тактика гасится
   * полностью, и агент летит строго внутрь.
   */
  protected keepInsideZone(view: PlayerView, move: Vec2): Vec2 {
    if (!view.zone || !view.zone.active || view.zone.radius <= 0) return move;
    const dx = view.player.x - view.zone.x;
    const dy = view.player.y - view.zone.y;
    const dist = Math.hypot(dx, dy);
    const limit = view.zone.radius * this.zoneMargin;
    if (dist <= limit || dist < 1e-3) return move;

    const inward = { x: -dx / dist, y: -dy / dist };
    // 0 у мягкой границы → 1 на границе зоны и дальше.
    const urgency = Math.max(0, Math.min(1, (dist - limit) / (view.zone.radius * 0.14)));
    const weight = 0.6 + 4 * urgency;
    return normalize(
      move.x * (1 - urgency) + inward.x * weight,
      move.y * (1 - urgency) + inward.y * weight,
    );
  }
}
