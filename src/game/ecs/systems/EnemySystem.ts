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
import { EnemyAI } from "../../ai/EnemyAI";
import { GameContext } from "../../ai/GameContext";
import { DroneSwarm } from "../../ai/DroneSwarm";
import { ThreatDirector } from "../../ai/ThreatDirector";
import { EnemyAvoidance, type IEnemyAvoidance } from "../../ai/EnemyAvoidance";
import { AsteroidAvoidance } from "../../ai/AsteroidAvoidance";
import type { EnemyDef } from "../../balance";
import { DEFAULT_PARAMS, type GameParams } from "../../balance/params/GameParams";
import {
    AFFIXES,
    ELITE_CHANCE,
    ELITE_PACK_INTERVAL,
    ELITE_SCORE_MULT,
    type AffixId,
} from "../../balance/affixes";
import {
    CARRIER_DRONE_ORBIT_GAP,
    ENEMY_MAX_DRONES,
    EnemyKind,
    MINE_LIFETIME,
    MINE_MAX_ALIVE,
    enemyDefFor,
    massForRadius
} from "../../balance";
import type { AsteroidRef, EnemyRef } from "..";
import { EnemyComponent } from "../components/EnemyComponent";
import { GameEntity } from "../GameEntity";
import type { Rng } from "../../core/rng";
import type { EnemySpawn } from "../spawn";
import { Phase, PhasedSystem } from "../SystemSchedule";
import { TAU } from "../../math";

/** Узкий порт домена врагов: только спавн и чтение живой связки. */
export interface EnemySpawnPort {
  addEnemy(enemy: EnemySpawn): void;
  enemyRefByEntity(entity: GameEntity): EnemyRef | null;
  /** Мгновенная гибель — истёкшая мина убирается без урона. */
  forceKillEnemy(enemy: EnemyRef): void;
  /** Лечение (регенерация элиты); не воскрешает мёртвых. */
  healEnemy(enemy: EnemyRef, amount: number): void;
}

/** Все доступные аффиксы в стабильном порядке. */
const AFFIX_IDS = Object.keys(AFFIXES) as AffixId[];

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
  /** Уклонение от быстрых астероидов (после AI-стратегий). */
  private readonly asteroidAvoidance = new AsteroidAvoidance();
  /** Координатор одновременно атакующих: жетоны атаки по классам. */
  private threatDirector = new ThreatDirector();
  /** Последний срез врагов — только для диагностики роя. */
  private lastEnemyRefs: EnemyRef[] = [];

  private wave = 1;
  /** Гарантированный элитный пак на текущей волне уже выдан. */
  private eliteSpawnedThisWave = false;

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
    /** Параметры мира: корпус и скорость врагов берутся из профиля. */
    private readonly getParams: () => GameParams = () => DEFAULT_PARAMS,
    /** Импульс игроку от гарпунёра. */
    private readonly pullPlayer?: (vx: number, vy: number) => void,
    /** Урон игроку от непрерывных атак (вихрь). */
    private readonly damagePlayer?: (dmg: number, source?: string) => void,
    /** Астероиды арены: тягач тянет камни, остальные враги от них уклоняются. */
    private readonly getAsteroids: () => AsteroidRef[] = () => [],
  ) {
    super(Phase.Enemies);
    this.ai = new EnemyAI();
    this.context = new GameContext();
  }

  /** Сброс волны (перед запуском забега). */
  reset(): void {
    this.wave = 1;
    this.eliteSpawnedThisWave = false;
    this.lastEnemyRefs = [];
    this.swarm.clear();
    this.threatDirector.reset();
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
    if (wave !== this.wave) this.eliteSpawnedThisWave = false;
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
      pullPlayer: this.pullPlayer,
      damagePlayer: this.damagePlayer,
    });

    // AI movement via strategy pattern (стратегии мутируют базовые компоненты).
    const enemyRefs = entities.map((e) => e.ref);
    this.lastEnemyRefs = enemyRefs;
    this.context.enemies = enemyRefs;
    this.context.asteroids = this.getAsteroids();
    this.context.swarm = this.swarm;
    this.context.rng = this.rng;
    // Жетоны атаки раздаются до AI pass: стратегии читают attackAllowed.
    this.threatDirector.update(enemyRefs, playerX, playerY, dt);
    this.swarm.update(enemyRefs, this.context, dt);
    this.ai.updateAI(enemyRefs, this.context, dt);

    // Apply velocity and update state
    for (let i = 0; i < entities.length; i++) {
      const { ref } = entities[i];
      const marker = ref.marker;
      if (marker.dead) continue;

      // Мина живёт ограниченное время: иначе старые мины копятся на арене.
      if (marker.kind === EnemyKind.Mine) {
        marker.modeT -= dt;
        if (marker.modeT <= 0) {
          this.ecs.forceKillEnemy(ref);
          continue;
        }
      }

      marker.flash = Math.max(0, marker.flash - dt * 5);
      marker.hitCd = Math.max(0, marker.hitCd - dt);

      // Регенерирующий аффикс: 2% максимального HP в секунду.
      const affixDef = marker.affix ? AFFIXES[marker.affix] : null;
      if (affixDef?.regenPercent) {
        this.ecs.healEnemy(ref, ref.life.max * affixDef.regenPercent * dt);
      }

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
      const drone = this.createEnemy(EnemyKind.Drone, spawn.x, spawn.y, droneDef, playerPos, null, 0, false);
      // Дроны Матери-улья не привязаны к носителю: иначе ближайший Carrier
      // забирал бы их на свою орбиту.
      const carrier = spawn.hive ? null : this.findCarrierForDrone(enemyRefs, spawn);
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

    // Постановка мин: не больше MINE_MAX_ALIVE одновременно на арене.
    if (this.context.mineSpawns.length > 0) {
      const aliveMines = enemyRefs.filter(
        (e) => !e.marker.dead && e.marker.kind === EnemyKind.Mine,
      ).length;
      let free = Math.max(0, MINE_MAX_ALIVE - aliveMines);
      for (const spawn of this.context.mineSpawns) {
        if (free <= 0) break;
        const def = this.getEnemyDef(EnemyKind.Mine);
        this.ecs.addEnemy(
          this.createEnemy(EnemyKind.Mine, spawn.x, spawn.y, def, playerPos, null, 0, false),
        );
        free--;
      }
    }

    // Расталкивание вынесено в сменный решатель (см. EnemyAvoidance).
    this.avoidance.solve(enemyRefs);
    // Уклонение от камней — после стратегий: тягач уже задал скорости
    // камням, а враги успевают отвернуть от запущенного.
    this.asteroidAvoidance.solve(enemyRefs, this.context.asteroids, dt);
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
    parent: EnemyRef | null = null,
    splitDepth = 0,
    eliteEligible = true,
  ): EnemySpawn {
    // Балансные множители применяются здесь — в единственной точке создания
    // врага. Так игрок, дроны и метрики видят одно и то же значение урона,
    // а астероиды и зона не затрагиваются.
    const hpMult = this.getHpMult();
    const damageMult = this.getDamageMult();
    const affix = eliteEligible ? this.rollEliteAffix(kind) : null;
    const affixDef = affix ? AFFIXES[affix] : null;
    const maxHp = def.hp * hpMult * (affixDef?.hpMult ?? 1);
    const shieldHp = maxHp * (affixDef?.shieldHpPercent ?? 0);
    const angle = kind === EnemyKind.Drone && playerPos
      ? Math.atan2(playerPos.y - y, playerPos.x - x)
      : this.rngSpawn.range(0, TAU);
    // Турель крейсера изначально наведена на игрока: корпус смотрит по курсу.
    const turretAngle =
      (kind === EnemyKind.Cruiser || kind === EnemyKind.Boss) && playerPos
        ? Math.atan2(playerPos.y - y, playerPos.x - x)
        : angle;
    const mass = massForRadius(def.r);
    const tStagger = this.rngSpawn.range(-0.5, 0.5);
    // Мина получает modeT как таймер жизни, минёр — паузу до первого захода.
    const freshModeT = kind === EnemyKind.Mine ? MINE_LIFETIME : 0;
    const initialOrbit = this.rngSpawn.range(0, TAU);
    const firstDive = kind === EnemyKind.Miner ? this.rngSpawn.range(3, 6) : 0;
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
      kind, affix, shieldHp, maxShieldHp: shieldHp,
      accuracyMult: affixDef?.accuracyMult ?? 1,
      x, y, vx: 0, vy: 0, angle, turretAngle,
      hp: maxHp, maxHp, r: def.r, speed: def.speed * (affixDef?.speedMult ?? 1),
      contact: def.contact * damageMult * (affixDef?.damageMult ?? 1),
      score: def.score * (affix ? ELITE_SCORE_MULT : 1),
      boltDmg: def.bolt * damageMult * (affixDef?.damageMult ?? 1),
      fireCd: this.rngSpawn.range(0.3, 1), mode: 0, modeT: freshModeT,
      strafeDir: this.rngSpawn.next() < 0.5 ? -1 : 1,
      seed: this.rngSpawn.next() * 100, spawnCd: this.rngSpawn.range(1, 2),
      flash: 0, hitCd: 0, dead: false,
      mass,
      tCd1: this.rngSpawn.range(0.3, 0.8) + tStagger,
      tCd2: this.rngSpawn.range(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned, burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : this.rngSpawn.range(6, 10),
      burstCd: 0.5, dodgeDir: 0, dodgeTimer: 0,
      droneState, orbitAngle: kind === EnemyKind.Miner ? initialOrbit : orbitAngle, orbitRadius,
      orbitTimer: carrierBurstActive ? 0 : this.rngSpawn.range(5, 8),
      waitTimer: firstDive,
      phaseDrones: 0,
      carrierChildren: 0,
      splitDepth,
      tetherActive: false,
    };
  }

  /**
   * Осколок Делителя: та же видовая стратегия, но меньше корпус, HP и
   * очки. Глубина 1 запрещает дальнейшее деление.
   */
  spawnChild(
    kind: EnemyKind,
    x: number,
    y: number,
    hpRatio: number,
    radiusRatio: number,
    splitDepth: number,
    playerPos?: { x: number; y: number },
  ): void {
    const base = this.getEnemyDef(kind);
    const def: EnemyDef = {
      ...base,
      hp: base.hp * hpRatio,
      r: base.r * radiusRatio,
      score: base.score * 0.35,
      contact: base.contact * 0.7,
      bolt: base.bolt * 0.7,
      speed: base.speed * 1.15,
    };
    this.ecs.addEnemy(this.createEnemy(kind, x, y, def, playerPos, null, splitDepth, false));
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

    const e = this.createEnemy(kind, spawnX, spawnY, def, playerPos, parent, 0, parent === null);
    this.ecs.addEnemy(e);
    if (parent) {
      parent.marker.spawnCd = 0;
    }
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    return enemyDefFor(kind, this.wave, this.getParams());
  }

  /**
   * Бросить элитный аффикс для нового врага.
   *
   * 8% на спавн; на волнах, кратных ELITE_PACK_INTERVAL, первый подходящий
   * враг гарантированно становится элитой. Боссы, мины и Мать-улья не
   * получают аффиксы: это уже событийные противники.
   */
  private rollEliteAffix(kind: EnemyKind): AffixId | null {
    if (
      kind === EnemyKind.Boss ||
      kind === EnemyKind.Mine ||
      kind === EnemyKind.HiveMother
    ) {
      return null;
    }
    const guaranteed =
      this.wave > 0 &&
      this.wave % ELITE_PACK_INTERVAL === 0 &&
      !this.eliteSpawnedThisWave;
    const roll = this.rngSpawn.next();
    if (!guaranteed && roll >= ELITE_CHANCE) return null;
    const index = Math.min(
      AFFIX_IDS.length - 1,
      Math.floor(this.rngSpawn.next() * AFFIX_IDS.length),
    );
    this.eliteSpawnedThisWave = true;
    return AFFIX_IDS[index]!;
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
