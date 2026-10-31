/**
 * RingSystem — ECS-система симуляции расширяющегося кольца эффекта.
 *
 * Оперирует сущностями с компонентами Position + Life (и маркером
 * RingComponent): расширяет радиус со скоростью RingComponent.vr и удаляет
 * просроченные кольца. Логика — по компонентам через Aspect, без ссылок на
 * внешний объект Ring. `EcsWorld.rings()` отдаёт read-only снапшот (DTO на лету)
 * для рендера, не мутируя его здесь.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../SystemSchedule";
import { PositionComponent } from "../components/PositionComponent";
import { LifeComponent } from "../components/LifeComponent";
import { RingComponent } from "../components/RingComponent";
import { GameEntity } from "../GameEntity";

export class RingSystem extends PhasedSystem {
  private aspect: Aspect | null = null;

  constructor() {
    super(Phase.Enemies);
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(RingComponent, PositionComponent, LifeComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities]) {
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
