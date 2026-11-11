/**
 * EnemyDomain — жизненный цикл врагов.
 *
 * Владеет спавном через EnemySystem, чтением живых связок компонентов,
 * поиском по id и единственным путём урона/смерти (EnemyLifecycle).
 * Наружу отдаёт только EnemyRef и узкие операции — без доступа к чужим
 * типам сущностей.
 */

import {
  EnemyKind,
  SPLITTER_CHILD_COUNT,
  SPLITTER_CHILD_HP_RATIO,
  SPLITTER_CHILD_MAX_DEPTH,
  SPLITTER_CHILD_RADIUS_RATIO,
  SHIELDBEARER_AURA_RADIUS,
  SHIELDBEARER_DAMAGE_MULT,
} from "../../balance";
import { VOLATILE_DAMAGE_MULT, VOLATILE_RADIUS } from "../../balance/affixes";
import type { EventBus } from "../../core/EventBus";
import type { Rng } from "../../core/rng";
import type { AudioPort } from "../../core/WorldPorts";
import {
    EnemyShootingSystem,
    type CombatActiveSource,
    type PlayerMotionSource,
} from "../../systems/EnemyShootingSystem";
import {
    EnemySystem,
    type EnemyPlayerSource,
    type IntegrateSource,
    type ZoneBoundsSource,
} from "../../systems/EnemySystem";
import type { EcsEngine } from "../EcsEngine";
import { EnemyLifecycle } from "../EnemyLifecycle";
import { GameEntity } from "../GameEntity";
import type { PhasedSystem } from "../SystemSchedule";
import { EnemyComponent } from "../components/EnemyComponent";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import type { EnemyRef } from "../refs";
import type { EnemySpawn } from "../spawn";

/** Колбэк спавна вражеского снаряда (реализуется доменом пуль). */
export type EnemyShotSink = (
  x: number,
  y: number,
  vx: number,
  vy: number,
  dmg: number,
  heavy: boolean,
  cruiser: boolean,
) => void;

/** Колбэки кадрового состояния, от которых зависят вражеские системы. */
export interface EnemySystemDeps {
  getPlayer: EnemyPlayerSource;
  getZoneBounds: ZoneBoundsSource;
  getIntegrate: IntegrateSource;
  getPlayerMotion: PlayerMotionSource;
  isCombatActive: CombatActiveSource;
  audio: AudioPort;
  /** Поток боевых бросков (разброс, таймеры, орбиты). */
  rngCombat: Rng;
  /** Поток спавна (seed врага, страйф, стартовые таймеры). */
  rngSpawn: Rng;
  /** Множитель здоровья врагов. */
  getEnemyHpMult: () => number;
  /** Множитель урона врагов. */
  getEnemyDamageMult: () => number;
  /** Импульс игроку от гарпуна. */
  pullPlayer?: (vx: number, vy: number) => void;
  /** Урон игроку от непрерывных атак. */
  damagePlayer?: (dmg: number, source?: string) => void;
  /** Зона глушилки: магнит пикапов отключён. */
  isPickupMagnetDisabled?: (x: number, y: number) => boolean;
}

export class EnemyDomain {
  /** ECS-системы врагов в порядке регистрации: AI/движение, затем стрельба. */
  readonly systems: readonly PhasedSystem[];
  private readonly enemySystem: EnemySystem;
  private readonly lifecycle: EnemyLifecycle;
  /** Стабильная объектная идентичность связок: физика/коллизии/зоны/AI. */
  private readonly refCache = new WeakMap<GameEntity, EnemyRef>();

  /** Диагностика роя дронов: число групп и отделившихся. */
  get swarmGroups(): number {
    return this.enemySystem.swarmGroups;
  }

  get swarmDetached(): number {
    return this.enemySystem.swarmDetached;
  }

  get swarmDirections(): string {
    return this.enemySystem.swarmDirections;
  }

  constructor(
    private readonly ecs: EcsEngine,
    eventBus: EventBus,
    private readonly deps: EnemySystemDeps,
    spawnShot: EnemyShotSink,
  ) {
    this.lifecycle = new EnemyLifecycle(
      eventBus,
      (enemy) => this.damageTakenMultiplier(enemy),
      (enemy) => this.handleEnemyDeath(enemy),
    );
    this.enemySystem = new EnemySystem(
      this,
      deps.getPlayer,
      deps.getZoneBounds,
      deps.getIntegrate,
      deps.rngCombat,
      deps.rngSpawn,
      undefined,
      deps.getEnemyHpMult,
      deps.getEnemyDamageMult,
      deps.pullPlayer,
      deps.damagePlayer,
    );
    const shootingSystem = new EnemyShootingSystem(
      deps.audio,
      deps.getPlayerMotion,
      deps.isCombatActive,
      (shot) => spawnShot(
        shot.sx + Math.cos(shot.angle) * 14,
        shot.sy + Math.sin(shot.angle) * 14,
        Math.cos(shot.angle) * shot.boltSpeed,
        Math.sin(shot.angle) * shot.boltSpeed,
        shot.boltDmg,
        shot.heavy,
        shot.cruiser,
      ),
      () => deps.getZoneBounds().radius,
      deps.rngCombat,
    );
    this.systems = [this.enemySystem, shootingSystem];
  }

  /** Зарегистрировать врага как ECS-сущность из чистых данных. */
  addEnemy(enemy: EnemySpawn): void {
    const entity = new GameEntity();
    entity.components.add(new PositionComponent(enemy.x, enemy.y));
    entity.components.add(new VelocityComponent(enemy.vx, enemy.vy));
    entity.components.add(new RadiusComponent(enemy.r));
    entity.components.add(new LifeComponent(enemy.hp, enemy.maxHp));
    entity.components.add(new EnemyComponent({
      ecsId: entity.id,
      parentId: enemy.parentId ?? null,
      kind: enemy.kind,
      affix: enemy.affix,
      shieldHp: enemy.shieldHp,
      maxShieldHp: enemy.maxShieldHp,
      accuracyMult: enemy.accuracyMult,
      angle: enemy.angle,
      turretAngle: enemy.turretAngle,
      speed: enemy.speed,
      contact: enemy.contact,
      score: enemy.score,
      boltDmg: enemy.boltDmg,
      fireCd: enemy.fireCd,
      mode: enemy.mode,
      modeT: enemy.modeT,
      strafeDir: enemy.strafeDir,
      seed: enemy.seed,
      spawnCd: enemy.spawnCd,
      flash: enemy.flash,
      hitCd: enemy.hitCd,
      dead: enemy.dead,
      mass: enemy.mass,
      dodgeDir: enemy.dodgeDir,
      dodgeTimer: enemy.dodgeTimer,
      burstSpawned: enemy.burstSpawned,
      burstActive: enemy.burstActive,
      burstRestT: enemy.burstRestT,
      burstCd: enemy.burstCd,
      tCd1: enemy.tCd1,
      tCd2: enemy.tCd2,
      droneState: enemy.droneState,
      orbitAngle: enemy.orbitAngle,
      orbitRadius: enemy.orbitRadius,
      orbitTimer: enemy.orbitTimer,
      waitTimer: enemy.waitTimer,
      phaseDrones: enemy.phaseDrones,
      carrierChildren: enemy.carrierChildren,
      splitDepth: enemy.splitDepth,
      tetherActive: enemy.tetherActive,
    }));
    this.ecs.add(entity);
  }

  /** Живые связки компонентов всех врагов. */
  enemies(out: EnemyRef[] = []): EnemyRef[] {
    out.length = 0;
    for (const entity of this.ecs.entitiesWith(EnemyComponent)) {
      const ref = this.refOf(entity);
      if (ref) out.push(ref);
    }
    return out;
  }

  /** Найти врага по EntityRef-идентификатору (O(1) через EntityCollection). */
  enemyById(id: number | string | null): EnemyRef | null {
    if (id === null) return null;
    const entity = this.ecs.getEntity(id);
    return entity ? this.refOf(entity) : null;
  }

  /** Живая связка компонентов врага по сущности (или null). */
  enemyRefByEntity(entity: GameEntity): EnemyRef | null {
    return this.refOf(entity);
  }

  /** Заспавнить врага через вражескую AI-систему. */
  spawnEnemy(
    kind: EnemyKind,
    x: number,
    y: number,
    parent: EnemyRef | null,
    playerPos?: { x: number; y: number },
  ): void {
    this.enemySystem.spawn(kind, x, y, parent, playerPos);
  }

  /** Нанести урон; true — враг погиб от этого удара. */
  damageEnemy(id: number | string, dmg: number): boolean {
    const ref = this.enemyById(id);
    return ref ? this.lifecycle.damageEnemy(ref, dmg) : false;
  }

  /** Мгновенная гибель без расчёта урона. */
  forceKillEnemy(enemy: EnemyRef): void {
    this.lifecycle.forceKill(enemy);
  }

  /** Лечение врага (регенерация/вампиризм). */
  healEnemy(enemy: EnemyRef, amount: number): void {
    this.lifecycle.healEnemy(enemy, amount);
  }

  /** Лечение по EntityRef-идентификатору (из систем столкновений). */
  healEnemyById(id: number | string, amount: number): void {
    const ref = this.enemyById(id);
    if (ref) this.lifecycle.healEnemy(ref, amount);
  }

  /** Сброс состояния врагов перед запуском забега. */
  resetWave(): void {
    this.enemySystem.reset();
  }

  /** Установить номер волны врагов. */
  setWave(wave: number): void {
    this.enemySystem.setWave(wave);
  }

  /** Удалить всех врагов. */
  clear(): void {
    for (const entity of [...this.ecs.entitiesWith(EnemyComponent)]) {
      this.ecs.remove(entity);
    }
  }

  /**
   * Аура Щитоносца: союзники в радиусе получают 60% урона.
   * Ауры не складываются — важен сам факт наличия щитоносца рядом.
   */
  private damageTakenMultiplier(enemy: EnemyRef): number {
    if (enemy.marker.kind === EnemyKind.Shieldbearer) return 1;
    for (const ally of this.enemies()) {
      if (ally.marker.dead || ally.marker.kind !== EnemyKind.Shieldbearer) continue;
      const dist = Math.hypot(
        ally.position.x - enemy.position.x,
        ally.position.y - enemy.position.y,
      );
      if (dist <= SHIELDBEARER_AURA_RADIUS) return SHIELDBEARER_DAMAGE_MULT;
    }
    return 1;
  }

  /** Побочные эффекты смерти: взрыв Летучего и деление Делителя/элиты. */
  private handleEnemyDeath(enemy: EnemyRef): void {
    const player = this.deps.getPlayer();

    if (enemy.marker.affix === "volatile") {
      const dist = Math.hypot(
        player.x - enemy.position.x,
        player.y - enemy.position.y,
      );
      if (dist <= VOLATILE_RADIUS) {
        this.deps.damagePlayer?.(
          enemy.marker.contact * VOLATILE_DAMAGE_MULT,
          "volatile",
        );
      }
    }

    const splits =
      enemy.marker.affix === "splitting" ||
      enemy.marker.kind === EnemyKind.Splitter;
    if (!splits || enemy.marker.splitDepth >= SPLITTER_CHILD_MAX_DEPTH) return;

    const baseAngle = enemy.marker.seed;
    const childDepth = enemy.marker.splitDepth + 1;
    for (let i = 0; i < SPLITTER_CHILD_COUNT; i++) {
      const angle = baseAngle + (i / SPLITTER_CHILD_COUNT) * Math.PI * 2;
      this.enemySystem.spawnChild(
        enemy.marker.kind,
        enemy.position.x + Math.cos(angle) * 10,
        enemy.position.y + Math.sin(angle) * 10,
        SPLITTER_CHILD_HP_RATIO,
        SPLITTER_CHILD_RADIUS_RATIO,
        childDepth,
        { x: player.x, y: player.y },
      );
    }
  }

  private refOf(entity: GameEntity): EnemyRef | null {
    const cached = this.refCache.get(entity);
    if (cached) return cached;
    const marker = entity.components.get(EnemyComponent);
    if (!marker) return null;
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!position || !velocity || !radius || !life) return null;
    const ref: EnemyRef = { entity, marker, position, velocity, radius, life };
    this.refCache.set(entity, ref);
    return ref;
  }
}
