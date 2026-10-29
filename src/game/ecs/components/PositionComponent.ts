/**
 * PositionComponent — позиция сущности в мировых координатах.
 * Чистые данные: системы движения/физики/коллизий/рендера читают его
 * через Aspect, а не через ссылку на внешний объект.
 */

import type { Component } from "@trixt0r/ecs";

export class PositionComponent implements Component {
  readonly type = "Position";
  readonly id = "Position";

  constructor(
    public x = 0,
    public y = 0,
  ) {}
}