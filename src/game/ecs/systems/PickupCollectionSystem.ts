/**
 * PickupCollectionSystem — ECS-система подбора пикапов игроком.
 *
 * Проверяет пересечение бонуса (Position + Radius) с хитбоксом игрока
 * и публикует событие pickup_collected в шину, после чего удаляет сущность.
 * Вид бонуса берётся из маркера PickupKindComponent. Побочный эффект сбора
 * по-прежнему обрабатывается подписчиками EventBus.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../SystemSchedule";
import type { EventBus } from "../../core/EventBus";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { PickupKindComponent } from "../components/PickupKindComponent";
import { GameEntity } from "../GameEntity";

/** Хитбокс игрока в игровых координатах. */
export type PlayerHitboxSource = () => { x: number; y: number; r: number };

export class PickupCollectionSystem extends PhasedSystem {
  private aspect: Aspect | null = null;

  constructor(
    private readonly eventBus: EventBus,
    private readonly getPlayer: PlayerHitboxSource,
  ) {
    super(Phase.EnemyActions);
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(PickupKindComponent, PositionComponent, RadiusComponent);
  }

  process(): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const player = this.getPlayer();
    const playerR = player.r;
    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities]) {
      const position = entity.components.get(PositionComponent);
      const radius = entity.components.get(RadiusComponent);
      const kind = entity.components.get(PickupKindComponent);
      if (!position || !radius || !kind) continue;

      const dx = player.x - position.x;
      const dy = player.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < playerR + radius.r) {
        this.eventBus.publish("pickup_collected", {
          kind: kind.kind,
          x: position.x,
          y: position.y,
        });
        toRemove.push(entity);
      }
    }

    for (const entity of toRemove) {
      this.engine?.entities.remove(entity);
    }
  }
}
