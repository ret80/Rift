/**
 * PickupCollectionSystem — ECS-система подбора пикапов игроком.
 *
 * Проверяет пересечение бонуса с хитбоксом игрока и публикует событие
 * pickup_collected в шину, после чего удаляет сущность. Заменяет прежний
 * массивный PickupCollection (побочный эффект сбора по-прежнему
 * обрабатывается подписчиками EventBus).
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import type { EventBus } from "../../core/EventBus";
import { PickupComponent } from "../components/PickupComponent";
import { GameEntity } from "../GameEntity";

/** Хитбокс игрока в игровых координатах. */
export type PlayerHitboxSource = () => { x: number; y: number; r: number };

export class PickupCollectionSystem extends System {
  private aspect: Aspect | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly getPlayer: PlayerHitboxSource,
  ) {
    super(1); // после движения — бонусы уже в актуальной позиции
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(PickupComponent);
  }

  process(): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const player = this.getPlayer();
    const playerR = player.r;
    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const pickup = entity.components.get(PickupComponent);
      if (!pickup) continue;

      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < playerR + pickup.r) {
        this.eventBus.publish("pickup_collected", {
          kind: pickup.kind,
          x: pickup.x,
          y: pickup.y,
        });
        toRemove.push(entity);
      }
    }

    for (const entity of toRemove) {
      this.engine?.entities.remove(entity);
    }
  }
}