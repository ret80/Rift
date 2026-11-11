/**
 * JammerStrategy — глушилка.
 *
 * Медленно облетает игрока на дистанции ~320 px. Её зона 150 px отключает
 * автонаведение игрока и магнит пикапов; сама она не стреляет. Игрок либо
 * выходит из зоны, либо играет ручным прицелом.
 */

import { JAMMER_ORBIT_SPEED, JAMMER_STANDOFF } from "../../balance";
import type { EnemyRef } from "../../ecs";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { standoffAngle, steer } from "./ArchetypeMovement";

export class JammerStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    marker.modeT += dt;

    const dx = context.playerX - enemy.position.x;
    const dy = context.playerY - enemy.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    // Если игрок сам зашёл в зону — отходим, чтобы не давать бесплатный
    // купол на всю арену.
    const retreat = dist < JAMMER_STANDOFF * 0.55;
    const angle = retreat
      ? Math.atan2(enemy.position.y - context.playerY, enemy.position.x - context.playerX)
      : standoffAngle(enemy, context, JAMMER_STANDOFF, marker.strafeDir);

    marker.lockAngle += JAMMER_ORBIT_SPEED * dt * marker.strafeDir;
    steer(enemy, angle, marker.speed, 2.6, dt);
  }
}
