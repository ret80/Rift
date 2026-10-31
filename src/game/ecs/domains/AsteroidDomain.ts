/**
 * AsteroidDomain — жизненный цикл астероидов пояса.
 *
 * Живые связки компонентов кэшируются на сущность, чтобы физика, коллизии
 * и мир кадра ссылались на один и тот же объект.
 */

import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { AsteroidComponent } from "../components/AsteroidComponent";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import type { AsteroidRef, AsteroidSpawn } from "../refs";

export class AsteroidDomain {
  private readonly refCache = new WeakMap<GameEntity, AsteroidRef>();

  constructor(private readonly ecs: EcsEngine) {}

  /** Живые связки компонентов всех астероидов пояса. */
  asteroids(out: AsteroidRef[] = []): AsteroidRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(AsteroidComponent)) {
      const ref = this.refOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  /** Зарегистрировать астероид как ECS-сущность. */
  spawn(state: AsteroidSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new PositionComponent(state.x, state.y));
    entity.components.add(new VelocityComponent(state.vx, state.vy));
    entity.components.add(new RadiusComponent(state.r));
    entity.components.add(new LifeComponent(state.hp, state.maxHp));
    entity.components.add(new AsteroidComponent({
      key: state.key,
      kind: state.kind,
      angle: state.angle,
      spin: state.spin,
      verts: state.verts,
      mass: state.mass,
      dead: state.dead,
    }));
    this.ecs.add(entity);
  }

  /** Найти связку компонентов астероида по строковой идентичности пояса. */
  byKey(key: string): AsteroidRef | null {
    for (const entity of this.ecs.entitiesWith(AsteroidComponent)) {
      const marker = entity.components.get(AsteroidComponent);
      if (marker && marker.key === key) return this.refOf(entity);
    }
    return null;
  }

  /** Удалить астероид по строковой идентичности пояса. */
  removeByKey(key: string): void {
    for (const entity of this.ecs.entitiesWith(AsteroidComponent)) {
      const marker = entity.components.get(AsteroidComponent);
      if (marker && marker.key === key) {
        this.ecs.remove(entity);
        return;
      }
    }
  }

  /** Удалить все астероиды (пустой пояс без сброса чанков). */
  clear(): void {
    for (const entity of [...this.ecs.entitiesWith(AsteroidComponent)]) {
      this.ecs.remove(entity);
    }
  }

  private refOf(entity: GameEntity): AsteroidRef | null {
    const cached = this.refCache.get(entity);
    if (cached) return cached;
    const marker = entity.components.get(AsteroidComponent);
    if (!marker) return null;
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!position || !velocity || !radius || !life) return null;
    const ref: AsteroidRef = { entity, marker, position, velocity, radius, life };
    this.refCache.set(entity, ref);
    return ref;
  }
}
