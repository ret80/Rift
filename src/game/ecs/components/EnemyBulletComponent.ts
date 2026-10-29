/**
 * EnemyBulletComponent — данные вражеского снаряда.
 *
 * Вражеские болты описываются базовыми компонентами-данными (Position + Velocity
 * + Life), а EnemyBulletComponent хранит тип (тяжёлый/крейсерский) и урон.
 * Swept-позиция и флаг касания — в соседнем BulletSweepComponent. Никаких
 * живых ссылок на внешние объекты — только данные.
 */

import type { Component } from "@trixt0r/ecs";

export class EnemyBulletComponent implements Component {
  readonly type = "EnemyBullet";
  readonly id = "EnemyBullet";

  constructor(
    /** Урон снаряда при попадании. */
    public dmg = 0,
    /** Тяжёлый болт. */
    public heavy = false,
    /** Крейсерский болт. */
    public cruiser = false,
  ) {}
}