/**
 * HomingRef — компонент самонаведения ракеты.
 *
 * Заменяет живую ссылку `target: Enemy` на ссылку по id сущности:
 * система резолвит цель через `engine.entities.get(targetId)` и читает её
 * компоненты (обычно Position). Это убирает прямые внешние ссылки на
 * объекты и делает систему честной ECS-логикой.
 */

import type { Component } from "@trixt0r/ecs";

export class HomingRef implements Component {
  readonly type = "Homing";
  readonly id = "Homing";

  constructor(
    /** id сущности-цели (в Enemy/Player), либо null — целей нет. */
    public targetId: number | string | null = null,
    /** Скорость поворота ракеты, рад/сек. */
    public turnRate = 0,
    /** Радиус захвата новой цели, px. */
    public lockRange = 0,
  ) {}
}