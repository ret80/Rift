/**
 * VelocityComponent — скорость сущности (мировые координаты, px/сек).
 * Чистые данные: используется системами движения и адаптерами физики.
 */

import type { Component } from "@trixt0r/ecs";

export class VelocityComponent implements Component {
  readonly type = "Velocity";
  readonly id = "Velocity";

  constructor(
    public vx = 0,
    public vy = 0,
  ) {}
}