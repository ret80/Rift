/**
 * VortexStrategy — вихрь.
 *
 * Медленно держит дистанцию 250 px и вращает лазерную руку радиусом
 * 200 px с периодом 4 с. Если игрок оказывается в секторе луча, он
 * получает урон не чаще раза в 0.55 с. Безопасный клин — часть круга,
 * которую игрок читает по вращению.
 */

import {
  VORTEX_DAMAGE,
  VORTEX_HALF_WIDTH,
  VORTEX_HIT_CD,
  VORTEX_PERIOD,
  VORTEX_RADIUS,
  VORTEX_STANDOFF,
} from "../../balance";
import type { EnemyRef } from "../../ecs";
import { TAU } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { standoffAngle, steer, wrapAngle } from "./ArchetypeMovement";

export class VortexStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;

    marker.fireCd = Math.max(0, marker.fireCd - dt);
    marker.lockAngle += (TAU / VORTEX_PERIOD) * dt * marker.strafeDir;

    steer(
      enemy,
      standoffAngle(enemy, context, VORTEX_STANDOFF, marker.strafeDir),
      marker.speed,
      2.8,
      dt,
    );

    const dx = context.playerX - enemy.position.x;
    const dy = context.playerY - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist > VORTEX_RADIUS || dist < 0.001) return;

    const toPlayer = Math.atan2(dy, dx);
    const diff = Math.abs(wrapAngle(toPlayer - marker.lockAngle));
    if (diff <= VORTEX_HALF_WIDTH && marker.fireCd <= 0) {
      marker.fireCd = VORTEX_HIT_CD;
      context.damagePlayer?.(VORTEX_DAMAGE, "vortex");
    }
  }
}
