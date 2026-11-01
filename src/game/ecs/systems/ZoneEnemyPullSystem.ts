/**
 * ZoneEnemyPullSystem — мягкое притяжение врагов к игровой зоне.
 *
 * Враг — это сущность с компонентом EnemyComponent (единственный источник
 * правды для позиции/скорости). Система фильтрует сущности по аспекту
 * Aspect.for(engine).all(EnemyComponent) и, если враг вышел за границу
 * зоны, тянет его обратно силой: позиция не переписывается, поэтому нет
 * телепортов и «залипания» на границе.
 *
 * Притяжение = ускорение к центру + гашение радиальной скорости наружу
 * (плюс лёгкое гашение орбитальной составляющей). Это критически важная
 * деталь: без демпфирования враг разгоняется к центру, проскакивает его
 * и начинает колебаться через границу.
 *
 * ВАЖНО (порядок кадра): позиции врагов в обоих физических бэкендах
 * (planck/custom) интегрирует сам физический слой — PhysicsSystem.update
 * пишет результат обратно в сущность через applyResult. Поэтому система
 * зарегистрирована в Phase.ZonePull (после физики и коллизий): скорость
 * меняется в конце кадра и применяется на следующем шаге физики.
 */

import { Aspect } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../SystemSchedule";
import {
  ZONE_ENEMY_PULL_ACCEL,
  ZONE_ENEMY_PULL_DAMPING,
  ZONE_ENEMY_PULL_MAX_SPEED,
  ZONE_ENEMY_PULL_RAMP,
  ZONE_ENEMY_PULL_TANGENT_DAMPING,
} from "../../balance";
import { EnemyComponent } from "../components/EnemyComponent";
import { PositionComponent } from "../components/PositionComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import type { EcsEngine } from "../EcsEngine";

/**
 * Базовая масса для нормализации тяги зоны.
 * Лёгкие враги (дрон ~6) тянутся сильнее, тяжёлые (носитель ~105) — слабее.
 */
const REF_MASS = 10;

/** Источник активного состояния игровой зоны. */
export type ZoneProvider = () => { active: boolean; x: number; y: number; radius: number };

export class ZoneEnemyPullSystem extends PhasedSystem {
  private aspect: Aspect | null = null;

  constructor(
    private readonly ecs: EcsEngine,
    private readonly getZone: ZoneProvider,
  ) {
    super(Phase.ZonePull);
  }

  process(dt: number): void {
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
      const penetration = dist - limit;
      if (penetration <= 0) continue;

      const inv = dist > 0.001 ? 1 / dist : 0;
      const nx = dx * inv;
      const ny = dy * inv;

      // Полная сила достигается на ZONE_ENEMY_PULL_RAMP проникновения.
      const strength = Math.min(penetration / ZONE_ENEMY_PULL_RAMP, 1);
      const radial = velocity.vx * nx + velocity.vy * ny;
      const tangent = -velocity.vx * ny + velocity.vy * nx;

      // Тяга зоны с учётом массы: лёгкие (дрон) возвращаются резко,
      // тяжёлые (крейсер, носитель) — плавно, без рывка выше своей скорости.
      const mass = marker.mass || REF_MASS;
      const massFactor = Math.max(0.3, 1 - (mass - REF_MASS) / (REF_MASS * 10));
      const effectiveAccel = ZONE_ENEMY_PULL_ACCEL * massFactor;
      const effectiveMaxSpeed = ZONE_ENEMY_PULL_MAX_SPEED * massFactor;

      // Наружу (radial > 0) — ускорение к центру + демпфирование;
      // внутрь (radial < 0) — только ускорение, чтобы не разгонять чрезмерно.
      const radialAccel =
        -effectiveAccel * strength -
        ZONE_ENEMY_PULL_DAMPING * Math.max(radial, 0);
      const tangentAccel = -ZONE_ENEMY_PULL_TANGENT_DAMPING * tangent;

      velocity.vx += (radialAccel * nx - tangentAccel * ny) * dt;
      velocity.vy += (radialAccel * ny + tangentAccel * nx) * dt;

      // Предохранитель: притяжение не должно разгонять врага до абсурда.
      const speed = Math.hypot(velocity.vx, velocity.vy);
      if (speed > effectiveMaxSpeed) {
        const k = effectiveMaxSpeed / speed;
        velocity.vx *= k;
        velocity.vy *= k;
      }
    }
  }
}
