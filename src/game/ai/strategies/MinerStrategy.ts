/**
 * MinerStrategy — минёр: держит внешнее кольцо, изредка оставляет мину
 * на маршруте игрока и уходит с траектории, если игрок летит на него.
 *
 * Поведение:
 *   - патруль по внешнему кольцу (mode 0);
 *   - заход к точке на маршруте игрока, постановка мины, отход (mode 1→2);
 *   - уклонение с траектории летящего на минёра игрока (mode 3).
 *
 * Минёр не должен становиться стенкой: мина ставится на маршруте игрока,
 * а сам корпус уходит в сторону, оставляя проход.
 */

import type { EnemyRef } from "../../ecs";
import {
  MINER_DIVE_COOLDOWN,
  MINER_HOLD_R,
  MINER_ORBIT_SPEED,
  MINER_RETREAT_TIME,
} from "../../balance";
import { smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";

/** Скорость патруля, доля от базовой. */
const HOLD_SPEED_MULT = 0.85;
/** Скорость захода/уклонения, доля от базовой. */
const DIVE_SPEED_MULT = 1.15;
const DODGE_SPEED_MULT = 1.2;
/** Доворот корпуса, рад/с. */
const TURN_RATE = 3.2;
/** Дистанция до точки орбиты, на которой мина считается поставленной. */
const MINE_DROP_RADIUS = 36;
/** Дольше этого заход не длится: минёр не «залипает» у игрока. */
const DIVE_TIMEOUT = 3;
/** Длительность уклонения, секунды. */
const DODGE_DURATION = 1.0;
/** Горизонт упреждения мины по маршруту игрока, секунды. */
const MINE_LEAD_TIME = 1.2;
/** Дистанция, ближе которой игрок считается летящим на минёра. */
const HEADING_RANGE = 450;
/** Порог скорости игрока для распознавания «летит». */
const HEADING_SPEED_THRESHOLD = 60;

export class MinerStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    if (context.zoneRadius <= 0) {
      this.holdVelocity(enemy, dt);
      return;
    }

    marker.modeT += dt;

    // Уклонение, если игрок летит на минёра.
    if (this.playerHeadingToward(enemy, context)) {
      if (marker.mode !== 3) {
        // Оставляем мину на своём месте — она ляжет на маршруте игрока,
        // пока корпус уходит в сторону.
        if (marker.waitTimer <= 0) {
          context.mineSpawns.push({ x: enemy.position.x, y: enemy.position.y });
          marker.waitTimer = MINER_DIVE_COOLDOWN;
        }
        marker.mode = 3;
        marker.modeT = 0;
      }
      this.dodge(enemy, context, dt);
      if (marker.modeT >= DODGE_DURATION) {
        marker.mode = 0;
        marker.modeT = 0;
      }
      return;
    }

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
    if (marker.mode === 3) {
      // Уклонение прервано (игрок перестал лететь): возвращаемся в патруль.
      marker.mode = 0;
      marker.modeT = 0;
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
      // Точка постановки мины — на маршруте игрока (с упреждением).
      marker.orbitAngle = Math.atan2(
        context.playerY + context.playerVy * MINE_LEAD_TIME - enemy.position.y,
        context.playerX + context.playerVx * MINE_LEAD_TIME - enemy.position.x,
      );
    }
  }

  /** Заход к точке на маршруте игрока: мина ставится, затем отход. */
  private dive(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    // Точка цели — с упреждением по скорости игрока (маршрут).
    const lead = MINE_LEAD_TIME;
    const tx = context.playerX + context.playerVx * lead;
    const ty = context.playerY + context.playerVy * lead;

    const dist = Math.hypot(tx - enemy.position.x, ty - enemy.position.y);
    this.steerTo(enemy, tx, ty, marker.speed * DIVE_SPEED_MULT, dt);

    if (dist <= MINE_DROP_RADIUS || marker.modeT >= DIVE_TIMEOUT) {
      context.mineSpawns.push({ x: enemy.position.x, y: enemy.position.y });
      marker.mode = 2;
      marker.modeT = 0;
      marker.waitTimer = MINER_DIVE_COOLDOWN + context.rng.range(0, 2);
    }
  }

  /** Уклонение с траектории летящего на минёра игрока. */
  private dodge(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;
    const dx = enemy.position.x - context.playerX;
    const dy = enemy.position.y - context.playerY;
    const pvx = context.playerVx;
    const pvy = context.playerVy;
    const pspeed = Math.hypot(pvx, pvy) || 1;
    // Два перпендикуляра к курсу игрока; выбираем тот, что уводит минёра
    // в сторону от игрока (больший проекция на вектор «игрок→минёр»).
    const perp1 = { x: -pvy / pspeed, y: pvx / pspeed };
    const perp2 = { x: pvy / pspeed, y: -pvx / pspeed };
    const d1 = perp1.x * dx + perp1.y * dy;
    const d2 = perp2.x * dx + perp2.y * dy;
    const chosen = d1 > d2 ? perp1 : perp2;
    this.steerTo(
      enemy,
      enemy.position.x + chosen.x * 100,
      enemy.position.y + chosen.y * 100,
      marker.speed * DODGE_SPEED_MULT,
      dt,
    );
  }

  /** Игрок летит на минёра? */
  private playerHeadingToward(enemy: EnemyRef, context: GameContext): boolean {
    const dx = enemy.position.x - context.playerX;
    const dy = enemy.position.y - context.playerY;
    const dist = Math.hypot(dx, dy);
    if (dist > HEADING_RANGE || dist < 1) return false;
    const pspeed = Math.hypot(context.playerVx, context.playerVy);
    if (pspeed < HEADING_SPEED_THRESHOLD) return false;
    // Игрок движется в сторону минёра: проекция скорости игрока на вектор
    // «игрок→минёр» положительна.
    const closing = context.playerVx * dx + context.playerVy * dy;
    return closing > 0;
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
