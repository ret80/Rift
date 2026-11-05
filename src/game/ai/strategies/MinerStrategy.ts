/**
 * MinerStrategy — минёр: держит внешнее кольцо, изредка ныряет к игроку
 * и оставляет мину.
 *
 * Поведение намеренно читаемое: минёр почти всё время летает по внешнему
 * кольцу зоны, поэтому игрок видит, что он «не давит»; угроза — не сам
 * корпус, а мины на орбите игрока, которые перекрывают привычный облёт.
 *
 * Состояния (`marker.mode`):
 *   0 — патруль по внешнему кольцу;
 *   1 — заход на орбиту игрока;
 *   2 — отход после постановки мины.
 */

import type { EnemyRef } from "../../ecs";
import {
  MINER_DIVE_COOLDOWN,
  MINER_DIVE_RADIUS,
  MINER_HOLD_R,
  MINER_ORBIT_SPEED,
  MINER_RETREAT_TIME,
} from "../../balance";
import { smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";

/** Скорость патруля, доля от базовой. */
const HOLD_SPEED_MULT = 0.85;
/** Скорость захода на игрока, доля от базовой. */
const DIVE_SPEED_MULT = 1.15;
/** Доворот корпуса, рад/с. */
const TURN_RATE = 3.2;
/** Дистанция до точки орбиты, на которой мина считается поставленной. */
const MINE_DROP_RADIUS = 36;
/** Дольше этого заход не длится: минёр не «залипает» у игрока. */
const DIVE_TIMEOUT = 3;

export class MinerStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    if (context.zoneRadius <= 0) {
      this.holdVelocity(enemy, dt);
      return;
    }

    marker.modeT += dt;

    if (marker.mode === 1) {
      this.dive(enemy, context, dt);
      return;
    }
    if (marker.mode === 2) {
      if (marker.modeT >= MINER_RETREAT_TIME) {
        marker.mode = 0;
        marker.modeT = 0;
      }
      this.returnToRing(enemy, context, dt);
      return;
    }

    // Патруль по внешнему кольцу.
    marker.orbitAngle += MINER_ORBIT_SPEED * dt * (marker.strafeDir >= 0 ? 1 : -1);
    const holdRadius = context.zoneRadius * MINER_HOLD_R;
    const hx = context.zoneX + Math.cos(marker.orbitAngle) * holdRadius;
    const hy = context.zoneY + Math.sin(marker.orbitAngle) * holdRadius;
    this.steerTo(enemy, hx, hy, marker.speed * HOLD_SPEED_MULT, dt);

    marker.waitTimer -= dt;
    if (marker.waitTimer <= 0) {
      marker.mode = 1;
      marker.modeT = 0;
      // Точка захода — на орбите вокруг игрока, со стороны текущего курса.
      marker.orbitAngle = Math.atan2(
        enemy.position.y - context.playerY,
        enemy.position.x - context.playerX,
      );
    }
  }

  /** Заход на орбиту игрока: мина ставится в точке орбиты, затем отход. */
  private dive(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    marker.orbitAngle += MINER_ORBIT_SPEED * 1.8 * dt * (marker.strafeDir >= 0 ? 1 : -1);
    const tx = context.playerX + Math.cos(marker.orbitAngle) * MINER_DIVE_RADIUS;
    const ty = context.playerY + Math.sin(marker.orbitAngle) * MINER_DIVE_RADIUS;

    const dist = Math.hypot(tx - enemy.position.x, ty - enemy.position.y);
    this.steerTo(enemy, tx, ty, marker.speed * DIVE_SPEED_MULT, dt);

    if (dist <= MINE_DROP_RADIUS || marker.modeT >= DIVE_TIMEOUT) {
      context.mineSpawns.push({ x: enemy.position.x, y: enemy.position.y });
      marker.mode = 2;
      marker.modeT = 0;
      marker.waitTimer = MINER_DIVE_COOLDOWN + context.rng.range(0, 2);
    }
  }

  /** Отход обратно на внешнее кольцо. */
  private returnToRing(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const angle = Math.atan2(
      enemy.position.y - context.zoneY,
      enemy.position.x - context.zoneX,
    );
    const radius = context.zoneRadius * MINER_HOLD_R;
    this.steerTo(
      enemy,
      context.zoneX + Math.cos(angle) * radius,
      context.zoneY + Math.sin(angle) * radius,
      marker.speed,
      dt,
    );
  }

  /** Гладкое движение к точке с доворотом носа. */
  private steerTo(enemy: EnemyRef, x: number, y: number, speed: number, dt: number): void {
    const angle = Math.atan2(y - enemy.position.y, x - enemy.position.x);
    smoothVelocity(
      enemy.velocity,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed,
      TURN_RATE,
      dt,
    );
    this.faceVelocity(enemy, dt);
  }

  /** Стоять на месте (зона ещё не активна). */
  private holdVelocity(enemy: EnemyRef, dt: number): void {
    smoothVelocity(enemy.velocity, 0, 0, TURN_RATE, dt);
    this.faceVelocity(enemy, dt);
  }

  private faceVelocity(enemy: EnemyRef, dt: number): void {
    const { vx, vy } = enemy.velocity;
    if (Math.hypot(vx, vy) < 1) return;
    const target = Math.atan2(vy, vx);
    let delta = target - enemy.marker.angle;
    while (delta > Math.PI) delta -= Math.PI * 2;
    while (delta < -Math.PI) delta += Math.PI * 2;
    enemy.marker.angle += delta * Math.min(1, 6 * dt);
  }
}
