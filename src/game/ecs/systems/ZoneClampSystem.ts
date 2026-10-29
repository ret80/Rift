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
 * вызывается ЯВНО ПОСЛЕ шага физики из GameFrame (см. EcsWorld.
 * clampEnemiesToZone): если бы кламп выполнялся до интеграции, враг
 * «протекал» бы за границу на v*dt в каждом кадре. По этой причине система
 * не регистрируется в engine.systems и исполняется вне общего ECS-тика,
 * сохраняя порядок кадра.
 */

import { System, Aspect } from "@trixt0r/ecs";
import { EnemyComponent } from "../components/EnemyComponent";
import { GameEntity } from "../GameEntity";
import type { EcsWorld } from "../EcsWorld";

/** Источник активного состояния игровой зоны. */
export type ZoneProvider = () => { active: boolean; x: number; y: number; radius: number };

export class ZoneClampSystem extends System {
  private aspect: Aspect | null = null;

  constructor(
    private readonly ecs: EcsWorld,
    private readonly getZone: ZoneProvider,
  ) {
    super(11); // финальный кламп — после waveFlow (9)/zoneSystem (10)
  }

  process(_dt: number): void {
    const zone = this.getZone();
    if (!zone.active || zone.radius <= 0) return;

    if (!this.aspect) this.aspect = Aspect.for(this.ecs.engine).all(EnemyComponent);

    for (const entity of [...this.aspect.entities] as GameEntity[]) {
      const e = entity.components.get(EnemyComponent);
      if (!e || e.dead) continue;

      const dx = e.x - zone.x;
      const dy = e.y - zone.y;
      const dist = Math.hypot(dx, dy);
      const limit = zone.radius - (e.r || 15);

      if (dist > limit) {
        const angle = Math.atan2(dy, dx);
        // Жёсткий возврат на границу.
        e.x = zone.x + Math.cos(angle) * limit;
        e.y = zone.y + Math.sin(angle) * limit;

        // Отражаем радиальную составляющую скорости.
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const dot = e.vx * nx + e.vy * ny;
        if (dot > 0) {
          e.vx -= 2 * dot * nx;
          e.vy -= 2 * dot * ny;
        }
      }
    }
  }
}