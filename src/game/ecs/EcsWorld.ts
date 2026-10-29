/**
 * EcsWorld — обёртка над ECS-движком @trixt0r/ecs для игрового мира.
 *
 * Инкапсулирует Engine, фабрику сущностей и набор ECS-систем, а также
 * предоставляет производный API для пикапов и врагов: спавн/чтение списка.
 * Остальной код игры работает с миром через этот интерфейс, пока
 * остальные домены (пули, дроны, игрок) переводятся на ECS.
 */

import { Engine, type Component, type ComponentClass } from "@trixt0r/ecs";
import { PickupKind, EnemyKind } from "../balance";
import type { EventBus } from "../core/EventBus";
import type { Enemy, Bullet, EBullet, LaserBeam, Particle, Ring, Rift, Pickup } from "../types";
import type { AudioManager } from "../systems/AudioManager";
import type { PlayerState } from "../systems/PlayerState";
import { createPlayerState } from "../systems/PlayerState";
import { PickupKindComponent } from "./components/PickupKindComponent";
import { AsteroidComponent } from "./components/AsteroidComponent";
import { PositionComponent } from "./components/PositionComponent";
import { VelocityComponent } from "./components/VelocityComponent";
import { RadiusComponent } from "./components/RadiusComponent";
import { LifeComponent } from "./components/LifeComponent";
import { HomingRef } from "./components/HomingRef";
import { ParticleComponent } from "./components/ParticleComponent";
import { RingComponent } from "./components/RingComponent";
import { BulletSweepComponent } from "./components/BulletSweepComponent";
import { EnemyComponent } from "./components/EnemyComponent";
import { BulletComponent } from "./components/BulletComponent";
import { EnemyBulletComponent } from "./components/EnemyBulletComponent";
import { AllyDroneComponent } from "./components/AllyDroneComponent";
import { LaserBeamComponent } from "./components/LaserBeamComponent";
import { PlayerComponent } from "./components/PlayerComponent";
import { RiftComponent } from "./components/RiftComponent";
import { GameEntity } from "./GameEntity";
import type { PhysicsBodyDef, PhysicsEntity } from "../physics/IPhysics";
import { PLAYER_HITBOX_RADIUS } from "../balance/player";
import { PickupMovementSystem } from "./systems/PickupMovementSystem";
import { PickupCollectionSystem } from "./systems/PickupCollectionSystem";
import { ParticleSystem } from "./systems/ParticleSystem";
import { RingSystem } from "./systems/RingSystem";
import { BeamSystem } from "./systems/BeamSystem";
import { BulletSystem } from "../systems/BulletSystem";
import {
  EnemySystem,
  type EnemyPlayerSource,
  type ZoneBoundsSource,
  type IntegrateSource,
} from "../systems/EnemySystem";
import {
  EnemyShootingSystem,
  type PlayerMotionSource,
  type CombatActiveSource,
} from "../systems/EnemyShootingSystem";
import { ZoneClampSystem } from "./systems/ZoneClampSystem";

/** Источник позиции игрока (хитбокс) для систем пикапов. */
export type PlayerSource = () => { x: number; y: number; r: number };

/** Колбэки кадрового состояния, от которых зависят вражеские системы. */
export interface EnemySystemDeps {
  getPlayer: EnemyPlayerSource;
  getZoneBounds: ZoneBoundsSource;
  getIntegrate: IntegrateSource;
  getPlayerMotion: PlayerMotionSource;
  isCombatActive: CombatActiveSource;
  audio: AudioManager;
}

/** Детерминированный seed (0..1) из id сущности для визуальных вариаций. */
function seedForId(id: number | string): number {
  if (typeof id === "number") {
    // Простой линейный конгруэнтный шаг в диапазон (0,1) — стабилен для id.
    return ((id * 2654435761) % 1000) / 1000;
  }
  let h = 0;
  for (let i = 0; i < id.length; i++) {
    h = (h * 31 + id.charCodeAt(i)) | 0;
  }
  // Оборачиваем отрицательные значения hash в (0,1).
  return ((Math.abs(h) * 2654435761) % 1000) / 1000;
}

/**
 * Живая связка компонентов астероида. Читатели работают с базовыми
 * компонентами напрямую (компонентные запросы), без DTO-копирования.
 */
export interface AsteroidRef {
  entity: GameEntity;
  marker: AsteroidComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/**
 * Живая связка компонентов дрона-компаньона. Читатели работают с базовыми
 * компонентами напрямую (компонентные запросы), без DTO-копирования.
 * Дрон не имеет собственной скорости — орбита задаётся системой кинематически,
 * поэтому VelocityComponent не входит (как и раньше).
 */
export interface DroneRef {
  entity: GameEntity;
  marker: AllyDroneComponent;
  position: PositionComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Живая связка компонентов игрока (Singleton-сущность). Читатели работают с
 *  базовыми компонентами напрямую (компонентные запросы), без DTO-копирования.
 *  Скорость/позиция/радиус/запас прочности — в базовых; домен (angle/invuln/
 *  thrusting/mass) — в PlayerComponent. */
export interface PlayerRef {
  entity: GameEntity;
  marker: PlayerComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Живая связка компонентов врага. Читатели работают с базовыми
 *  компонентами напрямую (компонентные запросы), без DTO-копирования.
 *  Позиция/скорость/радиус/запас прочности — в базовых; домен (вид, AI,
 *  бой, идентичность) — в EnemyComponent. */
export interface EnemyRef {
  entity: GameEntity;
  marker: EnemyComponent;
  position: PositionComponent;
  velocity: VelocityComponent;
  radius: RadiusComponent;
  life: LifeComponent;
}

/** Данные для спавна астероида (раскладываются по базовым+доменным компонентам). */
export type AsteroidSpawn = Partial<Omit<AsteroidComponent, "type" | "id">> & {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
};

/** Данные для спавна дрона-компаньона (раскладываются по базовым+доменным компонентам). */
export type AllyDroneSpawn = Partial<Omit<AllyDroneComponent, "type" | "id">> & {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
};

export class EcsWorld {
  readonly engine = new Engine<GameEntity>();

  /** Внутренние ссылки на вражеские системы — для управления волной/сбросом. */
  private readonly enemySystem: EnemySystem;
  private readonly enemyShootingSystem: EnemyShootingSystem;
  private readonly bulletSystem: BulletSystem;
  /** Пост-физический кламп врагов к границе зоны (вызывается явно из кадра). */
  readonly zoneClampSystem: ZoneClampSystem;
  /** ECS-сущность игрока (Singleton). */
  private playerEntity: GameEntity | null = null;
  private readonly eventBus: EventBus;

  constructor(
    eventBus: EventBus,
    private readonly getPlayer: PlayerSource,
    deps: EnemySystemDeps,
  ) {
    this.eventBus = eventBus;
    // Пикапы: движение раньше сбора.
    this.engine.systems.add(new PickupMovementSystem(getPlayer));
    this.engine.systems.add(new PickupCollectionSystem(eventBus, getPlayer));

    // FX: частицы/кольца симулируются по компонентам-данным.
    this.engine.systems.add(new ParticleSystem());
    this.engine.systems.add(new RingSystem());

    // Лучи лазера: визуал затухает по LifeComponent.
    this.engine.systems.add(new BeamSystem());

    // Снаряды: движение/самонаведение/жизнь.
    this.bulletSystem = new BulletSystem();
    this.engine.systems.add(this.bulletSystem);

    // Враги: AI/движение (priority 0) раньше стрельбы (priority 1).
    this.enemySystem = new EnemySystem(this, deps.getPlayer, deps.getZoneBounds, deps.getIntegrate);
    this.enemyShootingSystem = new EnemyShootingSystem(
      deps.audio,
      deps.getPlayerMotion,
      deps.isCombatActive,
      (shot) => this.spawnEnemyBullet(
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
    this.engine.systems.add(this.enemySystem);
    this.engine.systems.add(this.enemyShootingSystem);

    // Зон-кламп врагов официально регистрируется в engine.systems (priority 10):
    // физика (6) и коллизии (7) уже внутри engine.run, поэтому кламп, исполняемый
    // после них, не даёт врагам «протекать» за границу на v*dt в каждом кадре.
    this.zoneClampSystem = new ZoneClampSystem(this, deps.getZoneBounds);
    this.engine.systems.add(this.zoneClampSystem);
  }

  /** Выполнить все системы текущего кадра с дельтой времени. */
  update(dt: number): void {
    this.engine.run(dt);
  }

  /**
   * Типизированный запрос всех компонентов заданного класса по всем сущностям мира.
   * Никаких кастов в legacy-типы: возвращаются настоящие компоненты.
   * Это единый способ для игровых систем читать сущности без plain-моста.
   */
  query<T extends Component>(componentClass: ComponentClass<T>): T[] {
    const result: T[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const c = entity.components.get(componentClass);
      if (c) result.push(c);
    }
    return result;
  }

  /**
   * Клампнуть врагов к границе игровой зоны. Вызывается ЯВНО после шага
   * физики (PhysicsSystem.update уже записал позиции обратно в сущности),
   * чтобы враги не «протекали» за границу на v*dt в каждом кадре.
   */
  clampEnemiesToZone(dt: number): void {
    this.zoneClampSystem.process(dt);
  }

  // ===== Enemy wave control =====

  /** Сброс состояния врагов (перед запуском забега). */
  resetEnemyWave(): void {
    this.enemySystem.reset();
    this.enemyShootingSystem.reset();
  }

  /** Установить номер волны врагов. */
  setEnemyWave(wave: number): void {
    this.enemySystem.setWave(wave);
    this.enemyShootingSystem.setWave(wave);
  }

  // ===== Pickup API =====

  /** Заспавнить пикап как ECS-сущность из базовых компонентов. */
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    const entity = new GameEntity();
    entity.components.add(new PickupKindComponent(kind));
    entity.components.add(new PositionComponent(x, y));
    entity.components.add(new VelocityComponent(vx, vy));
    entity.components.add(new LifeComponent(20, 20));
    entity.components.add(new RadiusComponent(14));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво для рендера и констант: список текущих пикапов. */
  pickups(): Pickup[] {
    const result: Pickup[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const kind = entity.components.get(PickupKindComponent);
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      const radius = entity.components.get(RadiusComponent);
      if (kind && position && velocity && life && radius) {
        result.push({
          kind: kind.kind,
          x: position.x,
          y: position.y,
          vx: velocity.vx,
          vy: velocity.vy,
          life: life.remaining,
          seed: seedForId(entity.id),
          r: radius.r,
        });
      }
    }
    return result;
  }

  // ===== Asteroid API =====

  /** Кэш живых связок компонентов астероидов (ключ = сущность). Обеспечивает
   *  стабильную объектную идентичность: physics-контакты и мир кадра ссылаются
   *  на ОДИН И ТОТ ЖЕ AsteroidRef, поэтому indexOf/includes/`userData` совпадают. */
  private readonly asteroidRefCache = new WeakMap<GameEntity, AsteroidRef>();

  /**
   * Собрать из сущности астероида живую связку компонентов.
   * Возвращает null, если у сущности нет маркера AsteroidComponent.
   * ВСЕ компоненты — живые ссылки; никакого DTO-копирования нет.
   * Связка кэшируется на сущность — объектная идентичность стабильна.
   */
  private asteroidRefOf(entity: GameEntity): AsteroidRef | null {
    const cached = this.asteroidRefCache.get(entity);
    if (cached) return cached;
    const marker = entity.components.get(AsteroidComponent);
    if (!marker) return null;
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!position || !velocity || !radius || !life) return null;
    const ref: AsteroidRef = { entity, marker, position, velocity, radius, life };
    this.asteroidRefCache.set(entity, ref);
    return ref;
  }

  /**
   * Производное чтиво: живые связки компонентов всех астероидов пояса.
   * Читатели работают с базовыми компонентами (Position/Velocity/Radius/Life)
   * и маркером AsteroidComponent напрямую (компонентные запросы).
   */
  asteroids(): AsteroidRef[] {
    const result: AsteroidRef[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const ref = this.asteroidRefOf(entity);
      if (ref) result.push(ref);
    }
    return result;
  }

  /**
   * Зарегистрировать астероид как ECS-сущность из базовых+доменных компонентов.
   * Позицию/скорость/радиус/здоровье кладём в Position/Velocity/Radius/Life,
   * доменные поля (key/kind/angle/spin/verts/mass/dead) — в AsteroidComponent.
   */
  spawnAsteroid(state: AsteroidSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new PositionComponent(state.x, state.y));
    entity.components.add(new VelocityComponent(state.vx, state.vy));
    entity.components.add(new RadiusComponent(state.r));
    entity.components.add(new LifeComponent(state.hp, state.maxHp));
    entity.components.add(new AsteroidComponent({
      key: state.key,
      kind: state.kind,
      angle: state.angle,
      spin: state.spin,
      verts: state.verts,
      mass: state.mass,
      dead: state.dead,
    }));
    this.engine.entities.add(entity);
  }

  /** Найти связку компонентов астероида по строковой идентичности пояса (или null). */
  asteroidByKey(key: string): AsteroidRef | null {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const marker = entity.components.get(AsteroidComponent);
      if (marker && marker.key === key) return this.asteroidRefOf(entity);
    }
    return null;
  }

  /** Удалить астероид по строковой идентичности пояса. */
  removeAsteroidByKey(key: string): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const c = entity.components.get(AsteroidComponent);
      if (c && c.key === key) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /**
   * Удалить все астероиды (мягкий сброс — пустой пояс, без сброса чанков).
   * Используется при возврате в меню и начале забега (пояс отрастает из чанков).
   */
  clearAsteroids(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(AsteroidComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  // ===== Enemy API =====

  /**
   * Зарегистрировать врага как ECS-сущность из чистых данных.
   * EnemyComponent — единственный источник правды; никакого отдельного
   * живого объекта `Enemy` мы не храним (enemies() строит DTO на лету).
   */
  addEnemy(enemy: Enemy): void {
    const entity = new GameEntity();
    entity.components.add(new PositionComponent(enemy.x, enemy.y));
    entity.components.add(new VelocityComponent(enemy.vx, enemy.vy));
    entity.components.add(new RadiusComponent(enemy.r));
    entity.components.add(new LifeComponent(enemy.hp, enemy.maxHp));
    const c = new EnemyComponent({
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
    });
    entity.components.add(c);
    this.engine.entities.add(entity);
  }

  /** Кэш живых связок компонентов врагов (ключ = сущность). Обеспечивает
   *  стабильную объектную идентичность: физика/коллизии/зоны/AI ссылаются на
   *  ОДИН И ТОТ ЖЕ EnemyRef, поэтому indexOf/includes/`userData` совпадают. */
  private readonly enemyRefCache = new WeakMap<GameEntity, EnemyRef>();

  /** Собрать из сущности врага живую связку компонентов.
   *  Возвращает null, если у сущности нет маркера EnemyComponent или не хватает
   *  базовых компонентов. Все компоненты — живые ссылки; DTO-копий нет. */
  private enemyRefOf(entity: GameEntity): EnemyRef | null {
    const cached = this.enemyRefCache.get(entity);
    if (cached) return cached;
    const marker = entity.components.get(EnemyComponent);
    if (!marker) return null;
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!position || !velocity || !radius || !life) return null;
    const ref: EnemyRef = { entity, marker, position, velocity, radius, life };
    this.enemyRefCache.set(entity, ref);
    return ref;
  }

  /** Производное чтиво: живые связки компонентов всех врагов.
   *  Читатели работают с базовыми компонентами (Position/Velocity/Life/Radius)
   *  и маркером EnemyComponent напрямую (компонентные запросы). */
  enemies(): EnemyRef[] {
    const result: EnemyRef[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const ref = this.enemyRefOf(entity);
      if (ref) result.push(ref);
    }
    return result;
  }

  /** Найти связку компонентов врага по EntityRef-идентификатору (или null). */
  enemyComponentById(id: number | string | null): EnemyRef | null {
    if (id === null) return null;
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const c = entity.components.get(EnemyComponent);
      if (c && c.ecsId === id) return this.enemyRefOf(entity);
    }
    return null;
  }

  /** Живая связка компонентов врага по сущности (или null). */
  enemyRefByEntity(entity: GameEntity): EnemyRef | null {
    return this.enemyRefOf(entity);
  }

  /** Заспавнить врага через вражескую AI-систему. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: EnemyRef | null, playerPos?: { x: number; y: number }): void {
    this.enemySystem.spawn(kind, x, y, parent, playerPos);
  }

  // ===== Bullet API =====

  /** Зарегистрировать снаряд игрока как ECS-сущность из чистых данных. */
  addBullet(bullet: Bullet): void {
    const entity = new GameEntity();
    entity.components.add(new BulletComponent(bullet.dmg));
    entity.components.add(new PositionComponent(bullet.x, bullet.y));
    entity.components.add(new VelocityComponent(bullet.vx, bullet.vy));
    entity.components.add(new LifeComponent(bullet.life, bullet.life));
    if (bullet.homing) {
      entity.components.add(new HomingRef(
        bullet.homing.target ? this.entityIdForEnemy(bullet.homing.target) : null,
        bullet.homing.turnRate,
        bullet.homing.lockRange,
      ));
    }
    this.engine.entities.add(entity);
  }

  /** Зарегистрировать вражеский снаряд как ECS-сущность из чистых данных. */
  addEnemyBullet(bullet: EBullet): void {
    const entity = new GameEntity();
    entity.components.add(new EnemyBulletComponent(bullet.dmg, bullet.heavy, bullet.cruiser));
    entity.components.add(new PositionComponent(bullet.x, bullet.y));
    entity.components.add(new VelocityComponent(bullet.vx, bullet.vy));
    entity.components.add(new LifeComponent(bullet.life, bullet.life));
    entity.components.add(new RadiusComponent(bullet.r));
    entity.components.add(new BulletSweepComponent(bullet.px, bullet.py, bullet.grazed));
    this.engine.entities.add(entity);
  }

  /** Найти id сущности врага, соответствующей данному объекту `EnemyRef`. */
  private entityIdForEnemy(target: EnemyRef): number | string | null {
    return target.marker.ecsId ?? null;
  }

  /**
   * Спавн вражеского снаряда напрямую в ECS-мир.
   * Единственная точка создания вражеской пули; никакого промежуточного
   * plain-класса или события-«моста» (enemy_fired) здесь нет.
   */
  spawnEnemyBullet(
    x: number,
    y: number,
    vx: number,
    vy: number,
    life: number,
    dmg: number,
    heavy: boolean,
    cruiser: boolean,
  ): void {
    this.addEnemyBullet({
      x, y, vx, vy, life, dmg, heavy, cruiser,
      r: cruiser ? 5.5 : heavy ? 3.4 : 2.5,
      px: x, py: y,
      grazed: false,
    });
  }

  /** Производное чтиво: список снарядов игрока (свежие снапшоты по компонентам). */
  bullets(): Bullet[] {
    const result: Bullet[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const bullet = entity.components.get(BulletComponent);
      if (!bullet) continue;
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      const homing = entity.components.get(HomingRef);
      if (!position || !velocity || !life) continue;

      result.push({
        x: position.x,
        y: position.y,
        vx: velocity.vx,
        vy: velocity.vy,
        life: life.remaining,
        dmg: bullet.dmg,
        homing: homing ? { target: null, turnRate: homing.turnRate, lockRange: homing.lockRange } : undefined,
        entityId: entity.id,
      });
    }
    return result;
  }

  /** Производное чтиво: список вражеских снарядов (свежие снапшоты по компонентам). */
  enemyBullets(): EBullet[] {
    const result: EBullet[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const bullet = entity.components.get(EnemyBulletComponent);
      if (!bullet) continue;
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      const radius = entity.components.get(RadiusComponent);
      const sweep = entity.components.get(BulletSweepComponent);
      if (!position || !velocity || !life || !sweep) continue;

      result.push({
        x: position.x,
        y: position.y,
        vx: velocity.vx,
        vy: velocity.vy,
        life: life.remaining,
        dmg: bullet.dmg,
        heavy: bullet.heavy,
        cruiser: bullet.cruiser,
        r: radius ? radius.r : 2.5,
        px: sweep.px,
        py: sweep.py,
        grazed: sweep.grazed,
        entityId: entity.id,
      });
    }
    return result;
  }

  /** Удалить снаряд игрока по идентификатору его ECS-сущности. */
  removeBullet(bullet: Bullet): void {
    const id = bullet.entityId;
    if (id === undefined || id === null) return;
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.id === id && entity.components.get(BulletComponent)) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /** Удалить вражеский снаряд по идентификатору его ECS-сущности. */
  removeEnemyBullet(bullet: EBullet): void {
    const id = bullet.entityId;
    if (id === undefined || id === null) return;
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.id === id && entity.components.get(EnemyBulletComponent)) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /** Отметить вражеский снаряд как уже засчитанный касанием (обратно в компонент).
   *  Источник правды — BulletSweepComponent.grazed: снапшот читает его каждый кадр,
   *  поэтому метка сохраняется между кадрами без WeakMap-«представлений». */
  markEnemyBulletGrazed(id: number | string | null | undefined): void {
    if (id === undefined || id === null) return;
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.id === id) {
        const sweep = entity.components.get(BulletSweepComponent);
        if (sweep) sweep.grazed = true;
        return;
      }
    }
  }

  // ===== AllyDrone API =====

  /** Кэш живых связок компонентов дронов (ключ = сущность). Обеспечивает
   *  стабильную объектную идентичность: мир кадра/коллизии ссылаются на ОДИН
   *  И ТОТ ЖЕ DroneRef, поэтому indexOf/includes/`userData` совпадают. */
  private readonly droneRefCache = new WeakMap<GameEntity, DroneRef>();

  /** Собрать из сущности дрона живую связку компонентов.
   *  Возвращает null, если у сущности нет маркера AllyDroneComponent или не
   *  хватает базовых компонентов. Все компоненты — живые ссылки; DTO-копий нет. */
  private droneRefOf(entity: GameEntity): DroneRef | null {
    const cached = this.droneRefCache.get(entity);
    if (cached) return cached;
    const marker = entity.components.get(AllyDroneComponent);
    if (!marker) return null;
    const position = entity.components.get(PositionComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!position || !radius || !life) return null;
    const ref: DroneRef = { entity, marker, position, radius, life };
    this.droneRefCache.set(entity, ref);
    return ref;
  }

  /** Производное чтиво: живые связки компонентов всех дронов-компаньонов.
   *  Читатели работают с базовыми компонентами (Position/Radius/Life) и
   *  маркером AllyDroneComponent напрямую (компонентные запросы). */
  allyDrones(): DroneRef[] {
    const result: DroneRef[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const ref = this.droneRefOf(entity);
      if (ref) result.push(ref);
    }
    return result;
  }

  /** Зарегистрировать дрон-компаньон как ECS-сущность из чистых данных.
   *   Раскладывает state по базовым (Position/Radius/Life) и узкому
   *   (AllyDroneComponent) компонентам. */
  addAllyDrone(state: AllyDroneSpawn): void {
    const entity = new GameEntity();
    entity.components.add(new PositionComponent(state.x, state.y));
    entity.components.add(new RadiusComponent(state.r));
    entity.components.add(new LifeComponent(state.hp, state.maxHp));
    entity.components.add(new AllyDroneComponent(
      entity.id,
      state.angle,
      state.fireCd,
      state.phase,
      state.targetId ?? null,
      state.retargetT,
      state.flash,
      state.permanent,
      state.kind,
      state.combat,
    ));
    this.engine.entities.add(entity);
  }

  /** Удалить дрон по его EntityRef-идентификатору. */
  removeAllyDroneById(id: number | string): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const d = entity.components.get(AllyDroneComponent);
      if (d && d.entityId === id) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /** Нанести урон дрону по EntityRef-идентификатору; возвращает true, если погиб.
   *   Запас прочности дрона хранится в базовом LifeComponent. */
  damageAllyDrone(id: number | string, dmg: number): boolean {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const d = entity.components.get(AllyDroneComponent);
      if (d && d.entityId === id) {
        const life = entity.components.get(LifeComponent);
        if (life) life.remaining -= dmg;
        d.flash = 1;
        return life ? life.remaining <= 0 : false;
      }
    }
    return false;
  }

  /**
   * Нанести урон врагу по EntityRef-идентификатору (единый канонический
   * путь для пуль, контактов, лазера и способностей). Возвращает true,
   * если враг погиб. При гибели публикует событие 'enemy_killed'.
   */
  damageEnemy(id: number | string, dmg: number): boolean {
    const ref = this.enemyComponentById(id);
    if (!ref || ref.marker.dead) return false;
    ref.life.remaining -= dmg;
    ref.marker.flash = 1;
    if (ref.life.remaining <= 0) {
      ref.marker.dead = true;
      this.eventBus?.publish?.("enemy_killed", {
        score: ref.marker.score,
        kind: ref.marker.kind,
        x: ref.position.x,
        y: ref.position.y,
        seed: ref.marker.seed,
      });
      return true;
    }
    return false;
  }

  // ===== Player API =====

  /**
   * Зарегистрировать игрока как Singleton-сущность ECS-мира.
   * Раскладывает состояние по базовым (Position/Velocity/Radius/Life) и
   * узкому (PlayerComponent) компонентам; возвращает доменное состояние.
   */
  registerPlayer(): PlayerState {
    if (this.playerEntity) this.engine.entities.remove(this.playerEntity);
    const entity = new GameEntity();
    const state = createPlayerState();
    entity.components.add(new PositionComponent(0, 0));
    entity.components.add(new VelocityComponent(0, 0));
    entity.components.add(new RadiusComponent(PLAYER_HITBOX_RADIUS));
    entity.components.add(new LifeComponent(100, 100));
    entity.components.add(new PlayerComponent(state.angle, state.invuln, state.thrusting, state.mass));
    this.engine.entities.add(entity);
    this.playerEntity = entity;
    return state;
  }

  /** Живая связка компонентов игрока (или null, если игрока нет). */
  playerRef(): PlayerRef | null {
    if (!this.playerEntity) return null;
    const entity = this.playerEntity;
    const marker = entity.components.get(PlayerComponent);
    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    const radius = entity.components.get(RadiusComponent);
    const life = entity.components.get(LifeComponent);
    if (!marker || !position || !velocity || !radius || !life) return null;
    return { entity, marker, position, velocity, radius, life };
  }

  /** Производное чтиво: доменное состояние игрока. */
  playerState(): PlayerState | null {
    const ref = this.playerRef();
    return ref
      ? {
          angle: ref.marker.angle,
          invuln: ref.marker.invuln,
          thrusting: ref.marker.thrusting,
          mass: ref.marker.mass,
        }
      : null;
  }

  // ===== Physics body source (компонентный источник тел) =====

  /** Плотность тела: согласована с массой massForRadius (π·r²·0.02). */
  private static readonly BODY_DENSITY = 0.02;
  private static readonly BODY_RESTITUTION = 0.15;
  private static readonly BODY_FRICTION = 0.05;

  /** Единые параметры тела для ECS-сущностей (игрок/враг/пикап). */
  private static commonBodyDef(kind: PhysicsBodyDef["kind"], r: number, opts: {
    kinematic?: boolean; sensor?: boolean; restitution?: number; friction?: number;
  } = {}): Omit<PhysicsBodyDef, "x" | "y" | "kind" | "radius"> {
    return {
      density: EcsWorld.BODY_DENSITY,
      restitution: opts.restitution ?? EcsWorld.BODY_RESTITUTION,
      friction: opts.friction ?? EcsWorld.BODY_FRICTION,
      fixedRotation: true,
      kinematic: opts.kinematic ?? false,
      sensor: opts.sensor ?? false,
    };
  }

  /**
   * Живые сущности текущего кадра для физического слоя, собранные из ECS-компонентов.
   * Игрок/враг/пикап/астероид читаются напрямую из компонентов, без plain-адаптеров.
   */
  physicsBodies(): PhysicsEntity[] {
    const bodies: PhysicsEntity[] = [];

    // Игрок (компонентные запросы: базовые Position/Velocity + узкий маркер).
    const player = this.playerRef();
    if (player) {
      const { position, velocity, radius, marker } = player;
      bodies.push({
        userData: player,
        kind: "player",
        radius: radius.r,
        ...EcsWorld.commonBodyDef("player", radius.r),
        getState: () => ({
          x: position.x, y: position.y, angle: marker.angle,
          vx: velocity.vx, vy: velocity.vy, spin: 0,
        }),
        applyResult: (s) => {
          position.x = s.x; position.y = s.y; marker.angle = s.angle;
          velocity.vx = s.vx; velocity.vy = s.vy;
        },
      });
    }

    // Враги (компонентные запросы: базовые Position/Velocity/Radius + маркер).
    for (const e of this.enemies()) {
      if (e.marker.dead) continue;
      const { position, velocity, radius, marker } = e;
      const kinematic = marker.droneState === "orbiting";
      bodies.push({
        userData: e,
        kind: "enemy",
        radius: radius.r,
        ...EcsWorld.commonBodyDef("enemy", radius.r, { kinematic }),
        getState: () => ({
          x: position.x, y: position.y, angle: marker.angle,
          vx: kinematic ? 0 : velocity.vx, vy: kinematic ? 0 : velocity.vy, spin: 0,
        }),
        applyResult: (s) => {
          position.x = s.x; position.y = s.y; marker.angle = s.angle;
          if (!kinematic) { velocity.vx = s.vx; velocity.vy = s.vy; }
        },
      });
    }

    // Астероиды (компонентные запросы: базовые Position/Velocity/Radius + маркер).
    for (const a of this.asteroids()) {
      if (a.marker.dead) continue;
      const { position, velocity, radius, marker } = a;
      bodies.push({
        userData: a,
        kind: "asteroid",
        radius: radius.r,
        ...EcsWorld.commonBodyDef("asteroid", radius.r, { restitution: 0.15, friction: 0.05 }),
        getState: () => ({
          x: position.x, y: position.y, angle: marker.angle,
          vx: velocity.vx, vy: velocity.vy, spin: marker.spin,
        }),
        applyResult: (s) => {
          position.x = s.x; position.y = s.y; marker.angle = s.angle;
          velocity.vx = s.vx; velocity.vy = s.vy;
        },
      });
    }

    // Пикапы (сенсорные кинематические тела).
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const kind = entity.components.get(PickupKindComponent);
      if (!kind) continue;
      const position = entity.components.get(PositionComponent);
      if (!position) continue;
      const radius = entity.components.get(RadiusComponent);
      const r = radius ? radius.r : 14;
      bodies.push({
        userData: entity,
        kind: "pickup",
        radius: r,
        ...EcsWorld.commonBodyDef("pickup", r, { kinematic: true, sensor: true, restitution: 0, friction: 0 }),
        getState: () => ({ x: position.x, y: position.y, angle: 0, vx: 0, vy: 0, spin: 0 }),
        applyResult: (s) => {
          // Кинематический сенсор двигается ECS PickupMovementSystem — результат не пишем.
          position.x = s.x; position.y = s.y;
        },
      });
    }

    return bodies;
  }

  // ===== LaserBeam API =====

  /** Зарегистрировать визуальный луч лазера как ECS-сущность из чистых данных. */
  addBeam(beam: LaserBeam): void {
    const entity = new GameEntity();
    entity.components.add(new LaserBeamComponent(
      beam.x1, beam.y1, beam.x2, beam.y2, beam.seed, beam.targetId ?? null,
    ));
    entity.components.add(new LifeComponent(beam.life, beam.maxLife));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: свежесобранные plain-объекты для рендера. */
  beams(): LaserBeam[] {
    const result: LaserBeam[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const beam = entity.components.get(LaserBeamComponent);
      if (!beam) continue;
      const life = entity.components.get(LifeComponent);
      if (!life) continue;
      result.push({
        x1: beam.x1,
        y1: beam.y1,
        x2: beam.x2,
        y2: beam.y2,
        life: life.remaining,
        maxLife: life.max,
        seed: beam.seed,
        targetId: beam.targetId ?? null,
      });
    }
    return result;
  }

  /** Удалить все сущности только с компонентом PickupKindComponent. */
  clearPickups(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(PickupKindComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Удалить всех врагов (сущности с компонентом EnemyComponent). */
  clearEnemies(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(EnemyComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) {
      this.engine.entities.remove(entity);
    }
  }

  /** Удалить все снаряды игрока (сущности с BulletComponent). */
  clearBullets(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(BulletComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Удалить все вражеские снаряды (сущности с EnemyBulletComponent). */
  clearEnemyBullets(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(EnemyBulletComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Удалить все дроны-компаньоны (сущности с AllyDroneComponent). */
  clearAllyDrones(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(AllyDroneComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Удалить все визуальные лучи лазера (сущности с LaserBeamComponent). */
  clearBeams(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(LaserBeamComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  // ===== Fx API (particles / rings) =====

  /** Зарегистрировать частицу как ECS-сущность из чистых данных-компонентов. */
  addParticle(particle: Particle): void {
    const entity = new GameEntity();
    entity.components.add(new ParticleComponent(particle.c, particle.size));
    entity.components.add(new PositionComponent(particle.x, particle.y));
    entity.components.add(new VelocityComponent(particle.vx, particle.vy));
    entity.components.add(new LifeComponent(particle.life, particle.maxLife));
    this.engine.entities.add(entity);
  }

  /**
   * Производное чтиво: read-only снапшот частиц (DTO на лету из компонентов).
   * Никаких стабильных представлений — рендер читает скалярные поля каждый кадр.
   */
  particles(): Particle[] {
    const result: Particle[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const particle = entity.components.get(ParticleComponent);
      if (!particle) continue;
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      result.push({
        x: position ? position.x : 0,
        y: position ? position.y : 0,
        vx: velocity ? velocity.vx : 0,
        vy: velocity ? velocity.vy : 0,
        life: life ? life.remaining : 0,
        maxLife: life ? life.max : 0,
        c: particle.c,
        size: particle.size,
      });
    }
    return result;
  }

  /** Удалить все частицы. */
  clearParticles(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(ParticleComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Зарегистрировать кольцо как ECS-сущность из чистых данных-компонентов. */
  addRing(ring: Ring): void {
    const entity = new GameEntity();
    entity.components.add(new RingComponent(ring.r, ring.vr, ring.c));
    entity.components.add(new PositionComponent(ring.x, ring.y));
    entity.components.add(new LifeComponent(ring.life, ring.maxLife));
    this.engine.entities.add(entity);
  }

  /**
   * Производное чтиво: read-only снапшот колец (DTO на лету из компонентов).
   * Никаких стабильных представлений — рендер читает скалярные поля каждый кадр.
   */
  rings(): Ring[] {
    const result: Ring[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const ring = entity.components.get(RingComponent);
      if (!ring) continue;
      const position = entity.components.get(PositionComponent);
      const life = entity.components.get(LifeComponent);
      result.push({
        x: position ? position.x : 0,
        y: position ? position.y : 0,
        r: ring.r,
        vr: ring.vr,
        life: life ? life.remaining : 0,
        maxLife: life ? life.max : 0,
        c: ring.c,
      });
    }
    return result;
  }

  /** Удалить все кольца. */
  clearRings(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(RingComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  // ===== Rift API =====

  /** Зарегистрировать разлом как ECS-сущность из чистых данных. */
  addRift(rift: Rift): void {
    const entity = new GameEntity();
    entity.components.add(new RiftComponent(
      rift.x, rift.y, rift.t, rift.state, rift.queue, rift.timer,
      rift.seed, rift.rot, rift.size,
    ));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: свежесобранные plain-объекты для рендера и чтения. */
  rifts(): Rift[] {
    const result: Rift[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(RiftComponent);
      if (component) {
        result.push({
          x: component.x,
          y: component.y,
          t: component.t,
          state: component.state,
          queue: component.queue,
          timer: component.timer,
          seed: component.seed,
          rot: component.rot,
          size: component.size,
        });
      }
    }
    return result;
  }

  /** Удалить все разломы. */
  clearRifts(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(RiftComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Очистить мир от всех сущностей (полный сброс). */
  clear(): void {
    this.engine.entities.clear();
  }
}