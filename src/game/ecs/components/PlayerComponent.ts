/**
 * PlayerComponent — ECS-компонент игрока (Singleton-сущность).
 *
 * Игрок — единственный управляемый корабль, а не коллекция сущностей.
 * Его состояние (положение, корпус, неуязвимость) уже собрано в
 * `PlayerState`, вокруг которого живёт PlayerSystem. Поэтому компонент
 * хранит живую ссылку на состояние; сам игрок остаётся в мире как
 * одна ECS-сущность, доступная через аспект, а движение/урон/лечение
 * по-прежнему обрабатывает PlayerSystem (выделенный арбитр одиночного
 * актора). Это согласуется с паттерном «компонент-обёртка» для остальных
 * доменов.
 */

import type { Component } from "@trixt0r/ecs";
import type { PlayerState } from "../../systems/PlayerState";

export class PlayerComponent implements Component {
  readonly type = "Player";
  readonly id = "Player";

  constructor(
    /** Живая ссылка на состояние игрока. */
    public state: PlayerState,
  ) {}
}