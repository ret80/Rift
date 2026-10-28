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
import type { Enemy, Bullet, EBullet, AllyDrone, LaserBeam, Particle, Ring, Rift } from "../types";
import type { AudioManager } from "../systems/AudioManager";
import type { PlayerState } from "../systems/PlayerState";
import { PickupComponent } from "./components/PickupComponent";
import { EnemyComponent } from "./components/EnemyComponent";
import { BulletComponent } from "./components/BulletComponent";
import { EnemyBulletComponent } from "./components/EnemyBulletComponent";
import { AllyDroneComponent } from "./components/AllyDroneComponent";
import { LaserBeamComponent } from "./components/LaserBeamComponent";
import { PlayerComponent } from "./components/PlayerComponent";
import { ParticleComponent } from "./components/ParticleComponent";
import { RingComponent } from "./components/RingComponent";
import { RiftComponent } from "./components/RiftComponent";
import { GameEntity } from "./GameEntity";
import { PickupMovementSystem } from "./systems/PickupMovementSystem";
import { PickupCollectionSystem } from "./systems/PickupCollectionSystem";
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

  /** Заспавнить пикап как ECS-сущность с компонентом PickupComponent. */
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    const entity = new GameEntity();
    entity.components.add(new PickupComponent(kind, x, y, vx, vy));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво для рендера и констант: список текущих пикапов. */
  pickups(): PickupComponent[] {
    const result: PickupComponent[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const pickup = entity.components.get(PickupComponent);
      if (pickup) result.push(pickup);
    }
    return result;
  }

  // ===== Enemy API =====

  /** Зарегистрировать существующий объект врага как ECS-сущность. */
  addEnemy(enemy: Enemy): void {
    const entity = new GameEntity();
    entity.components.add(new EnemyComponent(enemy));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: список живых врагов (объекты `Enemy`). */
  enemies(): Enemy[] {
    const result: Enemy[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(EnemyComponent);
      if (component) result.push(component.enemy);
    }
    return result;
  }

  /** Заспавнить врага через вражескую AI-систему. */
  spawnEnemy(kind: EnemyKind, x: number, y: number, parent: Enemy | null, playerPos?: { x: number; y: number }): void {
    this.enemySystem.spawn(kind, x, y, parent, playerPos);
  }

  // ===== Bullet API =====

  /** Зарегистрировать снаряд игрока как ECS-сущность. */
  addBullet(bullet: Bullet): void {
    const entity = new GameEntity();
    entity.components.add(new BulletComponent(bullet));
    this.engine.entities.add(entity);
  }

  /** Зарегистрировать вражеский снаряд как ECS-сущность. */
  addEnemyBullet(bullet: EBullet): void {
    const entity = new GameEntity();
    entity.components.add(new EnemyBulletComponent(bullet));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: список снарядов игрока. */
  bullets(): Bullet[] {
    const result: Bullet[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(BulletComponent);
      if (component) result.push(component.bullet);
    }
    return result;
  }

  /** Производное чтиво: список вражеских снарядов. */
  enemyBullets(): EBullet[] {
    const result: EBullet[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(EnemyBulletComponent);
      if (component) result.push(component.bullet);
    }
    return result;
  }

  /** Удалить конкретный объект снаряда игрока из ECS. */
  removeBullet(bullet: Bullet): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(BulletComponent);
      if (component && component.bullet === bullet) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /** Удалить конкретный объект вражеского снаряда из ECS. */
  removeEnemyBullet(bullet: EBullet): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(EnemyBulletComponent);
      if (component && component.bullet === bullet) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  // ===== AllyDrone API =====

  /** Зарегистрировать дрон-компаньон как ECS-сущность. */
  addAllyDrone(drone: AllyDrone): void {
    const entity = new GameEntity();
    entity.components.add(new AllyDroneComponent(drone));
    this.engine.entities.add(entity);
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

  /** Зарегистрировать визуальный луч лазера как ECS-сущность. */
  addBeam(beam: LaserBeam): void {
    const entity = new GameEntity();
    entity.components.add(new LaserBeamComponent(beam));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: список визуальных лучей лазера. */
  beams(): LaserBeam[] {
    const result: LaserBeam[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(LaserBeamComponent);
      if (component) result.push(component.beam);
    }
    return result;
  }

  /** Удалить конкретный визуальный луч из ECS. */
  removeBeam(beam: LaserBeam): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(LaserBeamComponent);
      if (component && component.beam === beam) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /** Производное чтиво: список дронов-компаньонов. */
  allyDrones(): AllyDrone[] {
    const result: AllyDrone[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(AllyDroneComponent);
      if (component) result.push(component.drone);
    }
    return result;
  }

  /** Удалить конкретный дрон-компаньон из ECS. */
  removeAllyDrone(drone: AllyDrone): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(AllyDroneComponent);
      if (component && component.drone === drone) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  // ===== Clear =====

  /** Удалить все сущности только с компонентом PickupComponent. */
  clearPickups(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(PickupComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Удалить всех врагов (сущности с компонентом EnemyComponent). */
  clearEnemies(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(EnemyComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
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

  /** Зарегистрировать частицу как ECS-сущность. */
  addParticle(particle: Particle): void {
    const entity = new GameEntity();
    entity.components.add(new ParticleComponent(particle));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: список частиц. */
  particles(): Particle[] {
    const result: Particle[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(ParticleComponent);
      if (component) result.push(component.particle);
    }
    return result;
  }

  /** Удалить конкретную частицу из ECS. */
  removeParticle(particle: Particle): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(ParticleComponent);
      if (component && component.particle === particle) {
        this.engine.entities.remove(entity);
        return;
      }
    }
  }

  /** Удалить все частицы. */
  clearParticles(): void {
    const toRemove: GameEntity[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      if (entity.components.get(ParticleComponent)) toRemove.push(entity);
    }
    for (const entity of toRemove) this.engine.entities.remove(entity);
  }

  /** Зарегистрировать кольцо как ECS-сущность. */
  addRing(ring: Ring): void {
    const entity = new GameEntity();
    entity.components.add(new RingComponent(ring));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: список колец. */
  rings(): Ring[] {
    const result: Ring[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(RingComponent);
      if (component) result.push(component.ring);
    }
    return result;
  }

  /** Удалить конкретное кольцо из ECS. */
  removeRing(ring: Ring): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(RingComponent);
      if (component && component.ring === ring) {
        this.engine.entities.remove(entity);
        return;
      }
    }
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

  /** Зарегистрировать разлом как ECS-сущность. */
  addRift(rift: Rift): void {
    const entity = new GameEntity();
    entity.components.add(new RiftComponent(rift));
    this.engine.entities.add(entity);
  }

  /** Производное чтиво: список разломов. */
  rifts(): Rift[] {
    const result: Rift[] = [];
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(RiftComponent);
      if (component) result.push(component.rift);
    }
    return result;
  }

  /** Удалить конкретный разлом из ECS. */
  removeRift(rift: Rift): void {
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(RiftComponent);
      if (component && component.rift === rift) {
        this.engine.entities.remove(entity);
        return;
      }
    }
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