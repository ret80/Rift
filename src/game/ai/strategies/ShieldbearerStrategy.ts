/**
 * ShieldbearerStrategy — щитоносец.
 *
 * Держится рядом с ближайшим союзником и прикрывает его аурой −40%.
 * Если союзников нет, работает как медленный линейный корабль: держит
 * дистанцию от игрока и облетает его по касательной.
 *
 * Сама аура применяется в EnemyLifecycle (единая точка урона), а здесь
 * только позиционирование.
 */

import {
  SHIELDBEARER_FOLLOW_DIST,
  SHIELDBEARER_STANDOFF,
  EnemyKind,
} from "../../balance";
import type { EnemyRef } from "../../ecs";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { keepInsideZone, standoffAngle, steer } from "./ArchetypeMovement";

const FOLLOW = 0;
const SOLO = 1;

export class ShieldbearerStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    if (marker.mode !== FOLLOW && marker.mode !== SOLO) {
      marker.mode = SOLO;
      marker.modeT = 0;
    }

    const ally = this.findWard(enemy, context);
    if (ally) {
      marker.mode = FOLLOW;
      const angleToPlayer = Math.atan2(
        context.playerY - enemy.position.y,
        context.playerX - enemy.position.x,
      );
      // Встаём между союзником и игроком, но чуть в стороне, чтобы не
      // закрывать союзнику линию огня.
      const point = {
        x: ally.position.x + Math.cos(angleToPlayer) * SHIELDBEARER_FOLLOW_DIST,
        y: ally.position.y + Math.sin(angleToPlayer) * SHIELDBEARER_FOLLOW_DIST,
      };
      keepInsideZone(point, context, enemy.radius.r + 30);
      const desired = Math.atan2(point.y - enemy.position.y, point.x - enemy.position.x);
      steer(enemy, desired, marker.speed, 3.2, dt);
      return;
    }

    marker.mode = SOLO;
    steer(
      enemy,
      standoffAngle(enemy, context, SHIELDBEARER_STANDOFF, marker.strafeDir),
      marker.speed,
      3.2,
      dt,
    );
  }

  /** Ближайший живой союзник, которого стоит прикрывать. */
  private findWard(enemy: EnemyRef, context: GameContext): EnemyRef | null {
    let best: EnemyRef | null = null;
    let bestDist = 360;
    for (const other of context.enemies) {
      if (other === enemy || other.marker.dead) continue;
      if (other.marker.kind === EnemyKind.Mine) continue;
      if (other.marker.kind === EnemyKind.Shieldbearer) continue;
      const dist = Math.hypot(
        other.position.x - enemy.position.x,
        other.position.y - enemy.position.y,
      );
      if (dist < bestDist) {
        bestDist = dist;
        best = other;
      }
    }
    return best;
  }
}
