/**
 * BossStrategy — движение и фазовые механики боссов арены.
 *
 * Босс не гоняется за игроком: он держит среднюю дистанцию и стрейфит по
 * дуге. Смена фаз по остатку прочности делает его агрессивнее, а набор
 * атак зависит от вида (`marker.bossVariant`):
 *
 *   • Страж Периметра — вращающиеся лазерные лучи, вызов носителей,
 *     затем ускоренные истребители;
 *   • Колосс — секторные турели (EnemyShootingSystem), таран с вызовом
 *     крейсеров, гравитационная воронка;
 *   • Улей — постоянный рой, разделение на маток, рой-шторм.
 *
 * Стрельба вынесена в EnemyShootingSystem: здесь только позиция, фаза
 * (`marker.mode`), шаг боссовой атаки (`marker.bossState`) и наведение
 * турели, чтобы рендер и орудия читали одно состояние.
 */

import {
  BOSS_ADVANCE_R,
  BOSS_COLOSSUS_GRAVITY_ACCEL,
  BOSS_COLOSSUS_GRAVITY_RADIUS,
  BOSS_COLOSSUS_RAM_COOLDOWN,
  BOSS_COLOSSUS_RAM_SPEED_MULT,
  BOSS_COLOSSUS_RAM_TIME,
  BOSS_COLOSSUS_RAM_WINDUP,
  BOSS_COLOSSUS_SUMMON_CRUISERS,
  BOSS_HIVE_FIELD_CAP,
  BOSS_HIVE_SPAWN_BATCH,
  BOSS_HIVE_SPAWN_INTERVAL,
  BOSS_HIVE_SPLIT_COUNT,
  BOSS_HIVE_STORM_BATCH,
  BOSS_HIVE_STORM_COOLDOWN,
  BOSS_HIVE_STORM_INTERVAL,
  BOSS_HIVE_STORM_TIME,
  BOSS_HOLD_R,
  BOSS_PHASE2_RATIO,
  BOSS_PHASE3_RATIO,
  BOSS_STRAFE_CHANGE_INTERVAL,
  BOSS_STRAFE_SPEED_MULT,
  BOSS_TURN_RATE,
  BOSS_WARDEN_LASER_ARMS,
  BOSS_WARDEN_LASER_DAMAGE,
  BOSS_WARDEN_LASER_HALF_WIDTH,
  BOSS_WARDEN_LASER_HIT_CD,
  BOSS_WARDEN_LASER_PERIOD,
  BOSS_WARDEN_LASER_RADIUS,
  BOSS_WARDEN_SUMMON_CARRIERS,
  BOSS_WARDEN_SUMMON_FIGHTERS,
  BOSS_WARDEN_SUMMON_INTERVAL,
  BossVariant,
  EnemyKind,
  HIVE_STANDOFF_R,
} from "../../balance";
import type { EnemyRef } from "../../ecs";
import { TAU, lerpAngle, smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";
import { steer, wrapAngle } from "./ArchetypeMovement";

/** Насколько близко к целевой орбите босс начинает боковой стрейф. */
const HOLD_BAND_PX = 22;
/** Дистанция вызова подкреплений от корпуса босса, px. */
const SUMMON_RADIUS = 120;
/** Множитель скорости истребителей, которых вызывает Страж в третьей фазе. */
const WARDEN_FIGHTER_SPEED_MULT = 1.35;

export class BossStrategy implements IEnemyStrategy {
  private strafeTimer = 0;

  update(enemy: EnemyRef, context: GameContext, dt: number): void {
    const marker = enemy.marker;

    // Фаза 0/1/2 по остатку прочности. Marker.mode читают орудия и рендер.
    const ratio = enemy.life.max > 0 ? enemy.life.remaining / enemy.life.max : 1;
    const phase = ratio <= BOSS_PHASE3_RATIO ? 2 : ratio <= BOSS_PHASE2_RATIO ? 1 : 0;
    const justEntered = marker.mode !== phase;
    if (justEntered) {
      marker.mode = phase;
      marker.modeT = 0;
      marker.bossState = 0;
      marker.bossTimer = 0;
    } else {
      marker.modeT += dt;
    }

    switch (marker.bossVariant) {
      case BossVariant.Colossus:
        this.updateColossus(enemy, context, dt, phase, justEntered);
        break;
      case BossVariant.Hive:
        this.updateHive(enemy, context, dt, phase, justEntered);
        break;
      default:
        this.updateWarden(enemy, context, dt, phase, justEntered);
        break;
    }

    // Турель смотрит на игрока независимо от курса корпуса.
    const desiredTurret = Math.atan2(
      context.playerY - enemy.position.y,
      context.playerX - enemy.position.x,
    );
    marker.turretAngle = lerpAngle(
      marker.turretAngle,
      desiredTurret,
      1 - Math.exp(-(BOSS_TURN_RATE + 2.2) * dt),
    );
  }

  // ============================== Страж ==============================

  /** Страж: держит орбиту, вращает лучи, вызывает подкрепления. */
  private updateWarden(
    enemy: EnemyRef,
    context: GameContext,
    dt: number,
    phase: number,
    justEntered: boolean,
  ): void {
    const marker = enemy.marker;
    this.holdOrbit(enemy, context, dt, phase);

    // Два луча вращаются вокруг корпуса: игрок читает безопасный клин.
    marker.lockAngle += (TAU / BOSS_WARDEN_LASER_PERIOD) * dt;
    marker.fireCd = Math.max(0, marker.fireCd - dt);

    const dx = context.playerX - enemy.position.x;
    const dy = context.playerY - enemy.position.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= BOSS_WARDEN_LASER_RADIUS && dist > 0.001 && marker.fireCd <= 0) {
      const toPlayer = Math.atan2(dy, dx);
      for (let i = 0; i < BOSS_WARDEN_LASER_ARMS; i++) {
        const arm = marker.lockAngle + (i / BOSS_WARDEN_LASER_ARMS) * TAU;
        if (Math.abs(wrapAngle(toPlayer - arm)) <= BOSS_WARDEN_LASER_HALF_WIDTH) {
          marker.fireCd = BOSS_WARDEN_LASER_HIT_CD;
          context.damagePlayer?.(BOSS_WARDEN_LASER_DAMAGE, "boss");
          break;
        }
      }
    }

    if (justEntered && phase === 1) {
      this.summon(context, enemy, EnemyKind.Carrier, BOSS_WARDEN_SUMMON_CARRIERS);
    }
    if (justEntered && phase === 2) {
      marker.bossTimer = BOSS_WARDEN_SUMMON_INTERVAL;
    }
    // Третья фаза: ускоренные истребители приходят волнами.
    if (phase === 2) {
      marker.bossTimer -= dt;
      if (marker.bossTimer <= 0) {
        marker.bossTimer = BOSS_WARDEN_SUMMON_INTERVAL;
        this.summon(
          context,
          enemy,
          EnemyKind.Fighter,
          BOSS_WARDEN_SUMMON_FIGHTERS,
          WARDEN_FIGHTER_SPEED_MULT,
        );
      }
    }
  }

  // ============================== Колосс ==============================

  /** Колосс: секторные турели, таран с эскортом, гравитационная воронка. */
  private updateColossus(
    enemy: EnemyRef,
    context: GameContext,
    dt: number,
    phase: number,
    justEntered: boolean,
  ): void {
    const marker = enemy.marker;

    if (phase === 1) {
      if (justEntered) {
        marker.bossState = 0;
        marker.bossTimer = 2;
        this.summon(context, enemy, EnemyKind.Cruiser, BOSS_COLOSSUS_SUMMON_CRUISERS);
      }
      // Цикл тарана: покой → подготовка с фиксацией курса → рывок.
      if (marker.bossState === 0) {
        this.holdOrbit(enemy, context, dt, phase);
        marker.bossTimer -= dt;
        if (marker.bossTimer <= 0) {
          marker.bossState = 1;
          marker.bossTimer = BOSS_COLOSSUS_RAM_WINDUP;
          marker.lockAngle = Math.atan2(
            context.playerY - enemy.position.y,
            context.playerX - enemy.position.x,
          );
        }
      } else if (marker.bossState === 1) {
        // Подготовка: корпус медленно доворачивается, игрок успевает уйти.
        this.holdOrbit(enemy, context, dt, phase);
        marker.bossTimer -= dt;
        if (marker.bossTimer <= 0) {
          marker.bossState = 2;
          marker.bossTimer = BOSS_COLOSSUS_RAM_TIME;
        }
      } else {
        // Рывок по зафиксированному курсу: смена направления невозможна.
        steer(
          enemy,
          marker.lockAngle,
          marker.speed * BOSS_COLOSSUS_RAM_SPEED_MULT,
          6,
          dt,
        );
        marker.bossTimer -= dt;
        if (marker.bossTimer <= 0) {
          marker.bossState = 0;
          marker.bossTimer = BOSS_COLOSSUS_RAM_COOLDOWN;
        }
      }
      return;
    }

    this.holdOrbit(enemy, context, dt, phase);

    // Третья фаза: воронка тянет игрока к центру босса.
    if (phase === 2) {
      const dx = context.playerX - enemy.position.x;
      const dy = context.playerY - enemy.position.y;
      const dist = Math.hypot(dx, dy);
      if (dist > 1 && dist < BOSS_COLOSSUS_GRAVITY_RADIUS) {
        const pull = BOSS_COLOSSUS_GRAVITY_ACCEL * dt;
        context.pullPlayer?.((-dx / dist) * pull, (-dy / dist) * pull);
      }
    }
  }

  // =============================== Улей ===============================

  /** Улей: постоянный рой, разделение на маток, рой-шторм. */
  private updateHive(
    enemy: EnemyRef,
    context: GameContext,
    dt: number,
    phase: number,
    justEntered: boolean,
  ): void {
    const marker = enemy.marker;
    this.holdOrbit(enemy, context, dt, phase, HIVE_STANDOFF_R);

    if (justEntered && phase === 1) {
      for (let i = 0; i < BOSS_HIVE_SPLIT_COUNT; i++) {
        const angle = (i / BOSS_HIVE_SPLIT_COUNT) * TAU + marker.seed;
        context.carrierSpawns.push({
          x: enemy.position.x + Math.cos(angle) * SUMMON_RADIUS,
          y: enemy.position.y + Math.sin(angle) * SUMMON_RADIUS,
          kind: EnemyKind.HiveMother,
        });
      }
    }

    if (phase === 2 && justEntered) {
      marker.bossState = 0;
      marker.bossTimer = BOSS_HIVE_STORM_TIME;
    }

    // Рой-шторм: плотный поток дронов 10 секунд, затем передышка.
    let storming = false;
    if (phase === 2) {
      marker.bossTimer -= dt;
      if (marker.bossTimer <= 0) {
        marker.bossState = marker.bossState === 0 ? 1 : 0;
        marker.bossTimer =
          marker.bossState === 0 ? BOSS_HIVE_STORM_TIME : BOSS_HIVE_STORM_COOLDOWN;
      }
      storming = marker.bossState === 0;
    }

    marker.spawnCd -= dt;
    if (marker.spawnCd > 0) return;
    if (context.enemies.length >= BOSS_HIVE_FIELD_CAP) return;

    marker.spawnCd = storming ? BOSS_HIVE_STORM_INTERVAL : BOSS_HIVE_SPAWN_INTERVAL;
    const batch = storming ? BOSS_HIVE_STORM_BATCH : BOSS_HIVE_SPAWN_BATCH;
    for (let i = 0; i < batch; i++) {
      const angle = marker.seed + marker.spawnCd + (i / batch) * TAU;
      context.carrierSpawns.push({
        x: enemy.position.x + Math.cos(angle) * 40,
        y: enemy.position.y + Math.sin(angle) * 40,
        hive: true,
      });
    }
  }

  // ============================== Общее ===============================

  /**
   * Держать орбиту у игрока: дистанция и боковой стрейф.
   * `holdR` — доля радиуса зоны, на которой босс держит дистанцию.
   */
  private holdOrbit(
    enemy: EnemyRef,
    context: GameContext,
    dt: number,
    phase: number,
    holdR = BOSS_HOLD_R,
  ): void {
    const marker = enemy.marker;
    const pos = enemy.position;
    const vel = enemy.velocity;

    const dx = context.playerX - pos.x;
    const dy = context.playerY - pos.y;
    const dist = Math.hypot(dx, dy) || 1;
    const dirX = dx / dist;
    const dirY = dy / dist;

    // На третьей фазе босс подходит ближе: у игрока меньше времени на манёвр.
    const distance = Math.max(80, context.zoneRadius * (phase === 2 ? holdR * 0.82 : holdR));
    const maxRadial = marker.speed * (0.35 + phase * 0.12);

    let radial = 0;
    if (dist > distance + HOLD_BAND_PX && dist < context.zoneRadius * BOSS_ADVANCE_R) {
      radial = Math.min(maxRadial, (dist - distance) * 0.6);
    } else if (dist < distance - HOLD_BAND_PX) {
      radial = -Math.min(maxRadial, (distance - dist) * 0.8);
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
  }

  /** Вызвать подкрепление вокруг босса: враги появляются с разных сторон. */
  private summon(
    context: GameContext,
    enemy: EnemyRef,
    kind: EnemyKind,
    count: number,
    speedMult = 1,
  ): void {
    for (let i = 0; i < count; i++) {
      const angle = (i / Math.max(1, count)) * TAU + enemy.marker.seed;
      context.carrierSpawns.push({
        x: enemy.position.x + Math.cos(angle) * SUMMON_RADIUS,
        y: enemy.position.y + Math.sin(angle) * SUMMON_RADIUS,
        kind,
        speedMult,
      });
    }
  }
}
