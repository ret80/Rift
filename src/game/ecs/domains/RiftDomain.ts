/**
 * RiftDomain — разломы как ECS-сущности.
 *
 * Разлом хранит только компонент-данные RiftComponent; таймеры и фазы
 * обновляет RiftField, а домен отвечает за регистрацию и чтение.
 */

import type { Rift } from "../../types";
import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { RiftComponent } from "../components/RiftComponent";

export class RiftDomain {
  constructor(private readonly ecs: EcsEngine) {}

  /** Зарегистрировать разлом. */
  add(rift: Rift): void {
    const entity = new GameEntity();
    entity.components.add(new RiftComponent(
      rift.x, rift.y, rift.t, rift.state, rift.queue, rift.timer,
      rift.seed, rift.rot, rift.size,
    ));
    this.ecs.add(entity);
  }

  /** Снапшоты разломов для рендера и чтения. */
  rifts(): Rift[] {
    const result: Rift[] = [];
    for (const entity of this.ecs.entitiesWith(RiftComponent)) {
      const component = entity.components.get(RiftComponent);
      if (!component) continue;
      result.push({
        x: component.x,
        y: component.y,
        t: component.t,
        state: component.state,
        queue: component.queue,
        timer: component.timer,
        seed: component.seed,
        rot: component.rot,
        size: component.size,
      });
    }
    return result;
  }

  /** Удалить все разломы. */
  clear(): void {
    for (const entity of [...this.ecs.entitiesWith(RiftComponent)]) {
      this.ecs.remove(entity);
    }
  }
}
