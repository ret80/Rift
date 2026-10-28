/**
 * EnemyComponent — компонент врага, прикреплённый к ECS-сущности.
 *
 * Враги в игре — живые мутируемые объекты `Enemy` (на них висят ссылки из
 * homing-ракет, AI-стратегий и физики). Поэтому ECS-сущность не копирует
 * поля, а хранит ссылку на существующий объект `Enemy`. Все системы
 * (AI, стрельба, физика, коллизии) продолжают читать/писать `enemy`
 * напрямую, а ECS даёт единый реестр сущностей и производный список.
 */

import type { Component } from "@trixt0r/ecs";
import type { Enemy } from "../../types";

export class EnemyComponent implements Component {
  readonly type = "Enemy";
  readonly id = "Enemy";

  constructor(
    /** Живая ссылка на мутируемый объект врага. */
    public enemy: Enemy,
  ) {}
}