/**
 * ParticleSystem — ECS-система симуляции частиц (искра/осколок эффекта).
 *
 * Оперирует сущностями с компонентами Position + Velocity + Life (и маркером
 * ParticleComponent): интегрирует скорость, применяет вязкое затухание и
 * удаляет просроченные частицы. Логика — по компонентам через Aspect, без
 * ссылок на внешний объект Particle. `EcsWorld.particles()` отдаёт стабильный
 * cached-view для рендера, не мутируя его здесь.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { PositionComponent } from "../components/PositionComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { LifeComponent } from "../components/LifeComponent";
import { ParticleComponent } from "../components/ParticleComponent";
import { GameEntity } from "../GameEntity";

/** Коэффициент вязкого затухания скорости частицы. */
const DRAG = 2.5;

export class ParticleSystem extends System {
  private aspect: Aspect | null = null;

  constructor() {
    super(0);
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(ParticleComponent, PositionComponent, VelocityComponent, LifeComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      if (!position || !velocity || !life) continue;

      life.remaining -= dt;
      if (life.remaining <= 0) {
        toRemove.push(entity);
        continue;
      }

      position.x += velocity.vx * dt;
      position.y += velocity.vy * dt;
      velocity.vx *= Math.exp(-DRAG * dt);
      velocity.vy *= Math.exp(-DRAG * dt);
    }

    for (const entity of toRemove) {
      this.engine?.entities.remove(entity);
    }
  }
}