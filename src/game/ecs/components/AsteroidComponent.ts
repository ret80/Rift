/**
 * AsteroidComponent — данные астероида (пояс-«belt»).
 *
 * Единственный источник правды для астероида: позиция, скорость, радиус,
 * здоровье и визуальные вариации (verts/angle/spin). Пояс AsteroidField
 * генерирует астероиды чанками и спавнит их как ECS-сущности с этим
 * компонентом; физика/коллизии/рендер/зона читают и мутируют компонент.
 * Никакой отдельной живой ссылки и двойной записи view↔компонент нет.
 *
 * Поле `key` — строковая идентичность в поясе (как старый `Asteroid.id`);
 * ECS-маркер `id` ("Asteroid") занят базовым классом, поэтому не используется.
 */

import type { Component } from "@trixt0r/ecs";
import type { AsteroidKind } from "../../balance";

export class AsteroidComponent implements Component {
  readonly type = "Asteroid";
  readonly id = "Asteroid";

  /** Идентичность в поясе (напр. "1,2:3" или "f12"). */
  key = "";
  kind: AsteroidKind = "small";

  // === Позиция/движение (вместо Position/Velocity) ===
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;
  spin = 0;

  // === Форма/здоровье/масса ===
  r = 0;
  /** Нормированные радиусы вершин (0.72..1.02) — форма полигона. */
  verts: number[] = [];
  hp = 0;
  maxHp = 0;
  mass = 0;
  dead = false;

  constructor(state: Partial<AsteroidComponent> = {}) {
    Object.assign(this, state);
    if (state.kind !== undefined) this.kind = state.kind as AsteroidKind;
  }
}