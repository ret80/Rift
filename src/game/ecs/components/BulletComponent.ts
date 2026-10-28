/**
 * BulletComponent — ECS-компонент снаряда игрока.
 *
 * Снаряды игрока не имеют внешних живых ссылок на самих себя (у ракеты
 * есть homing.target, но это ссылка на *врага*, а не на снаряд). Поэтому
 * компонент хранит ссылку на живой мутируемый объект `Bullet`. Движение,
 * самонаведение и время жизни обрабатывает ECS-система BulletSystem.
 */

import type { Component } from "@trixt0r/ecs";
import type { Bullet } from "../../types";

export class BulletComponent implements Component {
  readonly type = "Bullet";
  readonly id = "Bullet";

  constructor(
    /** Живая ссылка на мутируемый объект снаряда игрока. */
    public bullet: Bullet,
  ) {}
}