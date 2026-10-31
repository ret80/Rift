/**
 * BeamDomain — визуальные лучи лазера.
 *
 * Луч не участвует в коллизиях: урон уже нанесён в момент выстрела,
 * сущность живёт только как затухающая трасса.
 */

import type { BeamSpawn } from "../spawn";
import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { LaserBeamComponent } from "../components/LaserBeamComponent";
import { LifeComponent } from "../components/LifeComponent";
import type { BeamRef } from "../refs";

export class BeamDomain {
  private readonly refCache = new WeakMap<GameEntity, BeamRef>();

  constructor(private readonly ecs: EcsEngine) {}

  /** Зарегистрировать визуальный луч лазера. */
  add(beam: BeamSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new LaserBeamComponent(
      beam.x1, beam.y1, beam.x2, beam.y2, beam.seed, beam.targetId ?? null,
    ));
    entity.components.add(new LifeComponent(beam.life, beam.maxLife));
    this.ecs.add(entity);
  }

  /** Живые связки лучей для рендера. */
  beams(out: BeamRef[] = []): BeamRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(LaserBeamComponent)) {
      const ref = this.refOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  private refOf(entity: GameEntity): BeamRef | null {
    const cached = this.refCache.get(entity);
    if (cached) return cached;
    const beam = entity.components.get(LaserBeamComponent);
    const life = entity.components.get(LifeComponent);
    if (!beam || !life) return null;
    const ref: BeamRef = { entity, beam, life };
    this.refCache.set(entity, ref);
    return ref;
  }

  /** Удалить все визуальные лучи. */
  clear(): void {
    for (const entity of [...this.ecs.entitiesWith(LaserBeamComponent)]) {
      this.ecs.remove(entity);
    }
  }
}
