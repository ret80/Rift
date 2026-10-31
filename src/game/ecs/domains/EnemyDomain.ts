/**
 * EnemyDomain — жизненный цикл врагов.
 *
 * Владеет спавном через EnemySystem, чтением живых связок компонентов,
 * поиском по id и единственным путём урона/смерти (EnemyLifecycle).
 * Наружу отдаёт только EnemyRef и узкие операции — без доступа к чужим
 * типам сущностей.
 */

import type { PhasedSystem } from "../SystemSchedule";
import type { EventBus } from "../../core/EventBus";
import type { AudioManager } from "../../systems/AudioManager";
import type { EnemyKind } from "../../balance";
import type { EnemySpawn } from "../spawn";
import type { EcsEngine } from "../EcsEngine";
import { EnemyLifecycle } from "../EnemyLifecycle";
import { GameEntity } from "../GameEntity";
import { EnemyComponent } from "../components/EnemyComponent";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { RadiusComponent } from "../components/RadiusComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import {
  EnemySystem,
  type EnemyPlayerSource,
  type IntegrateSource,
  type ZoneBoundsSource,
} from "../../systems/EnemySystem";
import {
  EnemyShootingSystem,
  type CombatActiveSource,
  type PlayerMotionSource,
} from "../../systems/EnemyShootingSystem";
import type { EnemyRef } from "../refs";

/** Колбэк спавна вражеского снаряда (реализуется доменом пуль). */
export type EnemyShotSink = (
  x: number,
  y: number,
  vx: number,
  vy: number,
  life: number,
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
  audio: AudioManager;
}

export class EnemyDomain {
  /** ECS-системы врагов в порядке регистрации: AI/движение, затем стрельба. */
  readonly systems: readonly PhasedSystem[];
  private readonly enemySystem: EnemySystem;
  private readonly lifecycle: EnemyLifecycle;
  /** Стабильная объектная идентичность связок: физика/коллизии/зоны/AI. */
  private readonly refCache = new WeakMap<GameEntity, EnemyRef>();

  constructor(
    private readonly ecs: EcsEngine,
    eventBus: EventBus,
    deps: EnemySystemDeps,
    spawnShot: EnemyShotSink,
  ) {
    this.lifecycle = new EnemyLifecycle(eventBus);
    this.enemySystem = new EnemySystem(this, deps.getPlayer, deps.getZoneBounds, deps.getIntegrate);
    const shootingSystem = new EnemyShootingSystem(
      deps.audio,
      deps.getPlayerMotion,
      deps.isCombatActive,
      (shot) => spawnShot(
        shot.sx + Math.cos(shot.angle) * 14,
        shot.sy + Math.sin(shot.angle) * 14,
        Math.cos(shot.angle) * shot.boltSpeed,
        Math.sin(shot.angle) * shot.boltSpeed,
        shot.boltLife,
        shot.boltDmg,
        shot.heavy,
        shot.cruiser,
      ),
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
      angle: enemy.angle,
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
      dodgeWeight: enemy.dodgeWeight,
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
