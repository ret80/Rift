/**
 * LifeComponent — остаток жизни/времени существования сущности (секунды).
 * Чистые данные: системы (пули, частицы, лучи, кольца) затухают и удаляют
 * сущность, когда `remaining` достигает нуля.
 */

import type { Component } from "@trixt0r/ecs";

export class LifeComponent implements Component {
  readonly type = "Life";
  readonly id = "Life";

  constructor(
    /** Остаток жизни, секунды. */
    public remaining = 0,
    /** Полная длительность — для расчёта затухания (обычно == remaining). */
    public max = 0,
  ) {}
}