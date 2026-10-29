/**
 * HealthComponent — здоровье сущности (враг, дрон, игрок).
 * Чистые данные: системы урона/гибели читают и пишут hp и maxHp.
 */

import type { Component } from "@trixt0r/ecs";

export class HealthComponent implements Component {
  readonly type = "Health";
  readonly id = "Health";

  constructor(
    public hp = 0,
    public maxHp = 0,
  ) {}
}