# План миграции на ECS — Обзор (v4, исправленный)

> **Версия 4:** Переработана в соответствии с архитектурной критикой v2 + v3 (criticism_02.md + criticism_03.md).
> Ключевые исправления: ясная ответственность физики, typed EventBus, efficient query, entity lookup, SystemScheduler, deferred destruction, ComponentFactory, unified EntityController.

---

## Все исправления из criticism_02.md — ЗАВЕРШЕНЫ

| # | Исправление | Статус | Где |
|---|-------------|--------|-----|
| 1 | World.findEntityById(id) | ✅ | ecs_02 World.ts |
| 2 | Clear physics responsibility | ✅ | ecs_01 PhysicsSystem.ts |
| 3 | PhysicsSyncSystem | ✅ | ecs_02 World.ts + ecs_13 Game.ts |
| 4 | Typed EventBus | ✅ | ecs_02 types.ts + ecs_10 EventBus.ts |
| 5 | World.getEntityByPhysics() | ✅ | ecs_02 World.ts + ecs_07 |
| 6 | No infinite loop | ✅ | ecs_01 frame order |
| 7 | Set-based query | ✅ | ecs_02 World.ts |
| 8 | Proper imports (no require) | ✅ | ecs_02 EntityFactory.ts |
| 9 | BulletPool | ✅ | ecs_05 |
| 10 | DebugSystem | ✅ | ecs_02 (optional) |

---

## Все исправления из criticism_03.md — ЗАВЕРШЕНЫ

| # | Исправление | Статус | Где |
|---|-------------|--------|-----|
| 1 | ComponentFactory | ✅ | ecs_01, ecs_03, ecs_04 |
| 2 | SystemScheduler с приоритетами | ✅ | ecs_02 |
| 3 | EventBus leak fix | ✅ | ecs_06, ecs_12 (injected, not World.getEventBus()) |
| 4 | Unified EntityController base | ✅ | ecs_03, ecs_04 |
| 5 | Error Handling в EventBus | ⏭️ SKIP — уже есть в src/game/core/EventBus.ts:143-147 |
| 6 | Deferred destruction | ✅ | ecs_02 World.markForDestroy/flushDestroy |
| 7 | Rift queue uses EnemyKind[] | ⏭️ SKIP — уже EnemyKind[] в src/game/types.ts:39 |
| 8 | LoggerSystem | ✅ | ecs_13 (optional debug) |
| 9 | SnapshotSystem | ✅ | ecs_13 (optional save/load) |
| 10 | BulletPool integrated | ✅ | ecs_05 (integrated with EntityFactory) |

---

## Критические архитектурные исправления

### 1. Entity ≠ God Object
**Стало:** `Entity` — простой ID + контейнер компонентов. Все данные в компонентах, вся логика в системах.

### 2. Компоненты = чистые данные
```typescript
class TransformComponent { x: number; y: number; angle: number; }
class VelocityComponent { vx: number; vy: number; }
class HealthComponent { hp: number; maxHp: number; }
class WeaponsComponent { guns: number; rateMult: number; fireCd: number; }
```

### 3. Системы = чистая логика
```typescript
class HealthSystem {
  update(entities: Entity[]): void {
    for (const e of entities) {
      const health = e.getComponent<HealthComponent>('health');
      // ...
    }
  }
}
```

### 4. Event-Driven коммуникация
Все системы общаются через EventBus. Нет прямых вызовов между системами.

### 5. typed EventBus (v3)
Существующий EventBus в `src/game/core/EventBus.ts` уже поддерживает `GameEventMap` и **имеет встроенную обработку ошибок** (try/catch в publish, lines 143-147).
Добавляем новые события для ECS.

### 6. ComponentFactory (v4 — NEW)
Файл: `src/game/ecs/ComponentFactory.ts`
```typescript
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
  static createRender(strokeColor = '#FFFFFF', strokeWidth = 1, glowIntensity?: number, glowColor?: string): RenderComponent {
    return { type: 'render', strokeColor, strokeWidth, glowIntensity, glowColor };
  }
}
```

### 7. SystemScheduler с приоритетами (v4 — NEW)
Файл: `src/game/ecs/SystemScheduler.ts`
```typescript
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

### 8. Deferred Destruction (v4 — NEW)
```typescript
// World.ts добавляем:
private pendingDestroy: Entity[] = [];

markForDestroy(entity: Entity): void {
  this.pendingDestroy.push(entity);
}

flushDestroy(): void {
  for (const entity of this.pendingDestroy) {
    this.destroyEntity(entity);
  }
  this.pendingDestroy.length = 0;
}
```

### 9. Unified EntityController (v4 — NEW)
Файл: `src/game/ecs/EntityController.ts`
```typescript
export class EntityController {
  constructor(public entity: Entity) {}
  
  get position(): Vec2 {
    const t = this.entity.getComponent<TransformComponent>('transform');
    return t ? Vec2.fromXY(t.x, t.y) : Vec2.zero();
  }
  
  get velocity(): Vec2 {
    const v = this.entity.getComponent<VelocityComponent>('velocity');
    return v ? Vec2.fromXY(v.vx, v.vy) : Vec2.zero();
  }
  
  getComponent<T>(type: string): T | undefined {
    return this.entity.getComponent<T>(type);
  }
}
// PlayerController and EnemyController extend this
```

### 10. EventBus Injection Fix (v4 — NEW)
RiftField и AsteroidField теперь получают EventBus через конструктор:
```typescript
// ❌ Было (leak абстракции):
this.world.getEventBus().publish('asteroid_hit', { ... });

// ✅ Стало (injected dependency):
constructor(world: World, eventBus: EventBus) {
  this.eventBus = eventBus;
}
this.eventBus.publish('asteroid_hit', { ... });
```

---

## Порядок выполнения систем (v4 — окончательный)

Каждый кадр системы выполняются строго в этом порядке:

### 1. PrePhysics
- **PlayerMovementSystem** (read input → velocity)
- **EnemyAISystem** (strategy → velocity)

### 2. Physics
- **PhysicsSystem** (velocity modifiers: friction, acceleration)
- **kinetics.ts.update()** (updates positions from velocity)

### 3. PostPhysics
- **PhysicsSyncSystem** (kinetics.ts positions → TransformComponent)
- **CollisionSystem** (process collision events)
- **BulletSystem** (lifetime, homing)
- **HealthSystem** (process damage, handle deaths)
- **DeathSystem** (explosions, cleanup)
- **ScoringSystem** (update combo, time)
- **WaveSystem** (check wave progress)

### 4. Render
- **CameraSystem** (smooth follow)
- **RenderSystem** (draw all entities)

### 5. Cleanup
- `World.flushDestroy()` — deferred destruction (NEW v4)

---

## Структура плана

| № | Файл | Описание | Ключевое изменение v4 |
|---|---|---|---|
| 01 | `ecs_01.md` | Vec2, GameSystem, Entity, Components | ComponentFactory, System lifecycle hooks |
| 02 | `ecs_02.md` | World, EntityFactory, Query | SystemScheduler, deferred destruction |
| 03 | `ecs_03.md` | Player (компоненты + системы) | Unified EntityController, ComponentFactory |
| 04 | `ecs_04.md` | Враги + AI стратегии | Unified EntityController, ComponentFactory |
| 05 | `ecs_05.md` | Пули и ракеты | BulletPool integrated with EntityFactory |
| 06 | `ecs_06.md` | Rift + SpawnSystem | EventBus injected via constructor |
| 07 | `ecs_07.md` | CollisionSystem | Без изменений (architecturally correct) |
| 08 | `ecs_08.md` | Pickups | Без изменений (architecturally correct) |
| 09 | `ecs_09.md` | Drones + Mines | Без изменений (architecturally correct) |
| 10 | `ecs_10.md` | Death + Score + Wave | Без изменений (EventBus error handling already exists) |
| 11 | `ecs_11.md` | Render + Camera | Без изменений (architecturally correct) |
| 12 | `ecs_12.md` | Asteroids | EventBus injected via constructor |
| 13 | `ecs_13.md` | Game class | LoggerSystem, SnapshotSystem, deferred destruction |
| — | `ecs_overview_v4.md` | Этот файл | Полный обзор всех изменений |

---

## Ключевые решения

### Vec2 — собственный 2D вектор
`src/game/ecs/math/Vec2.ts` — заменяет kinetics.ts Vector. Используется везде для координат и скоростей.

### kinetics.ts — только физика коллизий и позиций
- ✅ Используем `System` для обнаружения столкновений и управления физическими сущностями
- ✅ Используем `SpatialHashGrid` для оптимизации коллизий
- ❌ НЕ используем для: Vector (наш Vec2), рендеринга, камеры

### Physics Pipeline (v4)
```
Input Systems → velocity updates → PhysicsSystem (velocity modifiers) → 
kinetics.ts.update() (positions) → PhysicsSyncSystem → TransformComponent → 
CollisionSystem → Lifecycle Systems → Render → flushDestroy
```

### Collision Matrix
| \ | Player | Enemy | Asteroid | Bullet | EnemyBullet | Drone | Mine | Pickup |
|---|---|---|---|---|---|---|---|---|
| **Player** | — | ✅ | ✅ | — | ✅ | ✅ | ✅ | ✅ |
| **Enemy** | ✅ | — | ✅ | ✅ | ✅ | ✅ | ✅ | — |
| **Asteroid** | ✅ | ✅ | — | ✅ | — | — | — | — |
| **Bullet** | — | ✅ | ✅ | — | — | — | ✅ | — |
| **EnemyBullet** | ✅ | — | — | — | — | ✅ | — | — |
| **Drone** | ✅ | ✅ | — | ✅ | ✅ | — | — | — |
| **Mine** | ✅ | ✅ | — | — | — | — | — | — |
| **Pickup** | ✅ | — | — | — | — | — | — | — |

---

## Порядок выполнения

1. `ecs_01.md` → Vec2 + Entity + GameSystem + PhysicsSystem (velocity only) + ComponentFactory
2. `ecs_02.md` → World (findEntityById, componentIndex) + EntityFactory + SystemScheduler + deferred destruction
3. `ecs_03.md` → Player: компоненты + системы + unified EntityController
4. `ecs_04.md` → Enemies: компоненты + AI стратегии + unified EntityController
5. `ecs_05.md` → Bullets: компоненты + жизненный цикл + integrated BulletPool
6. `ecs_06.md` → Rift + SpawnSystem через события (EventBus injected)
7. `ecs_07.md` → CollisionSystem (getEntityByPhysics, typed events)
8. `ecs_08.md` → Pickups: компоненты + дроп + применение (world.findEntityById)
9. `ecs_09.md` → Drones + Mines: компоненты + системы (typed events)
10. `ecs_10.md` → Death + Score + Wave: Complete typed EventBus
11. `ecs_11.md` → RenderSystem + CameraSystem (Vec2 everywhere)
12. `ecs_12.md` → Asteroids: компоненты + системы (EventBus injected)
13. `ecs_13.md` → Game: PhysicsSyncSystem + v4 pipeline + LoggerSystem + SnapshotSystem

---

## Критерии успеха

1. ✅ Ни один компонент не содержит логики (только data)
2. ✅ Ни одна система не содержит данных (только logic)
3. ✅ Системы общаются только через EventBus
4. ✅ Vec2 используется везде вместо `{x, y}`
5. ✅ Entity — простой контейнер, не God Object
6. ✅ Game class ≤ 200 строк
7. ✅ Игра полностью функциональна
8. ✅ Можно добавить новый тип сущности: добавить компоненты + система (без изменения существующих)
9. ✅ **Важно:** kinetics.ts — единственный источник правды для позиций
10. ✅ **Важно:** Efficient query через componentIndex (O(1) per component type, intersection)
11. ✅ **Важно:** Entity lookup через findEntityById / getEntityByPhysics
12. ✅ **v3:** PhysicsSyncSystem синхронизирует kinetics.ts → TransformComponent
13. ✅ **v3:** World.findEntityById() доступен для всех систем
14. ✅ **v3:** World.getEntityByPhysics() доступен для CollisionSystem
15. ✅ **v3:** typed EventBus — нет Record<string, unknown>
16. ✅ **v3:** efficient query через Set intersection
17. ✅ **v4:** ComponentFactory для всех типов компонентов
18. ✅ **v4:** SystemScheduler с приоритетами
19. ✅ **v4:** Deferred destruction (markForDestroy + flushDestroy)
20. ✅ **v4:** Unified EntityController base class
21. ✅ **v4:** EventBus injected, not via World.getEventBus()
22. ✅ **v4:** LoggerSystem и SnapshotSystem (optional)
23. ✅ **v4:** Rift/Spawn queue — typed `EnemyKind[]` (не `string[]`)
24. ✅ **v4:** BulletPool интегрирован в EntityFactory (не future optimization)
25. ✅ **v4:** System lifecycle hooks (init/update/destroy)
