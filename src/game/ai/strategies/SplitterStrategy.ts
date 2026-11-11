/**
 * SplitterStrategy — делитель.
 *
 * Быстрый таран: идёт на игрока с лёгким змеевидным смещением, чтобы его
 * было сложнее прострелить. При смерти EnemyLifecycle спавнит двух
 * осколков (см. EnemyDomain.handleEnemyDeath), поэтому стратегии не нужно
 * знать о делении.
 */

import type { EnemyRef } from "../../ecs";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { leadAngle, steer } from "./ArchetypeMovement";

export class SplitterStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const dx = context.playerX - enemy.position.x;
    const dy = context.playerY - enemy.position.y;
    const dist = Math.hypot(dx, dy) || 1;

    marker.modeT += dt;
    const weave = Math.sin(marker.seed + marker.modeT * 4.5) * 0.22;
    const desired = leadAngle(enemy, context, 0.25) + weave;
    const speed = marker.speed * (dist < 240 ? 1.15 : 1);

    steer(enemy, desired, speed, 5.5, dt);
  }
}
