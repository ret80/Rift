/**
 * AsteroidComponent — узкий маркер астероида (доменные поля).
 *
 * Позиция/скорость/радиус/здоровье вынесены в базовые компоненты:
 *   PositionComponent, VelocityComponent, RadiusComponent, LifeComponent.
 * Здесь остаются только доменные поля, не покрываемые базовыми:
 *   key — идентичность в поясе; kind — крупность; angle/spin — вращение;
 *   verts — форма полигона; mass — масса; dead — флаг уничтожения.
 *
 * Значения читаются/пишутся ВМЕСТЕ с базовыми компонентами через
 * AsteroidRef (см. EcsWorld.asteroids()/spawnAsteroid).
 */

import type { Component } from "@trixt0r/ecs";
import type { AsteroidKind } from "../../balance";

export class AsteroidComponent implements Component {
  readonly type = "Asteroid";
  readonly id = "Asteroid";

  /** Идентичность в поясе (напр. "1,2:3" или "f12"). */
  key = "";
  kind: AsteroidKind = "small";
  /** Текущий угол вращения, рад. */
  angle = 0;
  /** Угловая скорость, рад/с. */
  spin = 0;
  /** Нормированные радиусы вершин (0.72..1.02) — форма полигона. */
  verts: number[] = [];
  /** Масса (для физических контактов). */
  mass = 0;
  dead = false;

  constructor(state: Partial<Omit<AsteroidComponent, "type" | "id">> = {}) {
    Object.assign(this, state);
    if (state.kind !== undefined) this.kind = state.kind as AsteroidKind;
  }
}