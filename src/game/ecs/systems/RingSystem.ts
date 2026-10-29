/**
 * RingSystem — ECS-система симуляции расширяющегося кольца эффекта.
 *
 * Оперирует сущностями с компонентами Position + Life (и маркером
 * RingComponent): расширяет радиус со скоростью RingComponent.vr и удаляет
 * просроченные кольца. Логика — по компонентам через Aspect, без ссылок на
 * внешний объект Ring. `EcsWorld.rings()` отдаёт стабильный cached-view для
 * рендера, не мутируя его здесь.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { PositionComponent } from "../components/PositionComponent";
import { LifeComponent } from "../components/LifeComponent";
import { RingComponent } from "../components/RingComponent";
import { GameEntity } from "../GameEntity";

export class RingSystem extends System {
  private aspect: Aspect | null = null;

  constructor() {
    super(0);
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(RingComponent, PositionComponent, LifeComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const ring = entity.components.get(RingComponent);
      const position = entity.components.get(PositionComponent);
      const life = entity.components.get(LifeComponent);
      if (!ring || !position || !life) continue;

      life.remaining -= dt;
      if (life.remaining <= 0) {
        toRemove.push(entity);
        continue;
      }

      // Радиус растёт со скоростью vr — хранится в PositionComponent.r? Нет:
      // кольцо «радиус» симулируется как отдельное поле RingComponent.r.
      ring.r += ring.vr * dt;
    }

    for (const entity of toRemove) {
      this.engine?.entities.remove(entity);
    }
  }
}