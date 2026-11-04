/**
 * EnemySystem — ECS-система AI, движения и состояния врагов.
 *
 * Враги — ECS-сущности с компонентом EnemyComponent, который является
 * ЕДИНСТВЕННЫМ источником правды (позиция/скорость/здоровье/радиус/вид и
 * всё AI-состояние). Система фильтрует сущности по аспекту, обновляет
 * AI-стратегии, интегрирует скорость (если физика не делает это сама),
 * обрабатывает спавн дронов носителем и мягкое избегание столкновений.
 * Стрельба вынесена в EnemyShootingSystem.
 *
 * Порядок определяется приоритетом системы: движение (0) раньше стрельбы.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { EnemyAI } from "../ai/EnemyAI";
import { GameContext } from "../ai/GameContext";
import { DroneSwarm } from "../ai/DroneSwarm";
import { EnemyAvoidance, type IEnemyAvoidance } from "../ai/EnemyAvoidance";
import type { EnemyDef } from "../balance";
import {
    CARRIER_DRONE_ORBIT_GAP,
    ENEMY_MAX_DRONES,
    EnemyKind,
    enemyDefFor,
    massForRadius
} from "../balance";
import type { EnemyRef } from "../ecs";
import { EnemyComponent } from "../ecs/components/EnemyComponent";
import { GameEntity } from "../ecs/GameEntity";
import type { Rng } from "../core/rng";
import type { EnemySpawn } from "../ecs/spawn";
import { Phase, PhasedSystem } from "../ecs/SystemSchedule";
import { TAU } from "../math";

/** Узкий порт домена врагов: только спавн и чтение живой связки. */
export interface EnemySpawnPort {
  addEnemy(enemy: EnemySpawn): void;
  enemyRefByEntity(entity: GameEntity): EnemyRef | null;
}

/**
 * Источник состояния игрока для AI: мировые координаты, скорость и угловая
 * скорость курса (для прогноза по дуге).
 */
export type EnemyPlayerSource = () => {
  x: number;
  y: number;
  vx?: number;
  vy?: number;
  turnRate?: number;
};
/** Источник границ игровой зоны. */
export type ZoneBoundsSource = () => { x: number; y: number; radius: number; active: boolean; targetRadius: number };
/** Флаг: должна ли система сама интегрировать скорость (true в custom-режиме). */
export type IntegrateSource = () => boolean;

export class EnemySystem extends PhasedSystem {
  private aspect: Aspect | null = null;
  private ai: EnemyAI;
  private context: GameContext;
  private swarm = new DroneSwarm();
  /** Последний срез врагов — только для диагностики роя. */
  private lastEnemyRefs: EnemyRef[] = [];

  private wave = 1;

  constructor(
    private readonly ecs: EnemySpawnPort,
    private readonly getPlayer: EnemyPlayerSource,
    private readonly getZoneBounds: ZoneBoundsSource,
    private readonly getIntegrate: IntegrateSource,
    /** Поток боевых бросков: орбиты и таймеры во время боя. */
    private readonly rng: Rng,
    /** Поток спавна: страйф, seed врага, стартовые таймеры. */
    private readonly rngSpawn: Rng,
    private readonly avoidance: IEnemyAvoidance = new EnemyAvoidance(),
    /** Множитель здоровья врагов из `BalanceOverrides`. */
    private readonly getHpMult: () => number = () => 1,
    /** Множитель урона врагов (болты и контакт) из `BalanceOverrides`. */
    private readonly getDamageMult: () => number = () => 1,
  ) {
    super(Phase.Enemies);
    this.ai = new EnemyAI();
    this.context = new GameContext();
  }

  /** Сброс волны (перед запуском забега). */
  reset(): void {
    this.wave = 1;
    this.lastEnemyRefs = [];
    this.swarm.clear();
  }

  /** Диагностика: число групп роя. */
  get swarmGroups(): number {
    return this.swarm.groupCount;
  }

  /** Диагностика: направления групп. */
  get swarmDirections(): string {
    return this.swarm.directions;
  }

  /** Диагностика: сколько дронов сейчас отделилось на атаку. */
  get swarmDetached(): number {
    return this.swarm.detachedCount(this.lastEnemyRefs);
  }

  /** Установить номер волны (влияет на defs и сложность). */
  setWave(wave: number): void {
    this.wave = wave;
  }

  onAddedToEngine(engine: Engine): void {
    this.aspect = Aspect.for(engine).all(EnemyComponent);
  }

  process(dt: number): void {
    const entities = this.collectEnemyEntities();
    if (!entities.length) return;

    const playerPos = this.getPlayer();
    const zoneBounds = this.getZoneBounds();
    const integratePosition = this.getIntegrate();

    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = playerPos.vx || 0;
    const playerVy = playerPos.vy || 0;
    const zoneX = zoneBounds?.x ?? 0;
    const zoneY = zoneBounds?.y ?? 0;
    const zoneRadius = zoneBounds?.radius ?? 0;
    const zoneActive = zoneBounds?.active ?? false;
    const playerOutsideZone =
      zoneActive &&
      zoneRadius > 0 &&
      Math.hypot(playerX - zoneX, playerY - zoneY) > zoneRadius;

    // Sync game context for strategies
    this.context.sync({
      playerX, playerY, playerVx, playerVy,
      playerTurnRate: playerPos.turnRate ?? 0,
      zoneX, zoneY, zoneRadius,
      playerOutsideZone,
      wave: this.wave,
    });

    // AI movement via strategy pattern (стратегии мутируют базовые компоненты).
    const enemyRefs = entities.map((e) => e.ref);
    this.lastEnemyRefs = enemyRefs;
    this.context.enemies = enemyRefs;
    this.context.swarm = this.swarm;
    this.context.rng = this.rng;
    this.swarm.update(enemyRefs, this.context, dt);
    this.ai.updateAI(enemyRefs, this.context, dt);

    // Apply velocity and update state
    for (let i = 0; i < entities.length; i++) {
      const { ref } = entities[i];
      const marker = ref.marker;
      if (marker.dead) continue;

      marker.flash = Math.max(0, marker.flash - dt * 5);
      marker.hitCd = Math.max(0, marker.hitCd - dt);

      // skip velocity apply for orbiting drones — they control their own position
      if (marker.droneState === "orbiting") continue;

      // apply velocity
      // В режиме Planck позицию интегрирует физический движок.
      if (integratePosition) {
        ref.position.x += ref.velocity.vx * dt;
        ref.position.y += ref.velocity.vy * dt;
      }
    }

    // processing carrier drone spawns
    const carrierSpawns = this.context.carrierSpawns || [];
    let orbitSpawnIndex = 0;
    for (const spawn of carrierSpawns) {
      const droneDef = this.getEnemyDef(EnemyKind.Drone);
      const drone = this.createEnemy(EnemyKind.Drone, spawn.x, spawn.y, droneDef, playerPos, null);
      // Set parent to carrier for proper tracking
      const carrier = this.findCarrierForDrone(enemyRefs, spawn);
      if (carrier) {
        drone.parentId = carrier.marker.ecsId ?? null;
        // Дрон начинается на орбите вокруг Carrier
        drone.droneState = "orbiting";
        drone.orbitRadius = carrier.radius.r + CARRIER_DRONE_ORBIT_GAP;
        // Равномерные орбитальные слоты: дроны не рождаются в одной точке
        // и не перекрывают друг друга на орбите.
        const occupied = this.countOrbitingChildren(enemyRefs, carrier.marker.ecsId);
        const slot = occupied + orbitSpawnIndex;
        drone.orbitAngle = (slot * TAU) / ENEMY_MAX_DRONES + this.rng.range(-0.06, 0.06);
        // Половина роя летит по часовой, половина — против часовой.
        drone.strafeDir = this.rng.next() < 0.5 ? 1 : -1;
        orbitSpawnIndex++;
      }
      this.ecs.addEnemy(drone);
    }

    // Расталкивание вынесено в сменный решатель (см. EnemyAvoidance).
    this.avoidance.solve(enemyRefs);
  }

  /** Собрать сущности с EnemyComponent. */
  private collectEnemyEntities(): Array<{ entity: GameEntity; ref: EnemyRef }> {
    if (!this.aspect) return [];
    const result: Array<{ entity: GameEntity; ref: EnemyRef }> = [];
    for (const entity of [...this.aspect.entities]) {
      const ref = this.ecs.enemyRefByEntity(entity);
      if (ref) result.push({ entity, ref });
    }
    return result;
  }

  /** Factory для создания врага с общими полями */
  private createEnemy(
    kind: EnemyKind, x: number, y: number, def: EnemyDef,
    playerPos?: { x: number; y: number },
    parent: EnemyRef | null = null
  ): EnemySpawn {
    // Балансные множители применяются здесь — в единственной точке создания
    // врага. Так игрок, дроны и метрики видят одно и то же значение урона,
    // а астероиды и зона не затрагиваются.
    const hpMult = this.getHpMult();
    const damageMult = this.getDamageMult();
    const angle = kind === EnemyKind.Drone && playerPos
      ? Math.atan2(playerPos.y - y, playerPos.x - x)
      : this.rngSpawn.range(0, TAU);
    // Турель крейсера изначально наведена на игрока: корпус смотрит по курсу.
    const turretAngle = kind === EnemyKind.Cruiser && playerPos
      ? Math.atan2(playerPos.y - y, playerPos.x - x)
      : angle;
    const mass = massForRadius(def.r);
    const tStagger = this.rngSpawn.range(-0.5, 0.5);
    const carrierBurstActive = this.rngSpawn.next() < 0.5;
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;

    // Инициализация полей орбиты: только для дронов Carrier
    let droneState: "orbiting" | "attacking" | "none" = "none";
    const orbitAngle = this.rngSpawn.range(0, TAU);
    let orbitRadius = 0; // 0 = без орбиты

    if (kind === EnemyKind.Drone && parent) {
      droneState = "orbiting";
      orbitRadius = parent.radius.r + CARRIER_DRONE_ORBIT_GAP;
    }

    return {
      parentId: parent?.marker.ecsId ?? null,
      kind, x, y, vx: 0, vy: 0, angle, turretAngle,
      hp: def.hp * hpMult, maxHp: def.hp * hpMult, r: def.r, speed: def.speed,
      contact: def.contact * damageMult, score: def.score, boltDmg: def.bolt * damageMult,
      fireCd: this.rngSpawn.range(0.3, 1), mode: 0, modeT: 0,
      strafeDir: this.rngSpawn.next() < 0.5 ? -1 : 1,
      seed: this.rngSpawn.next() * 100, spawnCd: this.rngSpawn.range(1, 2),
      flash: 0, hitCd: 0, dead: false,
      mass,
      tCd1: this.rngSpawn.range(0.3, 0.8) + tStagger,
      tCd2: this.rngSpawn.range(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned, burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : this.rngSpawn.range(6, 10),
      burstCd: 0.5, dodgeDir: 0, dodgeTimer: 0,
      droneState, orbitAngle, orbitRadius,
      orbitTimer: carrierBurstActive ? 0 : this.rngSpawn.range(5, 8),
      waitTimer: 0,
      phaseDrones: 0,
      carrierChildren: 0,
    };
  }

  spawn(kind: EnemyKind, x: number, y: number, parent: EnemyRef | null, playerPos?: { x: number; y: number }): void {
    const def = this.getEnemyDef(kind);
    let spawnX = x;
    let spawnY = y;

    // Если дрон спавнится от Carrier — размещаем на орбите
    if (kind === EnemyKind.Drone && parent && parent.marker.kind === EnemyKind.Carrier) {
      const orbitAngle = this.rngSpawn.next() * TAU;
      const orbitRadius = parent.radius.r + CARRIER_DRONE_ORBIT_GAP;
      spawnX = parent.position.x + Math.cos(orbitAngle) * orbitRadius;
      spawnY = parent.position.y + Math.sin(orbitAngle) * orbitRadius;
    }

    const e = this.createEnemy(kind, spawnX, spawnY, def, playerPos, parent);
    this.ecs.addEnemy(e);
    if (parent) {
      parent.marker.spawnCd = 0;
    }
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    return enemyDefFor(kind, this.wave);
  }

  /** Сколько живых дронов уже висит на орбите указанного носителя. */
  private countOrbitingChildren(enemies: EnemyRef[], parentId: number | string): number {
    let count = 0;
    for (const e of enemies) {
      if (
        !e.marker.dead &&
        e.marker.droneState === "orbiting" &&
        e.marker.parentId === parentId
      ) {
        count++;
      }
    }
    return count;
  }

  /** Найти ближайшего живого Carrier для дрона */
  private findCarrierForDrone(enemies: EnemyRef[], spawnPos: { x: number; y: number }): EnemyRef | null {
    let closest: EnemyRef | null = null;
    let closestDist = Infinity;
    for (const e of enemies) {
      if (e.marker.kind !== EnemyKind.Carrier || e.marker.dead) continue;
      const d = Math.hypot(e.position.x - spawnPos.x, e.position.y - spawnPos.y);
      if (d < closestDist) {
        closestDist = d;
        closest = e;
      }
    }
    return closest;
  }
}
