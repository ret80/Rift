/**
 * AllyDroneComponent — ECS-компонент дрона-компаньона игрока.
 *
 * Дроны — живые мутируемые объекты `AllyDrone`: на них есть ссылка на
 * текущую цель (`target: Enemy`), которую выбирает DroneWeapon. Поэтому
 * ECS-сущность не копирует поля, а хранит ссылку на существующий объект.
 * Орбита, выбор цели и стрельба остаются в DroneWeapon; ECS даёт единый
 * реестр дронов и производный список.
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