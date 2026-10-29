/**
 * PickupMovementSystem — ECS-система движения и времени жизни пикапов.
 *
 * Оперирует сущностями с компонентами Position + Velocity + Life (и
 * маркером PickupKindComponent): интегрирует скорость, притягивает бонус
 * к игроку в радиусе магнита и удаляет просроченные пикапы. Логика — по
 * компонентам через Aspect, без ссылок на внешний объект Pickup.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { ZONE_PICKUP_MAGNET } from "../../balance";
import { PositionComponent } from "../components/PositionComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { LifeComponent } from "../components/LifeComponent";
import { PickupKindComponent } from "../components/PickupKindComponent";
import { GameEntity } from "../GameEntity";

/** Источник позиции игрока для магнита. */
export type PlayerPositionSource = () => { x: number; y: number };

export class PickupMovementSystem extends System {
  private aspect: Aspect | null = null;

  constructor(private readonly getPlayer: PlayerPositionSource) {
    super(0); // выполняем до сбора (позиция должна обновиться первой)
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(PickupKindComponent, PositionComponent, VelocityComponent, LifeComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const player = this.getPlayer();
    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      if (!position || !velocity || !life) continue;

      // Движение дрифтом
      position.x += velocity.vx * dt;
      position.y += velocity.vy * dt;

      // Магнит к игроку: чем ближе, тем сильнее
      const dx = player.x - position.x;
      const dy = player.y - position.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ZONE_PICKUP_MAGNET && dist > 2) {
        const fraction = Math.pow(1 - dist / ZONE_PICKUP_MAGNET, 0.5) * 25;
        position.x += dx * fraction * dt;
        position.y += dy * fraction * dt;
      }

      life.remaining -= dt;
      if (life.remaining <= 0) {
        toRemove.push(entity);
      }
    }

    for (const entity of toRemove) {
      this.engine?.entities.remove(entity);
    }
  }
}