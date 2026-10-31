/**
 * ParticleSystem — ECS-система симуляции частиц (искра/осколок эффекта).
 *
 * Оперирует сущностями с компонентами Position + Velocity + Life (и маркером
 * ParticleComponent): интегрирует скорость, применяет вязкое затухание и
 * удаляет просроченные частицы. Логика — по компонентам через Aspect, без
 * ссылок на внешний объект Particle. `EcsWorld.particles()` отдаёт read-only
 * снапшот (DTO на лету) для рендера, не мутируя его здесь.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../SystemSchedule";
import { PositionComponent } from "../components/PositionComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { LifeComponent } from "../components/LifeComponent";
import { ParticleComponent } from "../components/ParticleComponent";
import { GameEntity } from "../GameEntity";

/** Коэффициент вязкого затухания скорости частицы. */
const DRAG = 2.5;

export class ParticleSystem extends PhasedSystem {
  private aspect: Aspect | null = null;

  constructor() {
    super(Phase.Enemies);
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(ParticleComponent, PositionComponent, VelocityComponent, LifeComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities]) {
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
