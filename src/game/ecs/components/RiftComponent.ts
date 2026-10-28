/**
 * RiftComponent — ECS-компонент пространственного разлома (рифта).
 *
 * Разлом — точка, растягивающаяся в трещину, из которой выходят враги
 * и затем закрывается. Компонент хранит ссылку на живой мутируемый объект
 * `Rift`; жизненный цикл (opening → spawning → closing) обрабатывает
 * ECS-система RiftSystem.
 */

import type { Component } from "@trixt0r/ecs";
import type { Rift } from "../../types";

export class RiftComponent implements Component {
  readonly type = "Rift";
  readonly id = "Rift";

  constructor(
    /** Живая ссылка на мутируемый объект разлома. */
    public rift: Rift,
  ) {}
}