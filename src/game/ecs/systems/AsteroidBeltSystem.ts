/**
 * AsteroidBeltSystem — пояс астероидов у красного кольца зоны.
 *
 * Красная полоса снаружи зоны становится видимой «орбитой»: ближайшие камни
 * притягиваются к её середине, захватываются и вращаются по двум дорожкам —
 * внутренней по часовой и внешней против. Система меняет только скорости:
 * позицию интегрирует физический слой, как и у остальных астероидов.
 */

import { Aspect } from "@trixt0r/ecs";
import type { EcsEngine } from "../EcsEngine";
import { AsteroidComponent } from "../components/AsteroidComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { Phase, PhasedSystem } from "../SystemSchedule";
import {
  ZONE_BELT_ATTRACT_RANGE,
  ZONE_BELT_BAND_FRACTION,
  ZONE_BELT_CAPTURE_BAND,
  ZONE_BELT_LANE_OFFSET,
  ZONE_BELT_MAX_ACCEL,
  ZONE_BELT_MAX_ROCKS,
  ZONE_BELT_MAX_SPEED,
  ZONE_BELT_ORBIT_SPEED,
  ZONE_BELT_RADIAL_DAMPING,
  ZONE_BELT_SPRING,
  ZONE_BELT_TANGENT_GAIN,
  ZONE_WARNING_BAND,
} from "../../balance";

export type BeltZoneProvider = () => {
  active: boolean;
  x: number;
  y: number;
  radius: number;
};

export class AsteroidBeltSystem extends PhasedSystem {
  private aspect: Aspect | null = null;

  constructor(
    private readonly ecs: EcsEngine,
    private readonly getZone: BeltZoneProvider,
  ) {
    super(Phase.AsteroidBelt);
  }

  process(dt: number): void {
    const zone = this.getZone();
    if (!zone.active || zone.radius <= 0) {
      this.releaseAll();
      return;
    }

    if (!this.aspect) this.aspect = Aspect.for(this.ecs.engine).all(AsteroidComponent);

    const targetRadius = zone.radius + ZONE_WARNING_BAND * ZONE_BELT_BAND_FRACTION;

    // Первый проход — сколько камней уже захвачено (лимит пояса).
    let captured = 0;
    for (const entity of this.aspect.entities) {
      const marker = entity.components.get(AsteroidComponent);
      if (marker && !marker.dead && marker.beltState === "captured") captured++;
    }

    for (const entity of [...this.aspect.entities]) {
      const marker = entity.components.get(AsteroidComponent);
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const radius = entity.components.get(RadiusComponent);
      if (!marker || marker.dead || !position || !velocity || !radius) continue;

      const dx = position.x - zone.x;
      const dy = position.y - zone.y;
      const dist = Math.hypot(dx, dy) || 1;
      const nx = dx / dist;
      const ny = dy / dist;
      const tx = -ny;
      const ty = nx;

      if (marker.beltState !== "captured") {
        // Камни внутри зоны выталкивает ZoneSystem/AsteroidField — не мешаем.
        if (dist < zone.radius + radius.r + 30) continue;
        if (Math.abs(dist - targetRadius) > ZONE_BELT_ATTRACT_RANGE) continue;
        if (captured >= ZONE_BELT_MAX_ROCKS) continue;

        if (Math.abs(dist - targetRadius) <= ZONE_BELT_CAPTURE_BAND) {
          marker.beltState = "captured";
          // Дорожку выбираем по ключу камня, а не по стороне подлёта:
          // иначе все камни приходят снаружи и попадают только на внешнюю.
          marker.beltLane = this.laneForKey(marker.key);
          marker.beltDir = marker.beltLane < 0 ? 1 : -1;
          captured++;
        } else {
          // Мягкое притяжение к кольцу без орбитального разгона.
          const radial = velocity.vx * nx + velocity.vy * ny;
          const accel = this.clampAccel(
            (targetRadius - dist) * ZONE_BELT_SPRING - radial * ZONE_BELT_RADIAL_DAMPING,
          );
          velocity.vx += nx * accel * dt;
          velocity.vy += ny * accel * dt;
          this.clampSpeed(velocity);
          continue;
        }
      }

      const lane = marker.beltLane;
      const laneRadius = targetRadius + lane * ZONE_BELT_LANE_OFFSET;
      const radial = velocity.vx * nx + velocity.vy * ny;
      const tangent = velocity.vx * tx + velocity.vy * ty;

      const radialAccel = this.clampAccel(
        (laneRadius - dist) * ZONE_BELT_SPRING - radial * ZONE_BELT_RADIAL_DAMPING,
      );
      const tangentAccel = this.clampAccel(
        (marker.beltDir * ZONE_BELT_ORBIT_SPEED - tangent) * ZONE_BELT_TANGENT_GAIN,
      );
      const ax = radialAccel * nx + tangentAccel * tx;
      const ay = radialAccel * ny + tangentAccel * ty;
      const len = Math.hypot(ax, ay);
      const scale = len > ZONE_BELT_MAX_ACCEL ? ZONE_BELT_MAX_ACCEL / len : 1;

      velocity.vx += ax * scale * dt;
      velocity.vy += ay * scale * dt;
      this.clampSpeed(velocity);
    }
  }

  /** Отпустить все камни (зона исчезла между волнами). */
  private releaseAll(): void {
    if (!this.aspect) return;
    for (const entity of this.aspect.entities) {
      const marker = entity.components.get(AsteroidComponent);
      if (marker && marker.beltState === "captured") marker.beltState = "none";
    }
  }

  /** Устойчивая дорожка камня: половина внутренняя, половина внешняя. */
  private laneForKey(key: string): -1 | 1 {
    let hash = 0;
    for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) | 0;
    return (hash & 1) === 0 ? -1 : 1;
  }

  private clampAccel(v: number): number {
    return Math.max(-ZONE_BELT_MAX_ACCEL, Math.min(ZONE_BELT_MAX_ACCEL, v));
  }

  private clampSpeed(v: { vx: number; vy: number }): void {
    const speed = Math.hypot(v.vx, v.vy);
    if (speed <= ZONE_BELT_MAX_SPEED) return;
    const k = ZONE_BELT_MAX_SPEED / speed;
    v.vx *= k;
    v.vy *= k;
  }
}
