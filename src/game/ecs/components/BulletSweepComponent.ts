/**
 * BulletSweepComponent — данные для swept-проверки пролёта вражеского
 * снаряда мимо корабля/дрона: предыдущая позиция и флаг «касание».
 * Чистые данные: коллизионная логика читает px/py и выставляет grazed.
 */

import type { Component } from "@trixt0r/ecs";

export class BulletSweepComponent implements Component {
  readonly type = "BulletSweep";
  readonly id = "BulletSweep";

  constructor(
    /** Предыдущая позиция снаряда (для swept-проверки). */
    public px = 0,
    public py = 0,
    /** Снаряд уже засчитан как касание — повторно касанием не считается. */
    public grazed = false,
  ) {}
}