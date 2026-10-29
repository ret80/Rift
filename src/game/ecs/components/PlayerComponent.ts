/**
 * PlayerComponent — узкий доменный ECS-компонент игрока (Singleton-сущность).
 *
 * Игрок — единственный управляемый корабль, а не коллекция сущностей.
 * Позиция/скорость/радиус/запас прочности живут в базовых
 * `Position/Velocity/Radius/Life` компонентах на той же сущности; здесь
 * остаются только доменные поля: ориентация, неуязвимость, текущий импульс
 * движка и масса. Движение/урон/лечение обрабатывает PlayerSystem
 * (выделенный арбитр одиночного актора) через связку `PlayerRef`.
 */

import { massForRadius, PLAYER_RADIUS } from "../../balance";
import type { Component } from "@trixt0r/ecs";

export class PlayerComponent implements Component {
  readonly type = "Player";
  readonly id = "Player";

  constructor(
    /** Ориентация корабля, радианы (следует за скоростью). */
    public angle = -Math.PI / 2,
    /** Кадры неуязвимости после попадания. */
    public invuln = 0,
    /** Игрок в настоящий момент жмёт газ. */
    public thrusting = false,
    /** Масса корабля (для импульсов при коллизиях). */
    public mass = massForRadius(PLAYER_RADIUS),
  ) {}
}