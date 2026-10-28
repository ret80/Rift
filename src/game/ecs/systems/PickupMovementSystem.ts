/**
 * PickupMovementSystem — ECS-система движения и времени жизни пикапов.
 *
 * Оперирует сущностями с компонентом PickupComponent: интегрирует скорость,
 * притягивает бонус к игроку в радиусе магнита и удаляет просроченные
 * пикапы. Заменяет прежний массивный PickupSystem.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { ZONE_PICKUP_MAGNET } from "../../balance";
import { PickupComponent } from "../components/PickupComponent";
import { GameEntity } from "../GameEntity";

/** Источник позиции игрока для магнита. */
export type PlayerPositionSource = () => { x: number; y: number };

export class PickupMovementSystem extends System {
  private aspect: Aspect | null = null;

  constructor(private readonly getPlayer: PlayerPositionSource) {
    super(0); // выполняем до сбора (позиция должна обновиться первой)
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(PickupComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const player = this.getPlayer();
    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const pickup = entity.components.get(PickupComponent);
      if (!pickup) continue;

      // Движение дрифтом
      pickup.x += pickup.vx * dt;
      pickup.y += pickup.vy * dt;

      // Магнит к игроку: чем ближе, тем сильнее
      const dx = player.x - pickup.x;
      const dy = player.y - pickup.y;
      const dist = Math.hypot(dx, dy);
      if (dist < ZONE_PICKUP_MAGNET && dist > 2) {
        const fraction = Math.pow(1 - dist / ZONE_PICKUP_MAGNET, 0.5) * 25;
        pickup.x += dx * fraction * dt;
        pickup.y += dy * fraction * dt;
      }

      pickup.life -= dt;
      if (pickup.life <= 0) {
        toRemove.push(entity);
      }
    }

    for (const entity of toRemove) {
      this.engine?.entities.remove(entity);
    }
  }
}