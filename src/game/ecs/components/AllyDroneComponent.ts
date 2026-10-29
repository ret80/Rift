/**
 * AllyDroneComponent — ECS-компонент дрона-компаньона игрока.
 *
 * Дроны — живые мутируемые объекты `AllyDrone`: текущая цель хранится
 * EntityRef-ссылкой `targetId` (id ECS-сущности врага), которую выбирает
 * DroneWeapon. ECS-сущность хранит ссылку на существующий объект дрона
 * (стабильное представление); орбита, выбор цели и стрельба остаются в
 * DroneWeapon, а ECS даёт единый реестр дронов и производный список.
 */

import type { Component } from "@trixt0r/ecs";
import type { AllyDrone } from "../../types";

export class AllyDroneComponent implements Component {
  readonly type = "AllyDrone";
  readonly id = "AllyDrone";

  constructor(
    /** Живая ссылка на мутируемый объект дрона-компаньона. */
    public drone: AllyDrone,
  ) {}
}