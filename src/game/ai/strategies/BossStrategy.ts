/**
 * BossStrategy — движение босса-арены.
 *
 * Босс не гоняется за игроком: он держит среднюю дистанцию, стрейфит по
 * дуге и разворачивает турель. Смена фаз по остатку прочности делает его
 * агрессивнее: на третьей фазе он подходит ближе и меняет направление чаще.
 *
 * Стрельба вынесена в EnemyShootingSystem: здесь только позиция, фаза
 * (`marker.mode`) и наведение турели, чтобы рендер и орудия читали одно
 * состояние.
 */

import {
  BOSS_ADVANCE_R,
  BOSS_HOLD_R,
  BOSS_PHASE2_RATIO,
  BOSS_PHASE3_RATIO,
  BOSS_STRAFE_CHANGE_INTERVAL,
  BOSS_STRAFE_SPEED_MULT,
  BOSS_TURN_RATE,
} from "../../balance";
import type { EnemyRef } from "../../ecs";
import { lerpAngle, smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";

/** Насколько близко к целевой орбите босс начинает боковой стрейф. */
const HOLD_BAND_PX = 22;

export class BossStrategy implements IEnemyStrategy {
  private strafeTimer = 0;

  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;

    // Фаза 0/1/2 по остатку прочности. Marker.mode читают орудия и рендер.
    const ratio = enemy.life.max > 0 ? enemy.life.remaining / enemy.life.max : 1;
    const phase = ratio <= BOSS_PHASE3_RATIO ? 2 : ratio <= BOSS_PHASE2_RATIO ? 1 : 0;
    marker.mode = phase;

    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // На третьей фазе босс подходит ближе: у игрока меньше времени на манёвр.
    const holdR = phase === 2 ? BOSS_HOLD_R * 0.82 : BOSS_HOLD_R;
    const holdDist = Math.max(80, context.zoneRadius * holdR);
    const maxRadial = marker.speed * (0.35 + phase * 0.12);

    let radial = 0;
    if (dist > holdDist + HOLD_BAND_PX && dist < context.zoneRadius * BOSS_ADVANCE_R) {
      radial = Math.min(maxRadial, (dist - holdDist) * 0.6);
    } else if (dist < holdDist - HOLD_BAND_PX) {
      radial = -Math.min(maxRadial, (holdDist - dist) * 0.8);
    } else if (dist >= context.zoneRadius * BOSS_ADVANCE_R) {
      radial = maxRadial;
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      marker.strafeDir = -marker.strafeDir;
      this.strafeTimer =
        BOSS_STRAFE_CHANGE_INTERVAL - phase * 0.7 + context.rng.range(0, 1.2);
    }

    const strafeSpeed = marker.speed * (BOSS_STRAFE_SPEED_MULT + phase * 0.12);
    const desX = dirX * radial - dirY * strafeSpeed * marker.strafeDir;
    const desY = dirY * radial + dirX * strafeSpeed * marker.strafeDir;
    smoothVelocity(vel, desX, desY, BOSS_TURN_RATE + phase * 0.5, dt);

    const speed = Math.hypot(vel.vx, vel.vy);
    if (speed > 5) {
      marker.angle = lerpAngle(
        marker.angle,
        Math.atan2(vel.vy, vel.vx),
        1 - Math.exp(-(BOSS_TURN_RATE + 1.5) * dt),
      );
    }

    // Турель смотрит на игрока независимо от курса корпуса.
    const desiredTurret = Math.atan2(dy, dx);
    marker.turretAngle = lerpAngle(
      marker.turretAngle,
      desiredTurret,
      1 - Math.exp(-(BOSS_TURN_RATE + 2.2) * dt),
    );
  }
}
