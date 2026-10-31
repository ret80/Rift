/**
 * ZoneClampSystem — ECS-ограничение врагов границей игровой зоны.
 *
 * Враг — это сущность с компонентом EnemyComponent (единственный источник
 * правды для позиции/скорости). Система фильтрует сущности по аспекту
 * Aspect.for(engine).all(EnemyComponent) и удерживает их внутри зоны: если
 * враг вышел за границу, он жёстко возвращается на границу, а радиальная
 * составляющая скорости отражается (кламп). Логика перенесена без изменений
 * из plain ZoneSystem.zone.update (clampEnemies) — мягкое «вталкивание силой»
 * в исходнике было мёртвым (кламп всегда снимал проникновение до него),
 * поэтому не переносится.
 *
 * ВАЖНО (порядок кадра): позиции врагов в обоих физических бэкендах
 * (planck/custom) интегрирует сам физический слой — PhysicsSystem.update
 * пишет результат обратно в сущность через applyResult. Поэтому система
 * зарегистрирована в engine.systems с приоритетом 11: PhysicsSystem (6)
 * и CollisionSystem (7) уже отработали, и кламп не даёт врагам «протекать»
 * за границу на v*dt в каждом кадре.
 */

import { Aspect } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../SystemSchedule";
import { EnemyComponent } from "../components/EnemyComponent";
import { PositionComponent } from "../components/PositionComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import type { EcsEngine } from "../EcsEngine";

/** Источник активного состояния игровой зоны. */
export type ZoneProvider = () => { active: boolean; x: number; y: number; radius: number };

export class ZoneClampSystem extends PhasedSystem {
  private aspect: Aspect | null = null;

  constructor(
    private readonly ecs: EcsEngine,
    private readonly getZone: ZoneProvider,
  ) {
    super(Phase.ZoneClamp);
  }

  process(_dt: number): void {
    const zone = this.getZone();
    if (!zone.active || zone.radius <= 0) return;

    if (!this.aspect) this.aspect = Aspect.for(this.ecs.engine).all(EnemyComponent);

    for (const entity of [...this.aspect.entities]) {
      const marker = entity.components.get(EnemyComponent);
      if (!marker || marker.dead) continue;
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const radius = entity.components.get(RadiusComponent);
      if (!position || !velocity || !radius) continue;

      const dx = position.x - zone.x;
      const dy = position.y - zone.y;
      const dist = Math.hypot(dx, dy);
      const limit = zone.radius - (radius.r || 15);

      if (dist > limit) {
        const angle = Math.atan2(dy, dx);
        // Жёсткий возврат на границу.
        position.x = zone.x + Math.cos(angle) * limit;
        position.y = zone.y + Math.sin(angle) * limit;

        // Отражаем радиальную составляющую скорости.
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const dot = velocity.vx * nx + velocity.vy * ny;
        if (dot > 0) {
          velocity.vx -= 2 * dot * nx;
          velocity.vy -= 2 * dot * ny;
        }
      }
    }
  }
}
