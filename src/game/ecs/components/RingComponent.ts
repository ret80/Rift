/**
 * RingComponent — данные-компонент расширяющегося кольца эффекта (взрывная волна).
 *
 * Это чистые данные, НЕ обёртка над живым объектом `Ring`. Позиция/жизнь
 * хранятся в базовых компонентах (PositionComponent, LifeComponent), а здесь —
 * цвет и скорость расширения радиуса. Симуляция (рост + затухание) обновляется
 * ECS-системой; `EcsWorld` предоставляет стабильный cached-view объекта `Ring`
 * для рендера.
 */

import type { Component } from "@trixt0r/ecs";
import type { RGBA } from "../../render/index";

export class RingComponent implements Component {
  readonly type = "Ring";
  readonly id = "Ring";

  /** Текущий радиус кольца, px. */
  public r: number;
  /** Скорость расширения радиуса, px/сек. */
  public vr: number;
  /** Цвет кольца (RGBA). */
  public c: RGBA;

  constructor(r: number, vr: number, c: RGBA) {
    this.r = r;
    this.vr = vr;
    this.c = c;
  }
}