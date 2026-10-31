/**
 * EffectDomain — лёгкие визуальные эффекты: частицы и кольца.
 *
 * Эффекты живут как ECS-сущности с компонентами-данными и удаляются
 * системами по истечении LifeComponent.
 */

import type { Particle, Ring } from "../../types";
import type { EcsEngine } from "../EcsEngine";
import { GameEntity } from "../GameEntity";
import { LifeComponent } from "../components/LifeComponent";
import { ParticleComponent } from "../components/ParticleComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RingComponent } from "../components/RingComponent";
import { VelocityComponent } from "../components/VelocityComponent";

export class EffectDomain {
  constructor(private readonly ecs: EcsEngine) {}

  /** Зарегистрировать частицу. */
  addParticle(particle: Particle): void {
    const entity = new GameEntity();
    entity.components.add(new ParticleComponent(particle.c, particle.size));
    entity.components.add(new PositionComponent(particle.x, particle.y));
    entity.components.add(new VelocityComponent(particle.vx, particle.vy));
    entity.components.add(new LifeComponent(particle.life, particle.maxLife));
    this.ecs.add(entity);
  }

  /** Снапшоты частиц для рендера. */
  particles(): Particle[] {
    const result: Particle[] = [];
    for (const entity of this.ecs.entitiesWith(ParticleComponent)) {
      const particle = entity.components.get(ParticleComponent);
      if (!particle) continue;
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      result.push({
        x: position ? position.x : 0,
        y: position ? position.y : 0,
        vx: velocity ? velocity.vx : 0,
        vy: velocity ? velocity.vy : 0,
        life: life ? life.remaining : 0,
        maxLife: life ? life.max : 0,
        c: particle.c,
        size: particle.size,
      });
    }
    return result;
  }

  /** Удалить все частицы. */
  clearParticles(): void {
    for (const entity of [...this.ecs.entitiesWith(ParticleComponent)]) {
      this.ecs.remove(entity);
    }
  }

  /** Зарегистрировать кольцо. */
  addRing(ring: Ring): void {
    const entity = new GameEntity();
    entity.components.add(new RingComponent(ring.r, ring.vr, ring.c));
    entity.components.add(new PositionComponent(ring.x, ring.y));
    entity.components.add(new LifeComponent(ring.life, ring.maxLife));
    this.ecs.add(entity);
  }

  /** Снапшоты колец для рендера. */
  rings(): Ring[] {
    const result: Ring[] = [];
    for (const entity of this.ecs.entitiesWith(RingComponent)) {
      const ring = entity.components.get(RingComponent);
      if (!ring) continue;
      const position = entity.components.get(PositionComponent);
      const life = entity.components.get(LifeComponent);
      result.push({
        x: position ? position.x : 0,
        y: position ? position.y : 0,
        r: ring.r,
        vr: ring.vr,
        life: life ? life.remaining : 0,
        maxLife: life ? life.max : 0,
        c: ring.c,
      });
    }
    return result;
  }

  /** Удалить все кольца. */
  clearRings(): void {
    for (const entity of [...this.ecs.entitiesWith(RingComponent)]) {
      this.ecs.remove(entity);
    }
  }
}
