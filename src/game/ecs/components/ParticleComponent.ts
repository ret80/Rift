/**
 * ParticleComponent — данные-компонент частицы (искра/осколок эффекта).
 *
 * Это чистые данные, НЕ обёртка над живым объектом `Particle`. Позиция/
 * скорость/жизнь хранятся в базовых компонентах (PositionComponent,
 * VelocityComponent, LifeComponent), а здесь — только цвет и размер.
 * Симуляция (дрейф + затухание) обновляется ECS-системой; `EcsWorld`
 * предоставляет стабильный cached-view объекта `Particle` для рендера.
 */

import type { Component } from "@trixt0r/ecs";
import type { RGBA } from "../../render/index";

export class ParticleComponent implements Component {
  readonly type = "Particle";
  readonly id = "Particle";

  /** Цвет частицы (RGBA). */
  public c: RGBA;
  /** Радиус/размер частицы. */
  public size: number;

  constructor(c: RGBA, size: number) {
    this.c = c;
    this.size = size;
  }
}