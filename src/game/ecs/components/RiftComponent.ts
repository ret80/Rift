/**
 * RiftComponent — чистый данные-компонент пространственного разлома (рифта).
 *
 * Разлом — точка, растягивающаяся в трещину, из которой выходят враги
 * и затем закрывается. Компонент хранит только данные (без ссылки на
 * внешний объект `Rift`); жизненный цикл (opening → spawning → closing)
 * обрабатывает ECS-система RiftField, а `EcsWorld.rifts()` отдаёт
 * свежесобранные plain-объекты для рендера.
 */

import type { Component } from "@trixt0r/ecs";
import type { EnemyKind } from "../../balance";

/** Стадия жизненного цикла разлома. */
export type RiftState = "opening" | "spawning" | "closing";

export class RiftComponent implements Component {
  readonly type = "Rift";
  readonly id = "Rift";

  constructor(
    public x = 0,
    public y = 0,
    /** Прогресс жизненного цикла: отрицательный — задержка до открытия. */
    public t = 0,
    public state: RiftState = "opening",
    /** Очередь врагов, выходящих из разлома. */
    public queue: EnemyKind[] = [],
    public timer = 0,
    public seed = 0,
    public rot = 0,
    public size = 0,
  ) {}
}