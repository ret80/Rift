/**
 * EcsWorld — обёртка над ECS-движком @trixt0r/ecs для игрового мира.
 *
 * Инкапсулирует Engine, фабрику сущностей и набор ECS-систем, а также
 * предоставляет производный API для пикапов и врагов: спавн/чтение списка.
 * Остальной код игры работает с миром через этот интерфейс, пока
 * остальные домены (пули, дроны, игрок) переводятся на ECS.
 */

import { Engine } from "@trixt0r/ecs";
import { PickupKind, EnemyKind } from "../balance";
import type { EventBus } from "../core/EventBus";
import type { Enemy, Bullet, EBullet, AllyDrone, LaserBeam, Particle, Ring, Rift, Pickup } from "../types";
import type { AudioManager } from "../systems/AudioManager";
import type { PlayerState } from "../systems/PlayerState";
import { PickupKindComponent } from "./components/PickupKindComponent";
import { PositionComponent } from "./components/PositionComponent";
import { VelocityComponent } from "./components/VelocityComponent";
import { RadiusComponent } from "./components/RadiusComponent";
import { LifeComponent } from "./components/LifeComponent";
import { HealthComponent } from "./components/HealthComponent";
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
import { PickupMovementSystem } from "./systems/PickupMovementSystem";
import { PickupCollectionSystem } from "./systems/PickupCollectionSystem";
import { ParticleSystem } from "./systems/ParticleSystem";
import { RingSystem } from "./systems/RingSystem";
import { BeamSystem } from "./systems/BeamSystem";
import { AllyDroneSystem } from "./systems/AllyDroneSystem";
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

export class EcsWorld {
  readonly engine = new Engine<GameEntity>();

  /** Внутренние ссылки на вражеские системы — для управления волной/сбросом. */
  private readonly enemySystem: EnemySystem;
  private readonly enemyShootingSystem: EnemyShootingSystem;
  private readonly bulletSystem: BulletSystem;
  /** ECS-сущность игрока (Singleton). */
  private playerEntity: GameEntity | null = null;

  constructor(
    eventBus: EventBus,
    private readonly getPlayer: PlayerSource,
    deps: EnemySystemDeps,
  ) {
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
      eventBus,
      deps.audio,
      deps.getPlayerMotion,
      deps.isCombatActive,
    );
    this.engine.systems.add(this.enemySystem);
    this.engine.systems.add(this.enemyShootingSystem);
  }

  /** Выполнить все системы текущего кадра с дельтой времени. */
  update(dt: number): void {
    this.engine.run(dt);
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

  // ===== Enemy API =====

  /**
   * Зарегистрировать врага как ECS-сущность из чистых данных.
   * EnemyComponent — единственный источник правды; никакого отдельного
   * живого объекта `Enemy` мы не храним (enemies() строит DTO на лету).
   */
  addEnemy(enemy: Enemy): void {
    const entity = new GameEntity();
    const c = new EnemyComponent({
      x: enemy.x,
      y: enemy.y,
      vx: enemy.vx,
      vy: enemy.vy,
      hp: enemy.hp,
      maxHp: enemy.maxHp,
      r: enemy.r,
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

  /** Производное чтиво: живые EnemyComponent, приведённые к типу Enemy.
   *  Компонент структурно идентичен Enemy и является единственным источником
   *  правды, поэтому физика/коллизии/зоны/AI мутируют его напрямую. */
  enemies(): Enemy[] {
    const result: Enemy[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const c = entity.components.get(EnemyComponent);
      if (c) result.push(c as unknown as Enemy);
    }
    return result;
  }

  /** Найти EnemyComponent по EntityRef-идентификатору врага (или null). */
  enemyComponentById(id: number | string | null): EnemyComponent | null {
    if (id === null) return null;
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const c = entity.components.get(EnemyComponent);
      if (c && c.ecsId === id) return c;
    }
    return null;
  }

  /** Заспавнить врага через вражескую AI-систему. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null, playerPos?: { x: number; y: number }): void {
    this.enemySystem.spawn(kind, x, y, parent, playerPos);
  }

  // ===== Bullet API =====

  /** Реестр «объект-представление → сущность» для удаления по идентичности. */
  private readonly bulletEntity = new WeakMap<Bullet, GameEntity>();
  private readonly enemyBulletEntity = new WeakMap<EBullet, GameEntity>();
  /** Стабильные объекты-представления (одна и та же ссылка между кадрами). */
  private readonly bulletViews = new WeakMap<GameEntity, Bullet>();
  private readonly enemyBulletViews = new WeakMap<GameEntity, EBullet>();

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
    this.bulletEntity.set(bullet, entity);
    this.bulletViews.set(entity, bullet);
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
    this.enemyBulletEntity.set(bullet, entity);
    this.enemyBulletViews.set(entity, bullet);
  }

  /** Найти id сущности врага, соответствующей данному объекту `Enemy`. */
  private entityIdForEnemy(target: Enemy): number | string | null {
    return target.ecsId ?? null;
  }

  /** Производное чтиво: список снарядов игрока (стабильные представления). */
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

      const view = this.bulletViews.get(entity)!;
      view.x = position.x;
      view.y = position.y;
      view.vx = velocity.vx;
      view.vy = velocity.vy;
      view.life = life.remaining;
      view.dmg = bullet.dmg;
      view.homing = homing ? { target: null, turnRate: homing.turnRate, lockRange: homing.lockRange } : undefined;
      result.push(view);
    }
    return result;
  }

  /** Производное чтиво: список вражеских снарядов (стабильные представления). */
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

      const view = this.enemyBulletViews.get(entity)!;
      view.x = position.x;
      view.y = position.y;
      view.vx = velocity.vx;
      view.vy = velocity.vy;
      view.life = life.remaining;
      view.dmg = bullet.dmg;
      view.heavy = bullet.heavy;
      view.cruiser = bullet.cruiser;
      view.r = radius ? radius.r : 2.5;
      view.px = sweep.px;
      view.py = sweep.py;
      view.grazed = sweep.grazed;
      result.push(view);
    }
    return result;
  }

  /** Удалить конкретный объект снаряда игрока из ECS. */
  removeBullet(bullet: Bullet): void {
    const entity = this.bulletEntity.get(bullet);
    if (entity) {
      this.bulletEntity.delete(bullet);
      this.bulletViews.delete(entity);
      this.engine.entities.remove(entity);
    }
  }

  /** Удалить конкретный объект вражеского снаряда из ECS. */
  removeEnemyBullet(bullet: EBullet): void {
    const entity = this.enemyBulletEntity.get(bullet);
    if (entity) {
      this.enemyBulletEntity.delete(bullet);
      this.enemyBulletViews.delete(entity);
      this.engine.entities.remove(entity);
    }
  }

  // ===== AllyDrone API =====

  /** Зарегистрировать дрон-компаньон как ECS-сущность из чистых данных. */
  addAllyDrone(drone: AllyDrone): void {
    const entity = new GameEntity();
    entity.components.add(new AllyDroneComponent(
      entity.id,
      drone.x, drone.y, drone.r, drone.angle, drone.fireCd, drone.phase,
      drone.hp, drone.maxHp, drone.targetId ?? null, drone.retargetT, drone.flash,
      drone.permanent, drone.kind, drone.combat,
    ));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: свежесобранные plain-объекты для рендера и чтения. */
  allyDrones(): AllyDrone[] {
    const result: AllyDrone[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const d = entity.components.get(AllyDroneComponent);
      if (d) {
        result.push({
          entityId: d.entityId,
          x: d.x,
          y: d.y,
          r: d.r,
          angle: d.angle,
          fireCd: d.fireCd,
          phase: d.phase,
          hp: d.hp,
          maxHp: d.maxHp,
          targetId: d.targetId ?? null,
          retargetT: d.retargetT,
          flash: d.flash,
          permanent: d.permanent,
          kind: d.kind,
          combat: d.combat,
        });
      }
    }
    return result;
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

  /** Нанести урон дрону по EntityRef-идентификатору; возвращает true, если погиб. */
  damageAllyDrone(id: number | string, dmg: number): boolean {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const d = entity.components.get(AllyDroneComponent);
      if (d && d.entityId === id) {
        d.hp -= dmg;
        d.flash = 1;
        return d.hp <= 0;
      }
    }
    return false;
  }

  // ===== Player API =====

  /** Зарегистрировать игрока как Singleton-сущность ECS-мира. */
  registerPlayer(state: PlayerState): void {
    if (this.playerEntity) this.engine.entities.remove(this.playerEntity);
    const entity = new GameEntity();
    entity.components.add(new PlayerComponent(state));
    this.engine.entities.add(entity);
    this.playerEntity = entity;
  }

  /** Производное чтиво: состояние игрока. */
  playerState(): PlayerState | null {
    if (!this.playerEntity) return null;
    const component = this.playerEntity.components.get(PlayerComponent);
    return component ? component.state : null;
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

  /** Стабильные объекты-представления частиц (те же ссылки между кадрами). */
  private readonly particleViews = new WeakMap<GameEntity, Particle>();
  /** Стабильные объекты-представления колец (те же ссылки между кадрами). */
  private readonly ringViews = new WeakMap<GameEntity, Ring>();

  /** Зарегистрировать частицу как ECS-сущность из чистых данных-компонентов. */
  addParticle(particle: Particle): void {
    const entity = new GameEntity();
    entity.components.add(new ParticleComponent(particle.c, particle.size));
    entity.components.add(new PositionComponent(particle.x, particle.y));
    entity.components.add(new VelocityComponent(particle.vx, particle.vy));
    entity.components.add(new LifeComponent(particle.life, particle.maxLife));
    this.engine.entities.add(entity);
    this.particleViews.set(entity, particle);
  }

  /** Производное чтиво: список частиц (стабильные представления). */
  particles(): Particle[] {
    const result: Particle[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const particle = entity.components.get(ParticleComponent);
      if (!particle) continue;
      const view = this.particleViews.get(entity);
      if (!view) continue;
      const position = entity.components.get(PositionComponent);
      const velocity = entity.components.get(VelocityComponent);
      const life = entity.components.get(LifeComponent);
      if (position) { view.x = position.x; view.y = position.y; }
      if (velocity) { view.vx = velocity.vx; view.vy = velocity.vy; }
      if (life) { view.life = life.remaining; view.maxLife = life.max; }
      view.c = particle.c;
      view.size = particle.size;
      result.push(view);
    }
    return result;
  }

  /** Удалить конкретную частицу из ECS. */
  removeParticle(particle: Particle): void {
    const entity = this.particleEntity(particle);
    if (entity) {
      this.particleViews.delete(entity);
      this.engine.entities.remove(entity);
    }
  }

  /** Найти сущность частицы по её стабильному представлению. */
  private particleEntity(particle: Particle): GameEntity | null {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (this.particleViews.get(entity) === particle) return entity;
    }
    return null;
  }

  /** Удалить все частицы. */
  clearParticles(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(ParticleComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) {
      this.particleViews.delete(entity);
      this.engine.entities.remove(entity);
    }
  }

  /** Зарегистрировать кольцо как ECS-сущность из чистых данных-компонентов. */
  addRing(ring: Ring): void {
    const entity = new GameEntity();
    entity.components.add(new RingComponent(ring.r, ring.vr, ring.c));
    entity.components.add(new PositionComponent(ring.x, ring.y));
    entity.components.add(new LifeComponent(ring.life, ring.maxLife));
    this.engine.entities.add(entity);
    this.ringViews.set(entity, ring);
  }

  /** Производное чтиво: список колец (стабильные представления). */
  rings(): Ring[] {
    const result: Ring[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const ring = entity.components.get(RingComponent);
      if (!ring) continue;
      const view = this.ringViews.get(entity);
      if (!view) continue;
      const position = entity.components.get(PositionComponent);
      const life = entity.components.get(LifeComponent);
      if (position) { view.x = position.x; view.y = position.y; }
      if (life) { view.life = life.remaining; view.maxLife = life.max; }
      view.r = ring.r;
      view.vr = ring.vr;
      view.c = ring.c;
      result.push(view);
    }
    return result;
  }

  /** Удалить конкретное кольцо из ECS. */
  removeRing(ring: Ring): void {
    const entity = this.ringEntity(ring);
    if (entity) {
      this.ringViews.delete(entity);
      this.engine.entities.remove(entity);
    }
  }

  /** Найти сущность кольца по её стабильному представлению. */
  private ringEntity(ring: Ring): GameEntity | null {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (this.ringViews.get(entity) === ring) return entity;
    }
    return null;
  }

  /** Удалить все кольца. */
  clearRings(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(RingComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) {
      this.ringViews.delete(entity);
      this.engine.entities.remove(entity);
    }
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