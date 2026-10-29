/**
 * PickupKindComponent — маркер вида подбираемого бонуса.
 *
 * Сама сущность пикапа составлена из базовых компонентов-данных:
 * Position + Velocity + Life + Radius (вид бонуса — в этом маркере).
 * Системы читают позицию/скорость/жизнь/радиус через Aspect, а не через
 * ссылку на внешний объект Pickup.
 */

import type { Component } from "@trixt0r/ecs";
import type { PickupKind } from "../../balance";

export class PickupKindComponent implements Component {
  readonly type = "PickupKind";
  readonly id = "PickupKind";

  constructor(
    public kind: PickupKind,
  ) {}
}