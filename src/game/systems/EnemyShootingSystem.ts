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
import { aimAtTarget, solveLead, spreadForChance } from "../aiming/AimSolver";
import {
    CRUISER_BOLT_LEAD_TIME,
    CRUISER_BULLET_SPEED,
    CRUISER_FIRE_RANGE_R,
    CRUISER_MANEUVER_RANGE,
    ENEMY_BOLT_LEAD_TIME,
    ENEMY_SHOOT_RANGE,
    enemyHitChance,
    EnemyKind,
    FIGHTER_BOLT_SPEED,
    HIVE_BOLT_SPEED,
    HIVE_FIRE_CD,
    NEEDLE_BOLT_SPEED,
    NEEDLE_FIRE_CD,
    NEEDLE_RANGE,
    NEEDLE_TELEGRAPH_TIME,
    FIGHTER_BURST_COOLDOWN,
    FIGHTER_BURST_DISPERSION,
    FIGHTER_BURST_INTERVAL,
    FIGHTER_CIRCLE_OMEGA,
    PLAYER_HIT_RADIUS
} from "../balance";
import type { Rng } from "../core/rng";
import { EnemyComponent } from "../ecs/components/EnemyComponent";
import { PositionComponent } from "../ecs/components/PositionComponent";
import { Phase, PhasedSystem } from "../ecs/SystemSchedule";
import { lerpAngle } from "../math";
import type { AudioPort } from "../core/WorldPorts";

/** Локальная связка «маркер + позиция» врага для стрельбы (без radius/life). */
interface EnemyShotRef {
  marker: EnemyComponent;
  position: PositionComponent;
}

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
  private audio: AudioPort;
  private wave = 1;
  /** Ожидающие выстрелы после телеграфа. */
  private pendingShots: Array<{ e: EnemyComponent; shot: EnemyBoltShot; timer: number; type: string }> = [];

  constructor(
    audio: AudioPort,
    private readonly getPlayer: PlayerMotionSource,
    private readonly isCombatActive: CombatActiveSource,
    private readonly spawnBolt: SpawnBoltSource,
    private readonly getZoneRadius: () => number,
    /** Поток случайности боя: разброс очередей и джиттер турелей. */
    private readonly rng: Rng,
  ) {
    super(Phase.EnemyActions);
    this.audio = audio;
  }

  reset(): void {
    this.wave = 1;
    this.pendingShots = [];
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
      this.pendingShots = [];
      return;
    }
    // Обновить ожидающие выстрелы (телеграф).
    const remaining: typeof this.pendingShots = [];
    for (const p of this.pendingShots) {
      p.timer -= dt;
      if (p.timer <= 0) {
        if (!p.e.dead) {
          this.spawnBolt(p.shot);
        }
        p.e.telegraphActive = false;
        p.e.telegraphTimer = 0;
      } else {
        p.e.telegraphTimer = p.timer;
        remaining.push(p);
      }
    }
    this.pendingShots = remaining;

    const enemies = this.collectEnemyShots();
    if (!enemies.length) return;

    const player = this.getPlayer();
    for (const shot of enemies) {
      const { marker, position } = shot;
      if (marker.dead) continue;

      // Орудия крейсера — отдельная турель: стволы следят за игроком даже
      // вне дистанции огня, иначе к моменту выстрела они смотрели бы в сторону.
      if (marker.kind === EnemyKind.Cruiser) this.aimTurret(marker, position, player, dt);
      if (marker.kind === EnemyKind.Boss) {
        this.fireBoss(marker, position, player, dt);
        continue;
      }
      if (marker.kind === EnemyKind.Needle) {
        this.fireNeedle(marker, position, player, dt);
        continue;
      }
      if (marker.kind === EnemyKind.HiveMother) {
        this.fireHive(marker, position, player, dt);
        continue;
      }

      const weapon = TURRETS[marker.kind];
      if (!weapon) continue;

      const dist = Math.hypot(player.x - position.x, player.y - position.y) || 1;
      const range = marker.kind === EnemyKind.Cruiser
        ? Math.max(CRUISER_MANEUVER_RANGE, this.getZoneRadius() * CRUISER_FIRE_RANGE_R)
        : ENEMY_SHOOT_RANGE;
      if (dist >= range) {
        // Игрок вышел из дальности посреди очереди — очередь обрывается,
        // иначе marker.burstLeft застрял бы и заблокировал следующие залпы.
        if (marker.kind === EnemyKind.Fighter) {
          marker.fireGate = false;
          marker.burstLeft = 0;
          marker.burstTimer = 0;
        }
        continue;
      }

      const hitChance = enemyHitChance(this.wave, marker.kind);

      if (marker.kind === EnemyKind.Cruiser) {
        this.fireCruiserTurrets(shot, dt, player, weapon, hitChance);
      } else {
        this.fireFighterBurst(shot, dt, player, weapon, hitChance);
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

  /**
   * Босс: чередует круговой залп и прицельный тяжёлый выстрел.
   * Фаза 0/1/2 приходит из BossStrategy через marker.mode.
   */
  private fireBoss(
    e: EnemyComponent,
    position: PositionComponent,
    player: PlayerMotion,
    dt: number,
  ): void {
    const phase = Math.max(0, Math.min(2, Math.floor(e.mode)));
    const radialRate = BOSS_RADIAL_RATE[phase] ?? BOSS_RADIAL_RATE[0];
    const aimedRate = BOSS_AIMED_RATE[phase] ?? BOSS_AIMED_RATE[0];
    const radialCount = BOSS_RADIAL_COUNT[phase] ?? BOSS_RADIAL_COUNT[0];

    // Круговой залп: телеграф (arc) 0.35с, затем залп с поворотом рисунка.
    e.tCd1 = (e.tCd1 ?? 1.2) - dt;
    if (e.telegraphActive && e.telegraphType === "arc") {
      e.telegraphTimer -= dt;
      if (e.telegraphTimer <= 0) {
        e.telegraphActive = false;
        e.tCd1 = radialRate;
        e.lockAngle += BOSS_RADIAL_STEP;
        for (let i = 0; i < radialCount; i++) {
          const angle = e.lockAngle + (i / radialCount) * Math.PI * 2;
          this.spawnBolt({
            sx: position.x + Math.cos(angle) * BOSS_MUZZLE_OFFSET,
            sy: position.y + Math.sin(angle) * BOSS_MUZZLE_OFFSET,
            angle,
            boltDmg: e.boltDmg * 0.65,
            heavy: true,
            cruiser: false,
            boltSpeed: BOSS_RADIAL_SPEED + phase * 28,
          });
        }
        this.audio.playHeavyShoot();
      }
    } else if (e.tCd1 <= 0) {
      e.tCd1 = radialRate + 0.35;
      e.telegraphActive = true;
      e.telegraphTimer = 0.35;
      e.telegraphType = "arc";
      e.telegraphAngle = 0;
    }

    // Прицельный тяжёлый болт: наказывает стояние на месте.
    e.tCd2 = (e.tCd2 ?? 0.9) - dt;
    const inRange =
      Math.hypot(player.x - position.x, player.y - position.y) <
      this.getZoneRadius() * BOSS_AIMED_RANGE_R;
    if (e.tCd2 <= 0 && inRange) {
      e.tCd2 = aimedRate;
      const weapon: EnemyWeapon = {
        boltSpeed: BOSS_AIMED_SPEED + phase * 35,
        leadTime: 1.5,
        heavy: true,
      };
      this.fire(e, position.x, position.y, player, weapon, enemyHitChance(this.wave, e.kind));
      this.audio.playHeavyShoot();
    }
  }

  /**
   * Игла: выстрел по заявке AI после зарядки. Телеграф длиннее обычного —
   * игрок должен успеть сменить радиус облёта.
   */
  private fireNeedle(
    e: EnemyComponent,
    position: PositionComponent,
    player: PlayerMotion,
    dt: number,
  ): void {
    if (e.fireCd > 0) {
      e.fireCd = Math.max(0, e.fireCd - dt);
      return;
    }
    if (!e.fireGate) return;

    const dist = Math.hypot(player.x - position.x, player.y - position.y) || 1;
    if (dist > NEEDLE_RANGE) return;

    e.fireGate = false;
    e.fireCd = NEEDLE_FIRE_CD;

    const params = {
      sx: position.x,
      sy: position.y,
      target: { x: player.x, y: player.y, vx: player.vx, vy: player.vy, r: PLAYER_HIT_RADIUS },
      bulletSpeed: NEEDLE_BOLT_SPEED,
      maxFlightTime: 1.2,
    };
    const angle = aimAtTarget(
      params,
      enemyHitChance(this.wave, e.kind),
      PLAYER_HIT_RADIUS,
      this.rng,
    );

    e.telegraphActive = true;
    e.telegraphType = "line";
    e.telegraphTimer = NEEDLE_TELEGRAPH_TIME;
    e.telegraphAngle = angle;
    this.pendingShots.push({
      e,
      shot: {
        sx: position.x,
        sy: position.y,
        angle,
        boltDmg: e.boltDmg,
        heavy: false,
        cruiser: false,
        boltSpeed: NEEDLE_BOLT_SPEED,
      },
      timer: NEEDLE_TELEGRAPH_TIME,
      type: "line",
    });
    this.audio.playEnemyShoot();
  }

  /** Мать-улей: медленный тяжёлый болт по таймеру. */
  private fireHive(
    e: EnemyComponent,
    position: PositionComponent,
    player: PlayerMotion,
    dt: number,
  ): void {
    if (e.fireCd > 0) {
      e.fireCd = Math.max(0, e.fireCd - dt);
      return;
    }
    const dist = Math.hypot(player.x - position.x, player.y - position.y) || 1;
    if (dist >= ENEMY_SHOOT_RANGE) return;

    e.fireCd = HIVE_FIRE_CD;
    const weapon: EnemyWeapon = {
      boltSpeed: HIVE_BOLT_SPEED,
      leadTime: 1.2,
      heavy: false,
    };
    this.fire(e, position.x, position.y, player, weapon, enemyHitChance(this.wave, e.kind));
    this.audio.playHeavyShoot();
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
      e.tCd1! = rate + this.rng.range(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
      this.fire(e, position.x + fx + gx, position.y + fy + gy, player, weapon, hitChance);
      this.audio.playHeavyShoot();
    }

    // Правый ствол
    e.tCd2! -= dt;
    if (e.tCd2! <= 0) {
      e.tCd2! = rate + this.rng.range(-CRUISER_RATE_JITTER, CRUISER_RATE_JITTER);
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

  /** Очередь истребителя. */
  private fireFighterBurst(
    shot: EnemyShotRef,
    dt: number,
    player: PlayerMotion,
    weapon: EnemyWeapon,
    hitChance: number
  ): void {
    const { marker: e, position } = shot;

    if (e.kind !== EnemyKind.Fighter) return;

    // Пауза между очередями.
    if (e.fireCd > 0) {
      e.fireCd -= dt;
      // Пауза должна удерживать файтера вне стрельбы, даже если заявка висит.
      e.fireGate = false;
      if (e.fireCd <= 0) {
        e.fireCd = 0;
      }
      return;
    }

    // Если есть очередь — добиваем её по burstTimer.
    if (e.burstLeft > 0) {
      e.burstTimer -= dt;
      if (e.burstTimer <= 0) {
        e.burstTimer = FIGHTER_BURST_INTERVAL;
        e.burstLeft--;
        this.fire(e, position.x, position.y, player, weapon, hitChance, true);
        this.audio.playEnemyShoot();
        if (e.burstLeft > 0) return;
        // Очередь закончена — пауза между следующими залпами.
        e.fireGate = false;
        e.burstLeft = 0;
        e.burstAimOffset = null;
        e.fireCd = FIGHTER_BURST_COOLDOWN;
      }
      return;
    }

    // Ждёт заявки AI: он стреляет только в подтверждённое окно.
    if (!e.fireGate) return;
    e.fireGate = false;
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
    hitChance: number,
    burst = false,
  ): void {
    const params = {
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
    };

    let angle: number;
    if (burst) {
      // Один общий разброс на очередь: болты летят близко друг к другу,
      // но вся очередь может уйти в сторону, если игрок увернулся.
      if (e.burstAimOffset === null) {
        const dist = Math.hypot(player.x - sx, player.y - sy) || 1;
        const spread = spreadForChance(hitChance, dist, PLAYER_HIT_RADIUS);
        e.burstAimOffset = (this.rng.next() - 0.5) * 2 * spread;
      }
      const lead = solveLead(params);
      const base = lead ? lead.angle : Math.atan2(player.y - sy, player.x - sx);
      angle = base + e.burstAimOffset + (this.rng.next() - 0.5) * 2 * FIGHTER_BURST_DISPERSION;
    } else {
      angle = aimAtTarget(params, hitChance, PLAYER_HIT_RADIUS, this.rng);
    }

    const type: "line" | "cone" | "flash" | "arc" =
      e.kind === EnemyKind.Cruiser ? "cone" :
      e.kind === EnemyKind.Fighter ? "flash" :
      e.kind === EnemyKind.Hunter ? "line" : "line";
    e.telegraphActive = true;
    e.telegraphTimer = 0.35;
    e.telegraphAngle = angle;
    e.telegraphType = type;
    this.pendingShots.push({
      e,
      shot: {
        sx,
        sy,
        angle,
        boltDmg: e.boltDmg,
        heavy: weapon.heavy,
        cruiser: e.kind === EnemyKind.Cruiser,
        boltSpeed: weapon.boltSpeed,
      },
      timer: 0.35,
      type,
    });
  }
}

/* ---- Константы стрельбы ---- */

const CRUISER_TURRET_RATE = 2.6;
const CRUISER_RATE_WAVE_STEP = 0.04;
const CRUISER_RATE_JITTER = 0.15;
/** Скорость доворота орудийной турели крейсера к цели, рад/с. */
const CRUISER_TURRET_TURN_RATE = 3.2;
/** Вынос дульного среза вдоль оси наведения турели. */
const CRUISER_MUZZLE_FORWARD = 20;
/** Полуразнесение стволов поперёк оси наведения турели. */
const CRUISER_MUZZLE_GAP = 8;

/* ---- Босс ---- */
const BOSS_RADIAL_RATE = [3.0, 2.4, 1.8] as const;
const BOSS_AIMED_RATE = [2.2, 1.7, 1.2] as const;
const BOSS_RADIAL_COUNT = [12, 18, 24] as const;
const BOSS_RADIAL_STEP = 0.37;
const BOSS_MUZZLE_OFFSET = 48;
const BOSS_RADIAL_SPEED = 285;
const BOSS_AIMED_SPEED = 430;
const BOSS_AIMED_RANGE_R = 1.25;
