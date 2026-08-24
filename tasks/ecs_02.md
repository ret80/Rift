# ECS Этап 02 — World, EntityFactory, SystemScheduler и типы

> **v3.1:** Added SystemScheduler, deferred destruction (from criticism_03.md).

## Цель
Создать центральный ECS `World`, `EntityFactory` для создания сущностей, `Query` для выбора сущностей по компонентам, и общие типы.

---

## 1. Создание World

Файл: `src/game/ecs/World.ts`

```typescript
import { GameSystem } from './GameSystem';
import { Entity } from './Entity';
import { TransformComponent, VelocityComponent, Component } from './Component';
import { Vec2 } from './math/Vec2';

/**
 * World — центральный контейнер ECS.
 * Хранит сущности, управляет физикой kinetics.ts,
 * предоставляет Query для выбора сущностей по компонентам.
 * 
 * NEW v3.1 (from criticism_03.md):
 * - deferred destruction — markForDestroy + flushDestroy
 * 
 * NEW v3 (fixes from criticism_02.md):
 * - findEntityById() — поиск сущности по ID
 * - getEntityByPhysics() — поиск сущности по physics-объекту (для CollisionSystem)
 * - Set-based query — O(1) per component, intersection для нескольких
 * - physicsEntityMap — обратное отображение physicsEntity → entityId
 */
export class World {
  private physics: GameSystem;
  private entities: Map<number, Entity> = new Map();
  private nextId = 0;
  private physicsEntities = new Map<number, any>(); // entityId → physicsEntity (Circle)
  private physicsEntityMap = new Map<any, number>(); // physicsEntity → entityId (обратное)

  // NEW v3: индекс компонентов для эффективного query
  private componentIndex = new Map<string, Set<Entity>>();

  // NEW v3.1: deferred destruction
  private pendingDestroy: Entity[] = [];

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new GameSystem(canvas);
  }

  // ==================== Создание / Удаление ====================

  /** Создать сущность */
  createEntity(): Entity {
    const entity = new Entity(this.nextId++);
    this.entities.set(entity.id, entity);
    return entity;
  }

  /** Удалить сущность */
  destroyEntity(entity: Entity): void {
    this.unbindPhysicsEntity(entity);
    this.entities.delete(entity.id);
    // Удалить из индекса компонентов
    for (const set of this.componentIndex.values()) {
      set.delete(entity);
    }
  }

  // NEW v3.1: deferred destruction
  /** Пометить сущность на уничтожение (выполняется через flushDestroy) */
  markForDestroy(entity: Entity): void {
    this.pendingDestroy.push(entity);
  }

  /** Выполнить отложенное уничтожение всех помеченных сущностей */
  flushDestroy(): void {
    for (const entity of this.pendingDestroy) {
      this.destroyEntity(entity);
    }
    this.pendingDestroy.length = 0;
  }

  // ==================== Работа с компонентами ====================

  /** Добавить компонент сущности */
  addComponent(entity: Entity, component: Component): void {
    entity.addComponent(component);

    // NEW v3: добавить в индекс компонентов
    if (!this.componentIndex.has(component.type)) {
      this.componentIndex.set(component.type, new Set());
    }
    this.componentIndex.get(component.type)!.add(entity);

    // Если добавляем Transform/Velocity — синхронизировать с физикой
    if (component.type === 'transform' || component.type === 'velocity') {
      this.syncToPhysics(entity);
    }
  }

  // ==================== Entity Lookup (NEW v3) ====================

  /**
   * NEW v3: найти сущность по ID.
   * Критично для DeathSystem, ApplyPickupSystem и других,
   * которым передаётся entityId из событий.
   */
  findEntityById(id: number): Entity | undefined {
    return this.entities.get(id);
  }

  /**
   * NEW v3: найти сущность по physics-объекту kinetics.ts.
   * Критично для CollisionSystem — при коллизии получаем physicsEntity.
   */
  getEntityByPhysics(physicsEntity: any): Entity | undefined {
    const entityId = this.physicsEntityMap.get(physicsEntity);
    return entityId !== undefined ? this.findEntityById(entityId) : undefined;
  }

  // ==================== Query (NEW v3: Set-based) ====================

  /**
   * NEW v3: эффективный query через пересечение множеств.
   * O(k) где k — размер наименьшего компонента, вместо O(n).
   */
  query(...componentTypes: string[]): Entity[] {
    if (componentTypes.length === 0) return this.getAllEntities();

    let result: Set<Entity> | null = null;
    for (const type of componentTypes) {
      const set = this.componentIndex.get(type);
      if (!set || set.size === 0) return [];
      if (result === null) {
        result = new Set(set);
      } else {
        // Пересечение множеств
        for (const e of result) {
          if (!set.has(e)) result.delete(e);
        }
      }
    }
    return result ? Array.from(result) : [];
  }

  /** Получить все сущности с компонентом Transform */
  queryWithTransform(): Entity[] {
    return this.query('transform');
  }

  /** Получить все сущности с Transform + Velocity */
  queryWithTransformAndVelocity(): Entity[] {
    return this.query('transform', 'velocity');
  }

  // ==================== Синхронизация с physics (kinetics.ts) ====================

  private syncToPhysics(entity: Entity): void {
    const transform = entity.getComponent<TransformComponent>('transform');
    const velocity = entity.getComponent<VelocityComponent>('velocity');

    if (!transform) return;

    const physicsEntity = this.physicsEntities.get(entity.id);
    if (physicsEntity) {
      physicsEntity.position = { x: transform.x, y: transform.y };
      if (velocity) {
        physicsEntity.velocity = { x: velocity.vx, y: velocity.vy };
      }
    }
  }

  /** Привязать physics-сущность к Entity */
  bindPhysicsEntity(entity: Entity, physicsEntity: any): void {
    this.physics.addPhysicsEntity(entity.id, physicsEntity);
    this.physicsEntities.set(entity.id, physicsEntity);
    // NEW v3: обратное отображение
    this.physicsEntityMap.set(physicsEntity, entity.id);
  }

  /** Отвязать physics-сущность */
  unbindPhysicsEntity(entity: Entity): void {
    const physicsEntity = this.physicsEntities.get(entity.id);
    if (physicsEntity) {
      this.physics.removePhysicsEntity(entity.id);
      this.physicsEntities.delete(entity.id);
      this.physicsEntityMap.delete(physicsEntity);
    }
  }

  /**
   * NEW v3: получить physics-сущность по entityId.
   * Используется PhysicsSyncSystem для чтения позиций.
   */
  getPhysicsEntity(entityId: number): any {
    return this.physicsEntities.get(entityId);
  }

  // ==================== Камера ====================

  getCameraPosition(): Vec2 {
    return this.physics.getCameraPosition();
  }

  setCameraPosition(pos: Vec2): void {
    this.physics.setCameraPosition(pos);
  }

  setCameraZoom(zoom: number): void {
    this.physics.setCameraZoom(zoom);
  }

  getCameraZoom(): number {
    return this.physics.getCameraZoom();
  }

  // ==================== Обновление ====================

  updatePhysics(dt: number): void {
    this.physics.update(dt);
  }

  // ==================== Утилиты ====================

  getAllEntities(): Entity[] {
    return Array.from(this.entities.values());
  }

  getEntityCount(): number {
    return this.entities.size;
  }
}
```

---

## 2. Types — общие типы ECS

Файл: `src/game/ecs/types.ts`

```typescript
import { EventBus, GameEventMap, EventType, EventCallback, GameEvent } from './core/EventBus';

// ===== Типы сущностей для логической группировки =====

/** Типы сущностей для логической группировки */
export type EntityType = 
  | 'player'
  | 'enemy'
  | 'bullet'
  | 'enemyBullet'
  | 'pickup'
  | 'drone'
  | 'mine'
  | 'asteroid'
  | 'missile';

/** Конфигурация для создания физической сущности в kinetics.ts */
export interface PhysicsEntityConfig {
  radius: number;
  mass: number;
  speed?: number;
  elasticity?: number;
  angularSpeed?: number;
  static?: boolean;
  rotate?: boolean;
  render?: {
    strokeColor?: string;
    fillColor?: string;
    strokeWidth: number;
    glowIntensity?: number;
    glowColor?: string;
  };
}

/** Конфигурация для создания сущности в World */
export interface EntityConfig {
  x: number;
  y: number;
  type: EntityType;
  physics: PhysicsEntityConfig;
  components?: Record<string, unknown>;
}

/**
 * EventBus для ECS — используем существующий из src/game/core/EventBus.ts.
 *
 * NEW v3: вместо Record<string, unknown> — строгая типизация через GameEventMap.
 * Существующий EventBus уже поддерживает типизированные события.
 * Для ECS-специфичных событий добавить новые типы в GameEventMap:
 *
 *   damage_dealt: { targetId: number; amount: number; source: string; }
 *   destroy_entity: { entityId: number; }
 *   entity_died: { entityId: number; }
 *   player_died: Record<string, never>;
 *   enemy_died: { entityId: number; scoreValue: number; kind: string; x: number; y: number; }
 *   player_hit_by_enemy: { playerId: number; enemyId: number; damage: number; }
 *   player_hit_by_mine: { playerId: number; damage: number; }
 *   pickup_collected: { pickupId: number; }
 *   mine_exploded: { mineId: number; enemyId: number; damage: number; }
 *   asteroid_hit: { asteroidId: string; }
 *   health_changed: { entityId: number; oldHp: number; newHp: number; }
 *   bullet_spawn: { x: number; y: number; vx: number; vy: number; damage: number; life: number; owner: string; }
 *   enemy_bullet_spawn: { x: number; y: number; vx: number; vy: number; damage: number; heavy: boolean; }
 *   wave_started: { wave: number; total: number; }
 *   wave_cleared: { wave: number; }
 *   game_over: Record<string, never>;
 *   explosion: { x: number; y: number; radius: number; color: string; }
 */
export { EventBus, GameEventMap, EventType, EventCallback, GameEvent };
```

---

## 3. EntityFactory — фабрика сущностей

Файл: `src/game/ecs/EntityFactory.ts`

```typescript
import { Circle } from 'kinetics.ts';
import { World } from './World';
import { Entity } from './Entity';
import { Vec2 } from './math/Vec2';
import {
  TransformComponent,
  VelocityComponent,
  PhysicsComponent,
  RenderComponent,
} from './Component';
import type { EntityType, PhysicsEntityConfig } from './types';

/**
 * EntityFactory — создаёт сущности с полным набором компонентов.
 * Все позиции — через Vec2.
 *
 * NEW v3: вместо require() — import наверху файла (fix #8 из criticism_02.md).
 */
export class EntityFactory {
  constructor(private world: World) {}

  // ---- Helper: создать Entity + компоненты + привязка к physics ----

  private createBase(
    type: EntityType,
    x: number, y: number,
    config: PhysicsEntityConfig
  ): Entity {
    // Создать entity
    const entity = this.world.createEntity();
    
    // Добавить компоненты
    entity.addComponent({
      type: 'transform' as any,
      x, y, angle: 0,
    } as TransformComponent);
    
    entity.addComponent({
      type: 'velocity' as any,
      vx: 0, vy: 0,
    } as VelocityComponent);
    
    entity.addComponent({
      type: 'physics' as any,
      mass: config.mass,
      radius: config.radius,
      elasticity: config.elasticity ?? 0,
    } as PhysicsComponent);
    
    // RenderComponent
    entity.addComponent({
      type: 'render' as any,
      strokeColor: config.render?.strokeColor ?? '#FFFFFF',
      strokeWidth: config.render?.strokeWidth ?? 1,
      glowIntensity: config.render?.glowIntensity,
      glowColor: config.render?.glowColor,
    } as RenderComponent);
    
    // Привязка к physics
    const physicsEntity = this.createPhysicsCircle(entity, config);
    this.world.bindPhysicsEntity(entity, physicsEntity);
    
    return entity;
  }

  /** Создать физический Circle из kinetics.ts */
  private createPhysicsCircle(entity: Entity, config: PhysicsEntityConfig): any {
    // NEW v3: Circle импортирован сверху, НЕ require()
    const circle = new Circle({
      radius: config.radius,
      mass: config.mass,
      speed: config.speed ?? 0,
      elasticity: config.elasticity ?? 0,
      static: config.static ?? false,
      angularSpeed: config.angularSpeed ?? 0,
      rotate: config.rotate ?? true,
      form: {},
      hooks: {}, // hooks добавляются в конкретных фабричных методах
      render: config.render,
    }, {} as any);
    
    // Sync initial position from component
    const transform = entity.getComponent<TransformComponent>('transform');
    if (transform) {
      circle.position = { x: transform.x, y: transform.y };
    }
    
    return circle;
  }

  // ---- Конкретные фабрики ----

  /** Создать игрока */
  createPlayer(x: number, y: number): Entity {
    const entity = this.createBase('player', x, y, {
      radius: 12,
      mass: 10,
      render: {
        strokeColor: '#00BFFF',
        strokeWidth: 2,
        glowIntensity: 5,
        glowColor: '#00BFFF',
      },
    });
    
    return entity;
  }

  /** Создать врага */
  createEnemy(x: number, y: number, radius: number, kind: string): Entity {
    const mass = this.massForRadius(radius);
    const color = this.colorForKind(kind);
    
    return this.createBase('enemy', x, y, {
      radius,
      mass,
      render: {
        strokeColor: color,
        strokeWidth: 2,
        glowIntensity: 3,
        glowColor: color,
      },
    });
  }

  /** Создать пулю игрока */
  createBullet(x: number, y: number, vx: number, vy: number): Entity {
    const entity = this.createBase('bullet', x, y, {
      radius: 3,
      mass: 0.1,
      render: {
        strokeColor: '#FFD700',
        strokeWidth: 1,
        glowIntensity: 3,
        glowColor: '#FFD700',
      },
    });
    
    // Установить начальную скорость
    const vel = entity.getComponent<VelocityComponent>('velocity');
    vel!.vx = vx;
    vel!.vy = vy;
    
    return entity;
  }

  /** Создать пулю врага */
  createEnemyBullet(x: number, y: number, vx: number, vy: number, heavy = false): Entity {
    return this.createBase('enemyBullet', x, y, {
      radius: heavy ? 5 : 3,
      mass: heavy ? 0.5 : 0.1,
      render: {
        strokeColor: heavy ? '#FF4444' : '#FF8888',
        strokeWidth: heavy ? 2 : 1,
        glowIntensity: heavy ? 5 : 2,
        glowColor: '#FF4444',
      },
    });
  }

  /** Создать дрон союзника */
  createDrone(x: number, y: number): Entity {
    return this.createBase('drone', x, y, {
      radius: 8,
      mass: 0.5,
      render: {
        strokeColor: '#00BFFF',
        strokeWidth: 2,
        glowIntensity: 4,
        glowColor: '#00BFFF',
      },
    });
  }

  /** Создать мину */
  createMine(x: number, y: number): Entity {
    return this.createBase('mine', x, y, {
      radius: 10,
      mass: 0,
      static: true,
      angularSpeed: 0.3,
      rotate: true,
      render: {
        strokeColor: '#FF4444',
        strokeWidth: 2,
        glowIntensity: 3,
        glowColor: '#FF4444',
      },
    });
  }

  /** Создать астероид */
  createAsteroid(x: number, y: number, radius: number, vx: number, vy: number): Entity {
    const mass = this.massForRadius(radius);
    const entity = this.createBase('asteroid', x, y, {
      radius,
      mass,
      render: {
        strokeColor: '#888888',
        strokeWidth: 1,
        glowIntensity: 0,
      },
    });
    
    // Установить скорость
    const vel = entity.getComponent<VelocityComponent>('velocity');
    vel!.vx = vx;
    vel!.vy = vy;
    
    return entity;
  }

  /** Создать подъёмный предмет */
  createPickup(x: number, y: number, kind: string): Entity {
    return this.createBase('pickup', x, y, {
      radius: 12,
      mass: 0,
      static: true,
      angularSpeed: 0.5,
      rotate: true,
      render: {
        strokeColor: this.colorForPickupKind(kind),
        strokeWidth: 2,
        glowIntensity: 4,
        glowColor: this.colorForPickupKind(kind),
      },
    });
  }

  // ---- Helpers ----

  private massForRadius(radius: number): number {
    return Math.PI * radius * radius * 0.01; // density ~ 0.01
  }

  private colorForKind(kind: string): string {
    const colors: Record<string, string> = {
      drone: '#FF4444',
      hunter: '#FF8800',
      fighter: '#FF00FF',
      cruiser: '#00FF00',
      carrier: '#00FFFF',
    };
    return colors[kind] ?? '#FF4444';
  }

  private colorForPickupKind(kind: string): string {
    const colors: Record<string, string> = {
      health: '#00FF00',
      rate: '#FFFF00',
      gun: '#FF8800',
      drone: '#00BFFF',
      missile: '#00FF88',
      minerals: '#FFD700',
    };
    return colors[kind] ?? '#FFFFFF';
  }
}
```

---

## 4. SystemScheduler (NEW v3.1 from criticism_03.md)

Файл: `src/game/ecs/SystemScheduler.ts`

```typescript
import { System } from './Component';

/**
 * SystemScheduler — управление приоритетами выполнения систем.
 * Позволяет добавлять системы без изменения Game.
 * 
 * NEW v3.1 from criticism_03.md — fix #2.
 */
export interface ISystem {
  init?(): void;
  update(dt: number): void;
  destroy?(): void;
}

export class SystemScheduler {
  private systems: { system: ISystem; priority: number }[] = [];

  add(system: ISystem, priority: number): void {
    this.systems.push({ system, priority });
    this.systems.sort((a, b) => a.priority - b.priority);
  }

  update(dt: number): void {
    for (const { system } of this.systems) {
      system.update(dt);
    }
  }

  destroy(): void {
    for (const { system } of this.systems) {
      system.destroy?.();
    }
  }
}

export const Priorities = {
  INPUT: 0,
  AI: 10,
  PHYSICS_VELOCITY: 20,
  PHYSICS_KINETICS: 30,
  PHYSICS_SYNC: 40,
  COLLISIONS: 50,
  LIFECYCLE: 60,
  CLEANUP: 70,
  RENDER: 100,
} as const;
```

## 5. Удалить EntityPoolSystem

**Удалить:** `src/game/systems/EntityPoolSystem.ts`

**Причина:** kinetics.ts `System` уже управляет массивом сущностей через `addEntity()` / `removeEntity()`.
Используем `World.query()` вместо пула.

---

## 6. Критерии завершения этапа

1. ✅ `World` создан, управляет сущностями и физикой
2. ✅ `EntityFactory` создаёт все типы сущностей (без `require()`)
3. ✅ `World.query()` — эффективный, через пересечение Set
4. ✅ **NEW v3:** `World.findEntityById(id)` существует
5. ✅ **NEW v3:** `World.getEntityByPhysics(physicsEntity)` существует
6. ✅ **NEW v3:** `World.getPhysicsEntity(id)` существует для PhysicsSyncSystem
7. ✅ **NEW v3:** `componentIndex` для O(1) query per component type
8. ✅ **NEW v3.1:** `World.markForDestroy()` + `World.flushDestroy()` — deferred destruction
9. ✅ **NEW v3.1:** `SystemScheduler` с приоритетами
10. ✅ `EntityPoolSystem` удалён
11. ✅ Все типы определены в `EntityType`
12. ✅ EventBus — используем существующий типизированный из `src/game/core/EventBus.ts`
13. ✅ Компоненты содержат только данные
