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
 *
 * Истребитель стреляет только по заявке AI (marker.fireGate): её ставит
 * FighterStrategy, когда расчёт упреждения подтверждает попадание. Крейсер и
 * дрононосец ведут огонь по таймеру.
 *
 * У болтов нет времени жизни: снаряд летит до края игровой зоны, где его
 * уничтожает BulletSystem. leadTime в вооружении — только горизонт
 * упреждения прицела, дальше которого цель берётся по текущей позиции.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { aimAtTarget } from "../aiming/AimSolver";
import {
    CRUISER_BOLT_LEAD_TIME,
    CRUISER_BULLET_SPEED,
    CRUISER_FIRE_RANGE,
    ENEMY_BOLT_LEAD_TIME,
    ENEMY_BOLT_SPEED,
    ENEMY_SHOOT_RANGE,
    enemyHitChance,
    EnemyKind,
    FIGHTER_BOLT_SPEED,
    FIGHTER_BURST_INTERVAL,
    FIGHTER_CIRCLE_OMEGA,
    PLAYER_BULLET_HIT_OFFSET,
    PLAYER_HITBOX_RADIUS
} from "../balance";
import { EnemyComponent } from "../ecs/components/EnemyComponent";
import { PositionComponent } from "../ecs/components/PositionComponent";
import { Phase, PhasedSystem } from "../ecs/SystemSchedule";
import { lerpAngle, rand } from "../math";
import type { AudioManager } from "./AudioManager";

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
  /** Угловая скорость курса, рад/с: истребитель стреляет по дуге. */
  turnRate?: number;
}

/** Вооружение врага: скорость болта, горизонт упреждения и тип снаряда. */
interface EnemyWeapon {
  boltSpeed: number;
  /** Горизонт упреждения прицела; НЕ время жизни — болт летит до края зоны. */
  leadTime: number;
  heavy: boolean;
}

/** Тактика стрельбы по классам.
 * Носитель (Carrier) не стреляет: его угроза — рой и масса, а не болты. */
const TURRETS: Partial<Record<EnemyKind, EnemyWeapon>> = {
  [EnemyKind.Fighter]: { boltSpeed: FIGHTER_BOLT_SPEED, leadTime: ENEMY_BOLT_LEAD_TIME, heavy: false },
  [EnemyKind.Cruiser]: { boltSpeed: CRUISER_BULLET_SPEED, leadTime: CRUISER_BOLT_LEAD_TIME, heavy: true },
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
    if (!this.isCombatActive()) {
      // Бой остановлен — невыбранная заявка не должна выстрелить при возврате.
      this.clearFireGates();
      return;
    }
    const enemies = this.collectEnemyShots();
    if (!enemies.length) return;

    const player = this.getPlayer();
    for (const shot of enemies) {
      const { marker, position } = shot;
      if (marker.dead) continue;

      // Орудия крейсера — отдельная турель: стволы следят за игроком даже
      // вне дистанции огня, иначе к моменту выстрела они смотрели бы в сторону.
      if (marker.kind === EnemyKind.Cruiser) this.aimTurret(marker, position, player, dt);

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

  /** Снять все заявки на выстрел (вне боя они недействительны). */
  private clearFireGates(): void {
    if (!this.aspect) return;
    for (const entity of [...this.aspect.entities]) {
      const marker = entity.components.get(EnemyComponent);
      if (marker) marker.fireGate = false;
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

    // Дульные срезы разнесены поперёк наведения турели, а не курса корпуса.
    const fx = Math.cos(e.turretAngle) * CRUISER_MUZZLE_FORWARD;
    const fy = Math.sin(e.turretAngle) * CRUISER_MUZZLE_FORWARD;
    const gx = -Math.sin(e.turretAngle) * CRUISER_MUZZLE_GAP;
    const gy = Math.cos(e.turretAngle) * CRUISER_MUZZLE_GAP;

    // Левый ствол
    e.tCd1! -= dt;
    if (e.tCd1! <= 0) {
      e.tCd1! = rate + rand(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      this.fire(e, position.x + fx + gx, position.y + fy + gy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }

    // Правый ствол
    e.tCd2! -= dt;
    if (e.tCd2! <= 0) {
      e.tCd2! = rate + rand(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      this.fire(e, position.x + fx - gx, position.y + fy - gy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }
  }

  /**
   * Наведение орудий крейсера: стволы доворачиваются к игроку с ограниченной
   * скоростью. Корпус при этом смотрит по курсу — его ведёт CruiserStrategy,
   * турель живёт отдельным углом marker.turretAngle.
   */
  private aimTurret(
    e: EnemyComponent,
    position: PositionComponent,
    player: PlayerMotion,
    dt: number,
  ): void {
    const desired = Math.atan2(player.y - position.y, player.x - position.x);
    e.turretAngle = lerpAngle(
      e.turretAngle,
      desired,
      1 - Math.exp(-CRUISER_TURRET_TURN_RATE * dt),
    );
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

    // Истребитель: очередь болтов (burst) или одиночный выстрел.
    if (e.kind === EnemyKind.Fighter) {
      // Если есть очередь — добиваем её по burstTimer
      if (e.burstLeft > 0) {
        e.burstTimer -= dt;
        if (e.burstTimer <= 0) {
          e.burstTimer = FIGHTER_BURST_INTERVAL;
          e.burstLeft--;
          this.fire(e, position.x, position.y, player, weapon, hitChance);
          this.audio.playEnemyShoot();
          // Если очередь не закончена — остаёмся в FIRE
          if (e.burstLeft > 0) return;
          // Очередь закончена — сбрасываем
          e.fireGate = false;
          e.burstLeft = 0;
        }
        return;
      }
      // Иначе ждёт заявки AI: он стреляет только в подтверждённое окно.
      if (!e.fireGate) return;
      e.fireGate = false;
    }

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
        maxFlightTime: weapon.leadTime,
        // Истребитель бьёт по дуге курса в том же режиме, в котором AI
        // подтверждает окно выстрела: иначе заявка и прицел расходятся.
        turnRate:
          e.kind === EnemyKind.Fighter && Math.abs(player.turnRate ?? 0) >= FIGHTER_CIRCLE_OMEGA
            ? player.turnRate
            : 0,
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
    });
  }
}

/* ---- Константы стрельбы ---- */

const CRUISER_TURRET_RATE = 1.5;
const CRUISER_RATE_WAVE_STEP = 0.08;
const CRUISER_RATE_JITTER = 0.15;
/** Скорость доворота орудийной турели крейсера к цели, рад/с. */
const CRUISER_TURRET_TURN_RATE = 3.2;
/** Вынос дульного среза вдоль оси наведения турели. */
const CRUISER_MUZZLE_FORWARD = 20;
/** Полуразнесение стволов поперёк оси наведения турели. */
const CRUISER_MUZZLE_GAP = 8;
const SINGLE_TURRET_RATE = 0.8;
const CARRIER_TURRET_RATE = 1.5;
const SINGLE_RATE_WAVE_BOOST = 0.08;
const SINGLE_RATE_WAVE_CAP = 2.5;
