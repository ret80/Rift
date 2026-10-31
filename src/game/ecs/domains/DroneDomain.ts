/**
 * DroneDomain — жизненный цикл дронов-компаньонов.
 *
 * Дрон не имеет собственной скорости: орбита задаётся системой кинематически,
 * поэтому VelocityComponent в связку не входит.
 */

import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { AllyDroneComponent } from "../components/AllyDroneComponent";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import type { AllyDroneSpawn, DroneRef } from "../refs";

export class DroneDomain {
  private readonly refCache = new WeakMap<GameEntity, DroneRef>();

  constructor(private readonly ecs: EcsEngine) {}

  /** Живые связки компонентов всех дронов-компаньонов. */
  allyDrones(out: DroneRef[] = []): DroneRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(AllyDroneComponent)) {
      const ref = this.refOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  /** Зарегистрировать дрон-компаньон как ECS-сущность из чистых данных. */
  add(state: AllyDroneSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new PositionComponent(state.x, state.y));
    entity.components.add(new RadiusComponent(state.r));
    entity.components.add(new LifeComponent(state.hp, state.maxHp));
    entity.components.add(new AllyDroneComponent(
      entity.id,
      state.angle,
      state.fireCd,
      state.phase,
      state.targetId ?? null,
      state.retargetT,
      state.flash,
      state.permanent,
      state.kind,
      state.combat,
    ));
    this.ecs.add(entity);
  }

  /** Удалить дрон по его EntityRef-идентификатору. */
  removeById(id: number | string): void {
    this.ecs.removeById(id, AllyDroneComponent);
  }

  /** Нанести урон дрону; true — запас прочности исчерпан. */
  damage(id: number | string, dmg: number): boolean {
    const entity = this.ecs.getEntity(id);
    const marker = entity?.components.get(AllyDroneComponent);
    if (!entity || !marker) return false;
    const life = entity.components.get(LifeComponent);
    if (life) life.remaining -= dmg;
    marker.flash = 1;
    return life ? life.remaining <= 0 : false;
  }

  /** Удалить всех дронов-компаньонов. */
  clear(): void {
    for (const entity of [...this.ecs.entitiesWith(AllyDroneComponent)]) {
      this.ecs.remove(entity);
    }
  }

  private refOf(entity: GameEntity): DroneRef | null {
    const cached = this.refCache.get(entity);
    if (cached) return cached;
    const marker = entity.components.get(AllyDroneComponent);
    if (!marker) return null;
    const position = entity.components.get(PositionComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!position || !radius || !life) return null;
    const ref: DroneRef = { entity, marker, position, radius, life };
    this.refCache.set(entity, ref);
    return ref;
  }
}
