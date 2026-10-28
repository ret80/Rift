/**
 * ParticleComponent — ECS-компонент частицы (искра/осколок эффекта).
 *
 * Частицы — короткоживущие визуальные элементы: разлетаются, тормозят
 * и исчезают. Компонент хранит ссылку на живой мутируемый объект
 * `Particle`; симуляция обновляется ECS-системой, а не фасадом Fx.
 */

import type { Component } from "@trixt0r/ecs";
import type { Particle } from "../../types";

export class ParticleComponent implements Component {
  readonly type = "Particle";
  readonly id = "Particle";

  constructor(
    /** Живая ссылка на мутируемый объект частицы. */
    public particle: Particle,
  ) {}
}