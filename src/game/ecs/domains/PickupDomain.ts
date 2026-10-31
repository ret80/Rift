/**
 * PickupDomain — жизненный цикл пикапов.
 *
 * Пикап — сущность с PickupKindComponent и базовыми Position/Velocity/
 * Radius/Life. Домен владеет спавном, чтением снапшотов и очисткой.
 */

import type { PickupKind } from "../../balance";
import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { LifeComponent } from "../components/LifeComponent";
import { PickupKindComponent } from "../components/PickupKindComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import type { PickupRef } from "../refs";

/** Детерминированный seed (0..1) из id сущности для визуальных вариаций. */
function seedForId(id: number | string): number {
  if (typeof id === "number") {
    return ((id * 2654435761) % 1000) / 1000;
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  return ((Math.abs(h) * 2654435761) % 1000) / 1000;
}

export class PickupDomain {
  private readonly refCache = new WeakMap<GameEntity, PickupRef>();

  constructor(private readonly ecs: EcsEngine) {}

  /** Заспавнить пикап как ECS-сущность из базовых компонентов. */
  spawn(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    const entity = new GameEntity();
    entity.components.add(new PickupKindComponent(kind));
    entity.components.add(new PositionComponent(x, y));
    entity.components.add(new VelocityComponent(vx, vy));
    entity.components.add(new LifeComponent(20, 20));
    entity.components.add(new RadiusComponent(14));
    this.ecs.add(entity);
  }

  /** Живые связки пикапов для рендера. */
  pickups(out: PickupRef[] = []): PickupRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(PickupKindComponent)) {
      const ref = this.refOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  private refOf(entity: GameEntity): PickupRef | null {
    const cached = this.refCache.get(entity);
    if (cached) return cached;
    const kind = entity.components.get(PickupKindComponent);
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const life = entity.components.get(LifeComponent);
    const radius = entity.components.get(RadiusComponent);
    if (!kind || !position || !velocity || !life || !radius) return null;
    const ref: PickupRef = {
      entity,
      kind,
      position,
      velocity,
      life,
      radius,
      seed: seedForId(entity.id),
    };
    this.refCache.set(entity, ref);
    return ref;
  }

  /** Удалить все пикапы. */
  clear(): void {
    for (const entity of [...this.ecs.entitiesWith(PickupKindComponent)]) {
      this.ecs.remove(entity);
    }
  }
}
