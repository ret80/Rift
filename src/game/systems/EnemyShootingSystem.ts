/**
 * EnemyShootingSystem — стрельба врагов.
 *
 * Орудия врагов берут упреждение: снаряд летит в точку, куда игрок прибудет
 * к моменту подлёта, а не в его текущую позицию. Меткость растёт с волной,
 * но никогда не достигает 100% — см. balance/accuracy.ts.
 *
 * Движение и AI остаются в EnemySystem.
 */

import { aimAtTarget } from "../aiming/AimSolver";
import {
    CRUISER_BOLT_LIFE,
    CRUISER_BULLET_SPEED,
    CRUISER_FIRE_RANGE,
    ENEMY_BOLT_LIFE,
    ENEMY_BOLT_SPEED,
    ENEMY_SHOOT_RANGE,
    enemyHitChance,
    EnemyKind,
    PLAYER_BULLET_HIT_OFFSET,
    PLAYER_HITBOX_RADIUS
} from "../balance";
import type { EventBus } from "../core/EventBus";
import { rand } from "../math";
import type { Enemy } from "../types";
import type { AudioManager } from "./AudioManager";

/** Внешний радиус хитбокса игрока — угловой размер цели для вражеских орудий. */
const PLAYER_HIT_RADIUS = PLAYER_HITBOX_RADIUS + PLAYER_BULLET_HIT_OFFSET;

/** Движущаяся цель вражеского орудия — игрок. */
export interface PlayerMotion {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Вооружение врага: скорость болта, время жизни и тип снаряда. */
interface EnemyWeapon {
  boltSpeed: number;
  boltLife: number;
  heavy: boolean;
}

/** Тактика стрельбы по классам. */
const TURRETS: Partial<Record<EnemyKind, EnemyWeapon>> = {
  [EnemyKind.Fighter]: { boltSpeed: ENEMY_BOLT_SPEED, boltLife: ENEMY_BOLT_LIFE, heavy: false },
  [EnemyKind.Cruiser]: { boltSpeed: CRUISER_BULLET_SPEED, boltLife: CRUISER_BOLT_LIFE, heavy: true },
  [EnemyKind.Carrier]: { boltSpeed: ENEMY_BOLT_SPEED, boltLife: ENEMY_BOLT_LIFE, heavy: true },
};

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
  update(dt: number, enemyList: Enemy[], player: PlayerMotion): void {
    for (const e of enemyList) {
      if (e.dead) continue;

      const weapon = TURRETS[e.kind];
      if (!weapon) continue;

      const dist = Math.hypot(player.x - e.x, player.y - e.y) || 1;
      const range = e.kind === EnemyKind.Cruiser ? CRUISER_FIRE_RANGE : ENEMY_SHOOT_RANGE;
      if (dist >= range) continue;

      const hitChance = enemyHitChance(this.wave, e.kind);

      if (e.kind === EnemyKind.Cruiser) {
        this.fireCruiserTurrets(e, dt, player, weapon, hitChance);
      } else {
        this.fireSingleTurret(e, dt, player, weapon, hitChance);
      }
    }
  }

  /** Двуствольный Cruiser: две независимые турели с таймерами tCd1/tCd2 */
  private fireCruiserTurrets(
    e: Enemy,
    dt: number,
    player: PlayerMotion,
    weapon: EnemyWeapon,
    hitChance: number
  ): void {
    const rate =
      CRUISER_TURRET_RATE / (3 + this.wave * CRUISER_RATE_WAVE_STEP);

    // Левая турель
    e.tCd1! -= dt;
    if (e.tCd1! <= 0) {
      e.tCd1! = rate + rand(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      const sx = e.x - Math.sin(e.angle) * 14;
      const sy = e.y + Math.cos(e.angle) * 14;
      this.fire(e, sx, sy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }

    // Правая турель
    e.tCd2! -= dt;
    if (e.tCd2! <= 0) {
      e.tCd2! = rate + rand(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      const sx = e.x + Math.sin(e.angle) * 14;
      const sy = e.y - Math.cos(e.angle) * 14;
      this.fire(e, sx, sy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }
  }

  /** Одиночная турель: Fighter и Carrier */
  private fireSingleTurret(
    e: Enemy,
    dt: number,
    player: PlayerMotion,
    weapon: EnemyWeapon,
    hitChance: number
  ): void {
    const baseRate = e.kind === EnemyKind.Carrier ? CARRIER_TURRET_RATE : SINGLE_TURRET_RATE;
    const waveBoost = Math.min(SINGLE_RATE_WAVE_CAP, 1 + this.wave * SINGLE_RATE_WAVE_BOOST);
    e.fireCd -= dt * waveBoost;

    if (e.fireCd > 0) return;
    e.fireCd = baseRate;

    this.fire(e, e.x, e.y, player, weapon, hitChance);
    if (weapon.heavy) this.audio.playHeavyShoot();
    else this.audio.playEnemyShoot();
  }

  /**
   * Выстрел одной турели: упреждение по скорости игрока плюс рассеивание
   * под меткость врага. boltSpeed в снаряде и в упреждении — одно и то же.
   */
  private fire(
    e: Enemy,
    sx: number,
    sy: number,
    player: PlayerMotion,
    weapon: EnemyWeapon,
    hitChance: number
  ): void {
    const angle = aimAtTarget(
      {
        sx,
        sy,
        // Игрок поражается по внешнему радиусу хитбокса — он и задаёт
        // угловой размер цели для рассеивания.
        target: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, r: PLAYER_HIT_RADIUS },
        bulletSpeed: weapon.boltSpeed,
        maxFlightTime: weapon.boltLife,
      },
      hitChance,
      PLAYER_HIT_RADIUS
    );

    this.eventBus.publish("enemy_fired", {
      x: sx,
      y: sy,
      kind: e.kind,
      angle,
      r: e.r,
      boltDmg: e.boltDmg,
      heavy: weapon.heavy,
      cruiser: e.kind === EnemyKind.Cruiser,
      boltSpeed: weapon.boltSpeed,
      boltLife: weapon.boltLife,
    });
  }
}

/* ---- Константы стрельбы ---- */

const CRUISER_TURRET_RATE = 1.5;
const CRUISER_RATE_WAVE_STEP = 0.08;
const CRUISER_RATE_JITTER = 0.15;
const SINGLE_TURRET_RATE = 0.8;
const CARRIER_TURRET_RATE = 1.5;
const SINGLE_RATE_WAVE_BOOST = 0.08;
const SINGLE_RATE_WAVE_CAP = 2.5;
