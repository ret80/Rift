/**
 * BulletComponent — данные снаряда игрока.
 *
 * Снаряд полностью описан базовыми компонентами-данными: Position + Velocity
 * задают геометрию/движение, а BulletComponent хранит урон (и, для
 * самонаводящихся ракет, соседний компонент HomingRef с id цели). Никаких
 * живых ссылок на внешние объекты — только данные. Движение и самонаведение
 * обрабатывает ECS-система BulletSystem.
 *
 * Время жизни есть только у ракет (LifeComponent): орудийный снаряд летит
 * до края игровой зоны, где уничтожается той же BulletSystem.
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