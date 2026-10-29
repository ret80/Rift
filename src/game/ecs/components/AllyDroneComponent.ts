/**
 * AllyDroneComponent — ECS-компонент дрона-компаньона игрока.
 *
 * Дрон — живая боевая единица роя: он кружит вокруг корабля, сам выбирает
 * цель и стреляет по ней снарядами с упреждением, а также получает урон от
 * вражеских снарядов. Компонент хранит только чистые данные (без ссылки на
 * внешний объект `AllyDrone`); орбиту, выбор цели, стрельбу и урон ведёт
 * ECS-система AllyDroneSystem, а `EcsWorld.allyDrones()` отдаёт
 * свежесобранные plain-объекты для рендера и чтения.
 */

import type { Component } from "@trixt0r/ecs";
import type { DroneCombatSpec, DroneId } from "../../drones/Drone";

export class AllyDroneComponent implements Component {
  readonly type = "AllyDrone";
  readonly id = "AllyDrone";

  constructor(
    /** EntityRef: id ECS-сущности дрона (для удаления/нанесения урона в ECS). */
    public entityId: number | string = "",
    public x = 0,
    public y = 0,
    public r = 0,
    public angle = 0,
    public fireCd = 0,
    public phase = 0,
    public hp = 0,
    public maxHp = 0,
    /** EntityRef: id ECS-сущности текущей цели (или null). */
    public targetId: number | string | null = null,
    public retargetT = 0,
    public flash = 0,
    /** Постоянная единица флота — восстанавливается после гибели. */
    public permanent = false,
    /** Вид дрона (для отрисовки и служебной логики). */
    public kind: DroneId = "scout",
    /** Боевые характеристики единицы дрона. */
    public combat: DroneCombatSpec | null = null,
  ) {}
}