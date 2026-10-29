/**
 * BeamSystem — ECS-система затухания визуальных лучей лазера.
 *
 * Оперирует сущностями с компонентами LaserBeamComponent + LifeComponent:
 * уменьшает остаток жизни и удаляет просроченные лучи. Логика — по
 * компонентам через Aspect, без ссылок на внешний объект LaserBeam.
 * `EcsWorld.beams()` отдаёт свежесобранные plain-объекты для рендера,
 * не мутируя состояние ECS здесь.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import { LifeComponent } from "../components/LifeComponent";
import { LaserBeamComponent } from "../components/LaserBeamComponent";
import { GameEntity } from "../GameEntity";

export class BeamSystem extends System {
  private aspect: Aspect | null = null;

  constructor() {
    super(2); // после пуль и врагов — визуал затухает в конце цикла
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(LaserBeamComponent, LifeComponent);
  }

  process(dt: number): void {
    const aspect = this.aspect;
    if (!aspect) return;

    const toRemove: GameEntity[] = [];

    for (const entity of [...aspect.entities] as GameEntity[]) {
      const life = entity.components.get(LifeComponent);
      if (!life) continue;

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