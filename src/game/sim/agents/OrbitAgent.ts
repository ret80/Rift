/**
 * OrbitAgent — держит орбиту заданного радиуса вокруг центра зоны.
 *
 * Поведение: тангенциальная составляющая задаёт вращение, радиальная
 * корректирует радиус. У края зоны радиальная коррекция усиливается, иначе
 * агент вылетал бы за границу на больших радиусах.
 *
 * Это «базовый» агент для замера DPS и выживаемости: стабильная траектория
 * и постоянный огонь по ближайшей цели.
 */

import {
  AbstractPlayerAgent,
  arenaCenter,
  normalize,
  type AgentParams,
  type PlayerView,
  type Vec2,
} from "./PlayerAgent";
import type { Rng } from "../../core/rng";

export interface OrbitAgentOptions extends Partial<AgentParams> {
  /** Радиус орбиты, px. */
  radius?: number;
  /** Направление облёта: 1 — против часовой, -1 — по часовой. */
  direction?: 1 | -1;
}

export class OrbitAgent extends AbstractPlayerAgent {
  private readonly radius: number;
  private readonly direction: 1 | -1;

  constructor(options: OrbitAgentOptions, rng: Rng) {
    super(options, rng);
    this.radius = options.radius ?? 300;
    this.direction = options.direction ?? 1;
  }

  protected desiredMove(view: PlayerView): Vec2 {
    const arena = arenaCenter(view);
    const px = view.player.x;
    const py = view.player.y;

    // Радиус не может превышать зону: у края остаётся запас на манёвр.
    const maxRadius = view.zone && view.zone.active ? arena.radius * 0.78 : arena.radius;
    const targetRadius = Math.min(this.radius, Math.max(80, maxRadius));

    const dx = px - arena.x;
    const dy = py - arena.y;
    const dist = Math.hypot(dx, dy);

    // В центре радиальное направление не определено — берём любое.
    const radial = dist > 1e-3 ? { x: dx / dist, y: dy / dist } : { x: 1, y: 0 };
    const tangential = { x: -radial.y * this.direction, y: radial.x * this.direction };

    // Ошибка радиуса: положительная — агент снаружи и должен войти внутрь.
    const radialError = clampRange((dist - targetRadius) / Math.max(80, targetRadius * 0.6), -1, 1);
    // Снаружи зоны — жёстко внутрь: край зоны дороже орбиты.
    const zoneError =
      view.zone && view.zone.active && dist > arena.radius * 0.9
        ? 1.5 * clampRange((dist - arena.radius * 0.9) / (arena.radius * 0.1), 0, 1)
        : 0;

    return normalize(
      tangential.x + radial.x * (-radialError - zoneError),
      tangential.y + radial.y * (-radialError - zoneError),
    );
  }
}

/** Ограничить значение диапазоном. */
function clampRange(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}
