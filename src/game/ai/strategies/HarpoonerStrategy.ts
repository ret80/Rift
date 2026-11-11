/**
 * HarpoonerStrategy — гарпунёр.
 *
 * Подходит на дистанцию 300 px, натягивает трос и тянет игрока к себе с
 * ускорением ~220 px/с². Трос рвётся, если игрок ушёл дальше 360 px или
 * истекло время удержания. После разрыва — пауза, чтобы игрок мог
 * перевести дух и сменить позицию.
 */

import {
  HARPOONER_BREAK_RANGE,
  HARPOONER_PULL_ACCEL,
  HARPOONER_STANDOFF,
  HARPOONER_TETHER_COOLDOWN,
  HARPOONER_TETHER_RANGE,
} from "../../balance";
import type { EnemyRef } from "../../ecs";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { standoffAngle, steer } from "./ArchetypeMovement";

const APPROACH = 0;
const TETHER = 1;
const COOLDOWN = 2;
const TETHER_TIME = 2.5;

export class HarpoonerStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const dx = context.playerX - enemy.position.x;
    const dy = context.playerY - enemy.position.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    if (marker.mode < APPROACH || marker.mode > COOLDOWN) {
      marker.mode = APPROACH;
      marker.modeT = 0;
    }

    switch (marker.mode) {
      case TETHER: {
        marker.modeT -= dt;
        const broken = dist > HARPOONER_BREAK_RANGE || marker.modeT <= 0;
        if (broken) {
          marker.mode = COOLDOWN;
          marker.modeT = HARPOONER_TETHER_COOLDOWN;
          marker.tetherActive = false;
          break;
        }

        marker.tetherActive = true;
        // Тянем игрока к себе: импульс приходит в PlayerSystem через
        // drone_push_player, поэтому физика/рывок остаются главными.
        const nx = (enemy.position.x - context.playerX) / dist;
        const ny = (enemy.position.y - context.playerY) / dist;
        context.pullPlayer?.(nx * HARPOONER_PULL_ACCEL * dt, ny * HARPOONER_PULL_ACCEL * dt);

        // Сам гарпунёр упирается и почти не двигается на натянутом тросе.
        steer(enemy, angleToPlayer, marker.speed * 0.35, 3, dt);
        break;
      }

      case COOLDOWN: {
        marker.modeT -= dt;
        marker.tetherActive = false;
        steer(
          enemy,
          standoffAngle(enemy, context, HARPOONER_STANDOFF, marker.strafeDir),
          marker.speed,
          4,
          dt,
        );
        if (marker.modeT <= 0) marker.mode = APPROACH;
        break;
      }

      default: {
        marker.tetherActive = false;
        if (marker.attackAllowed && dist <= HARPOONER_TETHER_RANGE) {
          marker.mode = TETHER;
          marker.modeT = TETHER_TIME;
          break;
        }
        steer(
          enemy,
          standoffAngle(enemy, context, HARPOONER_STANDOFF, marker.strafeDir),
          marker.speed,
          4,
          dt,
        );
        break;
      }
    }
  }
}
