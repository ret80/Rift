# ECS Этап 01 — Инфраструктура, Vec2, Компоненты, GameSystem и ComponentFactory

> **v3.1:** Added ComponentFactory, System lifecycle hooks (from criticism_03.md).  
> **v3:** PhysicsSystem = velocity only (NO position updates).  
> **v2:** Entity = ID + container (NO god object).

---

## Цель

Создать базовый каркас ECS: собственный `Vec2`, систему компонентов, `Entity` (ID + контейнер), `GameSystem` (обёртка kinetics.ts) и `PhysicsSystem` (только velocity).

---

## 🔑 Ключевое архитектурное решение v3

**kinetics.ts = единственный источник правды для позиций и коллизий.**

```
Кадр:
  1. Input/AI Systems   → обновляют VelocityComponent
  2. PhysicsSystem      → модифицирует VelocityComponent (трение, ускорение, лимит)
  3. kinetics.ts.update()  → обновляет позиции физических сущностей
  4. PhysicsSyncSystem  → читает позиции из kinetics.ts → записывает в TransformComponent
```

**PhysicsSystem НЕ обновляет позицию.** Он ТОЛЬКО модифицирует VelocityComponent (ускорение, трение, лимит скорости).

---

## 1. Создание Vec2

Файл: `src/game/ecs/math/Vec2.ts`

```typescript
/**
 * Vec2 — собственный 2D вектор для всей игры.
 * Заменяет kinetics.ts Vector. ВСЕ координаты/скорости — через Vec2.
 */
export class Vec2 {
  constructor(public x: number, public y: number) {}

  // ---- Создание ----
  static zero(): Vec2 { return new Vec2(0, 0); }
  static fromXY(x: number, y: number): Vec2 { return new Vec2(x, y); }

  // ---- Копирование ----
  clone(): Vec2 { return new Vec2(this.x, this.y); }

  // ---- Мутация ----
  add(other: Vec2): Vec2 { this.x += other.x; this.y += other.y; return this; }
  sub(other: Vec2): Vec2 { this.x -= other.x; this.y -= other.y; return this; }
  mult(s: number): Vec2 { this.x *= s; this.y *= s; return this; }
  div(s: number): Vec2 { if (s !== 0) { this.x /= s; this.y /= s; } return this; }

  // ---- Нормализация ----
  mag(): number { return Math.sqrt(this.x * this.x + this.y * this.y); }

  normalize(): Vec2 {
    const m = this.mag();
    if (m > 0) { this.x /= m; this.y /= m; }
    return this;
  }

  // ---- Расстояние ----
  distanceTo(other: Vec2): number {
    const dx = this.x - other.x;
    const dy = this.y - other.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  // ---- Скалярное произведение ----
  dot(other: Vec2): number { return this.x * other.x + this.y * other.y; }

  // ---- Поворот на угол (радианы) ----
  rotate(angle: number): Vec2 {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = this.x * cos - this.y * sin;
    const ny = this.x * sin + this.y * cos;
    this.x = nx; this.y = ny;
    return this;
  }

  // ---- Ограничение длины ----
  limit(max: number): Vec2 {
    const m = this.mag();
    if (m > max && m > 0) { this.normalize().mult(max); }
    return this;
  }

  // ---- Фабрики (возвращают новый Vec2) ----
  scaled(s: number): Vec2 { return new Vec2(this.x * s, this.y * s); }

  static add(a: Vec2, b: Vec2): Vec2 { return new Vec2(a.x + b.x, a.y + b.y); }
  static sub(a: Vec2, b: Vec2): Vec2 { return new Vec2(a.x - b.x, a.y - b.y); }
  static multiply(v: Vec2, s: number): Vec2 { return new Vec2(v.x * s, v.y * s); }
  static distance(a: Vec2, b: Vec2): number { return a.distanceTo(b); }
  static direction(to: Vec2, from: Vec2): Vec2 { return Vec2.sub(to, from).normalize(); }
}
```

**Примеры использования:**

```typescript
// Позиция
const pos = Vec2.fromXY(0, 0);

// Направление к цели
const dir = Vec2.direction(targetPos, entityPos);

// Расстояние
const dist = Vec2.distance(playerPos, enemyPos);

// Вектор скорости = направление × скорость
const velocity = dir.scaled(speed);
```

---

## 2. kinetics.ts — только физика коллизий и позиций

Используем kinetics.ts (npm-пакет v1.4.x):

**Используем:**
- ✅ `System` — контейнер физических сущностей и коллизий
- ✅ `Circle` — физический круг (внутреннее использование)
- ✅ `CollisionResolver` — обнаружение столкновений (через `Collision.CollisionResolver`)
- ✅ `SpatialHashGrid` — пространственное хеширование (через `Collision.SpatialHashGrid`)

**НЕ используем kinetics.ts:**
- ❌ `Vector` — вместо него наш `Vec2`
- ❌ Рендеринг — кастомный WebGL (`src/game/render.ts`)
- ❌ Камера — `src/game/core/Camera.ts`

### Конфигурация System из kinetics.ts:

```typescript
import { System } from 'kinetics.ts';

const physics = new System({
  collisionInfo: { cellSize: 14 },  // размер ячейки SpatialHashGrid
  dimensions: { x: 4000, y: 4000 }, // границы мира
  tickRate: 60,
  friction: 0.0,    // в космосе нет трения
  gravity: 0,
  camera: { position: { x: 0, y: 0 }, zoom: 1 },
  render: { canvas },
});
```

---

## 3. Структура файлов

```
src/game/ecs/
├── index.ts                      # Экспорты
├── math/
│   └── Vec2.ts                   # ★ 2D вектор
├── GameSystem.ts                 # Обёртка над kinetics.ts System
├── Entity.ts                     # ★ ID + контейнер компонентов
├── Component.ts                  # Интерфейсы компонентов
├── World.ts                      # Центральный менеджер (этап 02)
├── EntityFactory.ts              # Фабрика сущностей (этап 02)
├── types.ts                      # Общие типы ECS (этап 02)
└── systems/
    ├── PhysicsSystem.ts          # ★ ТОЛЬКО VelocityComponent (ускорение, трение)
    ├── PhysicsSyncSystem.ts      # ★ SYNC: kinetics.ts → TransformComponent (этап 02)
    └── (другие системы — этапы 03+)
```

---

## 4. Создание Entity и Component

Файл: `src/game/ecs/Component.ts`

```typescript
/**
 * Component — интерфейс для всех компонентов ECS.
 * Компонент содержит ТОЛЬКО данные, НИКАКОЙ логики.
 */
export interface Component {
  readonly type: string;
}

/**
 * Entity — простой ID + контейнер компонентов.
 * НЕ содержит логики, НЕ содержит position/velocity напрямую.
 * Все данные — в компонентах.
 */
export class Entity {
  readonly id: number;
  private components = new Map<string, Component>();

  constructor(id: number) {
    this.id = id;
  }

  addComponent<T extends Component>(component: T): void {
    this.components.set(component.type, component);
  }

  removeComponent(type: string): boolean {
    return this.components.delete(type);
  }

  getComponent<T extends Component>(type: string): T | undefined {
    return this.components.get(type) as T | undefined;
  }

  hasComponent(type: string): boolean {
    return this.components.has(type);
  }

  getAllComponents(): Component[] {
    return Array.from(this.components.values());
  }
}
```

### Компоненты (этап 01 — определения интерфейсов):

```typescript
// ---- TransformComponent — позиция и ориентация ----
export interface TransformComponent extends Component {
  readonly type: 'transform';
  x: number;
  y: number;
  angle: number;
}

// ---- VelocityComponent — скорость ----
export interface VelocityComponent extends Component {
  readonly type: 'velocity';
  vx: number;
  vy: number;
}

// ---- PhysicsComponent — параметры физики (mass, radius, elasticity) ----
export interface PhysicsComponent extends Component {
  readonly type: 'physics';
  mass: number;
  radius: number;
  elasticity: number;
}

// ---- RenderComponent — визуальные параметры ----
export interface RenderComponent extends Component {
  readonly type: 'render';
  strokeColor: string;
  strokeWidth: number;
  glowIntensity?: number;
  glowColor?: string;
}
```

---

## 5. Создание GameSystem

Файл: `src/game/ecs/GameSystem.ts`

```typescript
import { System, Collision, Circle } from 'kinetics.ts';
import { Vec2 } from './math/Vec2';
import { Entity } from './Entity';

/**
 * GameSystem — обёртка над kinetics.ts System.
 * Управляет физическим миром и коллизиями.
 * Позиция камеры — через Vec2.
 */
export class GameSystem {
  private physics: System;
  private _cameraPos = Vec2.zero();
  private _cameraZoom = 1;
  private entityMap = new Map<number, any>(); // entity.id → physicsEntity

  constructor(canvas: HTMLCanvasElement) {
    this.physics = new System({
      collisionInfo: { cellSize: 14 },
      dimensions: { x: 4000, y: 4000 },
      tickRate: 60,
      friction: 0.0,
      gravity: 0,
      camera: { position: { x: 0, y: 0 }, zoom: 1 },
      render: { canvas },
    });
  }

  addPhysicsEntity(entityId: number, physicsEntity: any): void {
    this.physics.addEntity(physicsEntity);
    this.entityMap.set(entityId, physicsEntity);
  }

  removePhysicsEntity(entityId: number): void {
    const entity = this.entityMap.get(entityId);
    if (entity) {
      this.physics.removeEntity(entity);
      this.entityMap.delete(entityId);
    }
  }

  /** Обновить физику (kinetics.ts обновляет позиции) */
  update(dt: number): void {
    this.physics.update(dt);
  }

  getCameraPosition(): Vec2 {
    return this._cameraPos.clone();
  }

  setCameraPosition(pos: Vec2): void {
    this._cameraPos = pos.clone();
    this.physics.camera.position = { x: pos.x, y: pos.y };
  }

  setCameraZoom(zoom: number): void {
    this._cameraZoom = zoom;
    this.physics.camera.zoom = zoom;
  }

  getCameraZoom(): number {
    return this._cameraZoom;
  }

  getCollisionManager() {
    return this.physics.CollisionManager;
  }
}
```

---

## 6. Создание PhysicsSystem (ТОЛЬКО velocity — v3)

Файл: `src/game/ecs/systems/PhysicsSystem.ts`

```typescript
import { VelocityComponent } from '../Component';
import { Entity } from '../Entity';

/**
 * PhysicsSystem — ТОЛЬКО модификация VelocityComponent.
 * НЕ обновляет позицию! Позиции обновляет kinetics.ts.
 *
 * Здесь: ускорение, трение, лимит скорости.
 * Позиции → kinetics.update() → PhysicsSyncSystem → TransformComponent
 */
export class PhysicsSystem {
  /** Модифицировать VelocityComponent (ускорение/трение/лимит) */
  update(dt: number, entities: Entity[]): void {
    for (const entity of entities) {
      const velocity = entity.getComponent<VelocityComponent>('velocity');
      if (!velocity) continue;

      // Пример: применение трения
      const fr = Math.exp(-0.5 * dt);
      velocity.vx *= fr;
      velocity.vy *= fr;

      // Здесь могут быть другие модификации velocity (силы и т.д.)
    }
  }
}
```

---

## 7. PhysicsSyncSystem (будет реализован в этапе 02)

```typescript
import { TransformComponent } from '../Component';
import { Entity } from '../Entity';
import { World } from '../World';

/**
 * PhysicsSyncSystem — синхронизация kinetics.ts → TransformComponent.
 * Каждый кадр после kinetics.ts.update() читаем позиции из physics и записываем в компоненты.
 *
 * NEW v3: kinetics.ts = единственный источник правды для позиций.
 */
export class PhysicsSyncSystem {
  update(world: World): void {
    for (const entity of world.getAllEntities()) {
      const physicsEntity = world.getPhysicsEntity(entity.id);
      const transform = entity.getComponent<TransformComponent>('transform');
      if (physicsEntity && transform) {
        transform.x = physicsEntity.position.x;
        transform.y = physicsEntity.position.y;
      }
    }
  }
}
```

---

## 7.5 System Lifecycle Hooks (NEW v3.1 from criticism_03.md)

```typescript
/**
 * NEW v3.1: System interface with lifecycle hooks.
 * Allows SystemScheduler to manage system lifecycles.
 */
export interface System {
  init?(): void;
  update(dt: number): void;
  destroy?(): void;
}

// All systems implement this interface:
// - init() called once when system is registered
// - update(dt) called every frame
// - destroy() called when game shuts down
```

## 8. ComponentFactory (NEW v3.1 from criticism_03.md)

Файл: `src/game/ecs/ComponentFactory.ts`

```typescript
import {
  TransformComponent,
  VelocityComponent,
  HealthComponent,
  PhysicsComponent,
  RenderComponent,
} from './Component';

/**
 * ComponentFactory — единая точка создания компонентов.
 * Гарантирует, что все поля присутствуют и инициализированы.
 * 
 * NEW v3.1 from criticism_03.md — fix #1.
 */
export class ComponentFactory {
  static createTransform(x = 0, y = 0, angle = 0): TransformComponent {
    return { type: 'transform', x, y, angle };
  }

  static createVelocity(vx = 0, vy = 0): VelocityComponent {
    return { type: 'velocity', vx, vy };
  }

  static createHealth(hp: number, maxHp: number): HealthComponent {
    return { type: 'health', hp, maxHp };
  }

  static createPhysics(mass: number, radius: number, elasticity = 0): PhysicsComponent {
    return { type: 'physics', mass, radius, elasticity };
  }

  static createRender(
    strokeColor = '#FFFFFF',
    strokeWidth = 1,
    glowIntensity?: number,
    glowColor?: string
  ): RenderComponent {
    return { type: 'render', strokeColor, strokeWidth, glowIntensity, glowColor };
  }
}
```

## 9. Порядок каждого кадра (v3)

```typescript
// 1. Input System — читаем ввод → обновляем VelocityComponent
playerInputSystem.update(dt, player, inputX, inputY);

// 2. AI System — стратегии → обновляем VelocityComponent
enemyAISystem.update(dt, enemies, playerPos, enemyBullets);

// 3. PhysicsSystem — модифицируем VelocityComponent (трение, ускорение)
physicsSystem.update(dt, allVelocityEntities);

// 4. kinetics.ts — обновляет позиции физических сущностей
gameSystem.update(dt);

// 5. PhysicsSyncSystem — читаем позиции из kinetics → TransformComponent
physicsSyncSystem.update(world);

// 6. CollisionSystem — обрабатываем коллизии из kinetics
collisionSystem.processCollisions();

// 7. RenderSystem — рендерим по TransformComponent
renderSystem.render(world);
```

---

## 9. Критерии завершения этапа

1. ✅ `Vec2` создан со всеми методами
2. ✅ `Entity` — простой ID + контейнер компонентов (НИКАКОЙ логики)
3. ✅ Компоненты определены: `Transform`, `Velocity`, `Physics`, `Render`
4. ✅ `GameSystem` — обёртка над kinetics.ts System
5. ✅ `PhysicsSystem` — ТОЛЬКО velocity (НЕ позиция)
6. ✅ `PhysicsSyncSystem` определён (реализация в этапе 02)
7. ✅ Все координаты/скорости — через `Vec2`
8. ✅ Понятно: kinetics.ts = источник правды для позиций
9. ✅ Порядок каждого кадра: Input → AI → Physics(velocity) → kinetics(positions) → Sync → Collision → Render
10. ✅ **NEW v3.1:** System lifecycle hooks (init, update, destroy)
11. ✅ **NEW v3.1:** ComponentFactory для всех типов компонентов
