/**
 * EnemyShootingSystem — стрельба врагов.
 * Отвечает только за выстрелы: расчёт таймеров, точности, направления.
 * Движение и AI остаются в EnemySystem.
 */

import {
  CRUISER_BASE_SPEED,
  CRUISER_FIRE_RANGE,
  EnemyKind,
  FIGHTER_BASE_SPEED,
  HUNTER_SPEED,
  AI_MIN_DIST,
  AI_BASE_PUSH,
  ENEMY_SHOOT_RANGE,
  ENEMY_ACCURACY_MIN,
  ENEMY_ACCURACY_MAX,
  ENEMY_ACCURACY_RAMP,
} from "../balance";
import type { EventBus } from "../core/EventBus";
import type { Enemy } from "../types";
import type { AudioManager } from "./AudioManager";
import { TAU, rand } from "../math";

/** Внутреннее состояние стрельбы для каждого врага */
interface EnemyFireState {
  /** Координаты выстрела (для двуствольного Cruiser — две точки) */
  tx: number;
  ty: number;
}

export class EnemyShootingSystem {
  private eventBus: EventBus;
  private audio: AudioManager;
  private wave = 1;

  constructor(eventBus: EventBus, audio: AudioManager) {
    this.eventBus = eventBus;
    this.audio = audio;
  }

  reset(): void {
    this.wave = 1;
  }

  setWave(wave: number): void {
    this.wave = wave;
  }

  /**
   * Обновить стрельбу всех врагов.
   * Отвечает только за публикацию события 'enemy_fired'.
   */
  update(
    dt: number,
    enemyList: Enemy[],
    playerPos: { x: number; y: number }
  ): void {
    for (const e of enemyList) {
      if (e.dead) continue;

      // Только стреляющие типы
      if (
        e.kind !== EnemyKind.Fighter &&
        e.kind !== EnemyKind.Cruiser &&
        e.kind !== EnemyKind.Carrier
      )
        continue;

      const dx = playerPos.x - e.x;
      const dy = playerPos.y - e.y;
      const dist = Math.hypot(dx, dy) || 1;

      const canShoot =
        (e.kind === EnemyKind.Fighter && dist < ENEMY_SHOOT_RANGE) ||
        (e.kind === EnemyKind.Cruiser && dist < CRUISER_FIRE_RANGE) ||
        (e.kind === EnemyKind.Carrier && dist < ENEMY_SHOOT_RANGE);

      if (!canShoot) continue;

      if (e.kind === EnemyKind.Cruiser) {
        // Cruiser: двуствольные независимые турели
        this.fireCruiserTurrets(e, dt, playerPos);
      } else {
        // Fighter и Carrier: одиночная турель
        this.fireSingleTurret(e, dt, playerPos);
      }
    }
  }

  /** Двуствольный Cruiser: две независимые турели с таймерами tCd1/tCd2 */
  private fireCruiserTurrets(
    e: Enemy,
    dt: number,
    playerPos: { x: number; y: number }
  ): void {
    const accuracy = this.getAccuracy(this.wave);
    const spread = (1 - accuracy) * 0.8;
    const rate = 1.5 / (3 + this.wave * 0.08);

    // Левая турель
    e.tCd1! -= dt;
    if (e.tCd1! <= 0) {
      e.tCd1! = rate + rand(-0.15, 0.15);
      const tx = e.x - Math.sin(e.angle) * 14;
      const ty = e.y + Math.cos(e.angle) * 14;
      const tAngle =
        Math.atan2(playerPos.y - ty, playerPos.x - tx) +
        (Math.random() - 0.5) * 2 * spread;
      this.eventBus.publish("enemy_fired", {
        x: tx,
        y: ty,
        kind: e.kind,
        angle: tAngle,
        r: e.r,
        boltDmg: e.boltDmg,
        heavy: true,
        cruiser: true,
      });
      this.audio.playHeavyShoot();
    }

    // Правая турель
    e.tCd2! -= dt;
    if (e.tCd2! <= 0) {
      e.tCd2! = rate + rand(-0.15, 0.15);
      const tx = e.x + Math.sin(e.angle) * 14;
      const ty = e.y - Math.cos(e.angle) * 14;
      const tAngle =
        Math.atan2(playerPos.y - ty, playerPos.x - tx) +
        (Math.random() - 0.5) * 2 * spread;
      this.eventBus.publish("enemy_fired", {
        x: tx,
        y: ty,
        kind: e.kind,
        angle: tAngle,
        r: e.r,
        boltDmg: e.boltDmg,
        heavy: true,
        cruiser: true,
      });
      this.audio.playHeavyShoot();
    }
  }

  /** Одиночная турель: Fighter и Carrier */
  private fireSingleTurret(
    e: Enemy,
    dt: number,
    playerPos: { x: number; y: number }
  ): void {
    const accuracy = this.getAccuracy(this.wave);
    const spread = (1 - accuracy) * 1.2;
    const baseRate = e.kind === EnemyKind.Carrier ? 1.5 : 0.8;
    const waveBoost = Math.min(2.5, 1 + this.wave * 0.08);
    e.fireCd -= dt * waveBoost;

    if (e.fireCd <= 0) {
      e.fireCd = baseRate;
      const heavy = e.kind === EnemyKind.Carrier;
      // Fighter: стреляет в игрока, Carrier: по корпусу
      const fireAngle =
        e.kind === EnemyKind.Fighter
          ? Math.atan2(playerPos.y - e.y, playerPos.x - e.x)
          : e.angle;
      this.eventBus.publish("enemy_fired", {
        x: e.x,
        y: e.y,
        kind: e.kind,
        angle: fireAngle + (Math.random() - 0.5) * 2 * spread,
        r: e.r,
        boltDmg: e.boltDmg,
        heavy,
        cruiser: false,
      });
      if (heavy) this.audio.playHeavyShoot();
      else this.audio.playEnemyShoot();
    }
  }

  /** Меткость врагов: ENEMY_ACCURACY_MIN на волне 1, растёт до ENEMY_ACCURACY_MAX к волне 30. */
  private getAccuracy(wave: number): number {
    return Math.min(
      ENEMY_ACCURACY_MAX,
      ENEMY_ACCURACY_MIN + wave * ENEMY_ACCURACY_RAMP
    );
  }
}
