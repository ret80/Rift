/**
 * LaserBeamComponent — ECS-компонент визуального луча лазера игрока.
 *
 * Луч лазера — мгновенный отрезок от ствола до цели. Урон наносится в
 * момент зажигания, поэтому луч живёт только как визуал и не участвует
 * в столкновениях. Компонент хранит ссылку на живой мутируемый объект
 * `LaserBeam`; затухание и удаление по времени жизни обрабатывает
 * LaserWeapon через ECS-реестр.
 */

import type { Component } from "@trixt0r/ecs";
import type { LaserBeam } from "../../types";

export class LaserBeamComponent implements Component {
  readonly type = "LaserBeam";
  readonly id = "LaserBeam";

  constructor(
    /** Живая ссылка на мутируемый объект визуального луча. */
    public beam: LaserBeam,
  ) {}
}