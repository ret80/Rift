/**
 * EnemyBulletComponent — ECS-компонент снаряда врага.
 *
 * Вражеские снаряды (энергетические болты) хранятся так же, как снаряды
 * игрока: компонент оборачивает живой мутируемый объект `EBullet`,
 * а движение/время жизни обрабатывает ECS-система BulletSystem.
 */

import type { Component } from "@trixt0r/ecs";
import type { EBullet } from "../../types";

export class EnemyBulletComponent implements Component {
  readonly type = "EnemyBullet";
  readonly id = "EnemyBullet";

  constructor(
    /** Живая ссылка на мутируемый объект вражеского снаряда. */
    public bullet: EBullet,
  ) {}
}