/**
 * RadiusComponent — радиус тела (хитбокс/визуальный размер).
 * Чистые данные: используется коллизиями, физикой и рендером.
 */

import type { Component } from "@trixt0r/ecs";

export class RadiusComponent implements Component {
  readonly type = "Radius";
  readonly id = "Radius";

  constructor(
    public r = 0,
  ) {}
}