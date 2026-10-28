/**
 * PickupComponent — компонент подбираемого бонуса (пикапа).
 *
 * Переносит поля игрового объекта Pickup в ECS-компонент: координаты,
 * скорость, время жизни и вид бонуса. Потребляется системами движения,
 * сбора, физикой и рендером через aspect-фильтр.
 */

import type { Component } from "@trixt0r/ecs";
import type { PickupKind } from "../../balance";

export class PickupComponent implements Component {
  readonly type = "Pickup";
  readonly id = "Pickup";

  constructor(
    public kind: PickupKind,
    public x = 0,
    public y = 0,
    public vx = 0,
    public vy = 0,
    public life = 20,
    public seed = Math.random(),
    public r = 14,
  ) {}
}