/**
 * RingComponent — ECS-компонент расширяющегося кольца эффекта (взрывная волна).
 *
 * Кольцо — визуальный элемент: радиус растёт со скоростью vr, а время
 * жизни ограничено `life`. Компонент хранит ссылку на живой мутируемый
 * объект `Ring`; симуляция обновляется ECS-системой.
 */

import type { Component } from "@trixt0r/ecs";
import type { Ring } from "../../types";

export class RingComponent implements Component {
  readonly type = "Ring";
  readonly id = "Ring";

  constructor(
    /** Живая ссылка на мутируемый объект кольца. */
    public ring: Ring,
  ) {}
}