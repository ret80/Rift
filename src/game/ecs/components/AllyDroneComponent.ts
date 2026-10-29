/**
 * AllyDroneComponent — узкий доменный ECS-компонент дрона-компаньона игрока.
 *
 * Дрон — живая боевая единица роя: он кружит вокруг корабля, сам выбирает
 * цель и стреляет по ней снарядами с упреждением, а также получает урон от
 * вражеских снарядов. Компонент хранит только **доменные** поля (орбитальное
 * состояние, боевые характеристики, идентичность); позиция и радиус живут в
 * базовых `PositionComponent`/`RadiusComponent`, запас прочности — в
 * `LifeComponent`. Орбиту, выбор цели, стрельбу и урон ведёт ECS-система
 * AllyDroneSystem, работающая с этими компонентами напрямую.
 */

import type { Component } from "@trixt0r/ecs";
import type { DroneCombatSpec, DroneId } from "../../drones/Drone";

export class AllyDroneComponent implements Component {
  readonly type = "AllyDrone";
  readonly id = "AllyDrone";

  constructor(
    /** EntityRef: id ECS-сущности дрона (для удаления/нанесения урона в ECS). */
    public entityId: number | string = "",
    /** Ориентация/ствол дрона (задаётся при выстреле и на орбите). */
    public angle = 0,
    /** Текущая перезарядка, секунды. */
    public fireCd = 0,
    /** Фаза орбиты вокруг корабля, радианы. */
    public phase = 0,
    /** EntityRef: id ECS-сущности текущей цели (или null). */
    public targetId: number | string | null = null,
    public retargetT = 0,
    /** Вспышка ствола после выстрела. */
    public flash = 0,
    /** Постоянная единица флота — восстанавливается после гибели. */
    public permanent = false,
    /** Вид дрона (для отрисовки и служебной логики). */
    public kind: DroneId = "scout",
    /** Боевые характеристики единицы дрона. */
    public combat: DroneCombatSpec | null = null,
  ) {}
}