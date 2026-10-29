/**
 * BulletComponent — данные снаряда игрока.
 *
 * Снаряд полностью описан базовыми компонентами-данными: Position + Velocity
 * + Life задают геометрию/движение/время жизни, а BulletComponent хранит
 * урон (и, для самонаводящихся ракет, соседний компонент HomingRef с id
 * цели). Никаких живых ссылок на внешние объекты — только данные. Движение,
 * самонаведение и время жизни обрабатывает ECS-система BulletSystem.
 */

import type { Component } from "@trixt0r/ecs";

export class BulletComponent implements Component {
  readonly type = "Bullet";
  readonly id = "Bullet";

  constructor(
    /** Урон снаряда при попадании. */
    public dmg = 0,
  ) {}
}