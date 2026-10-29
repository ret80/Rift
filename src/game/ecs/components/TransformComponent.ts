/**
 * TransformComponent — ориентация сущности (угол поворота, радианы).
 * Чистые данные: рендер и физика читают угол через этот компонент.
 */

import type { Component } from "@trixt0r/ecs";

export class TransformComponent implements Component {
  readonly type = "Transform";
  readonly id = "Transform";

  constructor(
    public angle = 0,
  ) {}
}