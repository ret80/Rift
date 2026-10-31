/**
 * EnemyShootingSystem — ECS-система стрельбы врагов.
 *
 * Орудия врагов берут упреждение: снаряд летит в точку, куда игрок прибудет
 * к моменту подлёта, а не в его текущую позицию. Меткость растёт с волной,
 * но никогда не достигает 100% — см. balance/accuracy.ts.
 *
 * Система фильтрует ECS-сущности с компонентом EnemyComponent (единый
 * источник правды), спавнит болт напрямую в ECS-мир через SpawnBoltSource
 * и обновляет таймеры орудий прямо в компонентах. Никакой публикации
 * события 'enemy_fired' нет — вражеская пуля создаётся в том же домене.
 * Движение и AI остаются в EnemySystem.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { PhasedSystem, Phase } from "../ecs/SystemSchedule";
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
  PLAYER_HITBOX_RADIUS,
} from "../balance";
import { rand } from "../math";
import type { AudioManager } from "./AudioManager";
import { EnemyComponent } from "../ecs/components/EnemyComponent";
import { PositionComponent } from "../ecs/components/PositionComponent";

/** Локальная связка «маркер + позиция» врага для стрельбы (без radius/life). */
interface EnemyShotRef {
  marker: EnemyComponent;
  position: PositionComponent;
}

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

/** Источник состояния игрока для прицеливания. */
export type PlayerMotionSource = () => PlayerMotion;
/** Флаг: активен ли игровой режим (playing/active) для стрельбы. */
export type CombatActiveSource = () => boolean;

/** Вычислительный результат одного выстрела врага — параметры снаряда. */
export interface EnemyBoltShot {
  sx: number;
  sy: number;
  angle: number;
  boltDmg: number;
  heavy: boolean;
  cruiser: boolean;
  boltSpeed: number;
  boltLife: number;
}

/**
 * Спавн болта врага напрямую в ECS-мир. Передаётся доменом врагов:
 * система стрельбы не публикует событие и не знает про чужие сущности.
 */
export type SpawnBoltSource = (shot: EnemyBoltShot) => void;

export class EnemyShootingSystem extends PhasedSystem {
  private aspect: Aspect | null = null;
  private audio: AudioManager;
  private wave = 1;

  constructor(
    audio: AudioManager,
    private readonly getPlayer: PlayerMotionSource,
    private readonly isCombatActive: CombatActiveSource,
    private readonly spawnBolt: SpawnBoltSource,
  ) {
    super(Phase.EnemyActions);
    this.audio = audio;
  }

  reset(): void {
    this.wave = 1;
  }

  setWave(wave: number): void {
    this.wave = wave;
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(EnemyComponent);
  }

  /**
   * Обновить стрельбу всех врагов.
   * Вражеская пуля спавнится напрямую в Engine (без события-«моста»).
   */
  process(dt: number): void {
    if (!this.isCombatActive()) return;
    const enemies = this.collectEnemyShots();
    if (!enemies.length) return;

    const player = this.getPlayer();
    for (const shot of enemies) {
      const { marker, position } = shot;
      if (marker.dead) continue;

      const weapon = TURRETS[marker.kind];
      if (!weapon) continue;

      const dist = Math.hypot(player.x - position.x, player.y - position.y) || 1;
      const range = marker.kind === EnemyKind.Cruiser ? CRUISER_FIRE_RANGE : ENEMY_SHOOT_RANGE;
      if (dist >= range) continue;

      const hitChance = enemyHitChance(this.wave, marker.kind);

      if (marker.kind === EnemyKind.Cruiser) {
        this.fireCruiserTurrets(shot, dt, player, weapon, hitChance);
      } else {
        this.fireSingleTurret(shot, dt, player, weapon, hitChance);
      }
    }
  }

  /** Собрать сущности с EnemyComponent (как «маркер + позиция»). */
  private collectEnemyShots(): EnemyShotRef[] {
    if (!this.aspect) return [];
    const result: EnemyShotRef[] = [];
    for (const entity of [...this.aspect.entities]) {
      const marker = entity.components.get(EnemyComponent);
      if (!marker) continue;
      const position = entity.components.get(PositionComponent);
      if (!position) continue;
      result.push({ marker, position });
    }
    return result;
  }

  /** Двуствольный Cruiser: две независимые турели с таймерами tCd1/tCd2 */
  private fireCruiserTurrets(
    shot: EnemyShotRef,
    dt: number,
    player: PlayerMotion,
    weapon: EnemyWeapon,
    hitChance: number
  ): void {
    const { marker: e, position } = shot;
    const rate =
      CRUISER_TURRET_RATE / (3 + this.wave * CRUISER_RATE_WAVE_STEP);

    // Левая турель
    e.tCd1! -= dt;
    if (e.tCd1! <= 0) {
      e.tCd1! = rate + rand(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      const sx = position.x - Math.sin(e.angle) * 14;
      const sy = position.y + Math.cos(e.angle) * 14;
      this.fire(e, sx, sy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }

    // Правая турель
    e.tCd2! -= dt;
    if (e.tCd2! <= 0) {
      e.tCd2! = rate + rand(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      const sx = position.x + Math.sin(e.angle) * 14;
      const sy = position.y - Math.cos(e.angle) * 14;
      this.fire(e, sx, sy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }
  }

  /** Одиночная турель: Fighter и Carrier */
  private fireSingleTurret(
    shot: EnemyShotRef,
    dt: number,
    player: PlayerMotion,
    weapon: EnemyWeapon,
    hitChance: number
  ): void {
    const { marker: e, position } = shot;
    const baseRate = e.kind === EnemyKind.Carrier ? CARRIER_TURRET_RATE : SINGLE_TURRET_RATE;
    const waveBoost = Math.min(SINGLE_RATE_WAVE_CAP, 1 + this.wave * SINGLE_RATE_WAVE_BOOST);
    e.fireCd -= dt * waveBoost;

    if (e.fireCd > 0) return;
    e.fireCd = baseRate;

    this.fire(e, position.x, position.y, player, weapon, hitChance);
    if (weapon.heavy) this.audio.playHeavyShoot();
    else this.audio.playEnemyShoot();
  }

  /**
   * Выстрел одной турели: упреждение по скорости игрока плюс рассеивание
   * под меткость врага. boltSpeed в снаряде и в упреждении — одно и то же.
   */
  private fire(
    e: EnemyComponent,
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

    this.spawnBolt({
      sx,
      sy,
      angle,
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
