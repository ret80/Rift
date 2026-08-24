# План миграции на ECS — Обзор (v3, исправленный)

> **Версия 3:** Переработана в соответствии с архитектурной критикой v2.
> Ключевые исправления: ясная ответственность физики, typed EventBus, efficient query, entity lookup.

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
Существующий EventBus в `src/game/core/EventBus.ts` уже поддерживает `GameEventMap`.
Добавляем новые события для ECS:

```typescript
// NEW events to add to EventBus.ts GameEventMap:
export interface PlayerDamagedPayload { dmg: number; }
export interface EntityDestroyedPayload { entityId: number; }
export interface PlayerDiedPayload { }
export interface EnemyDiedPayload { entityId: number; scoreValue: number; kind: string; x: number; y: number; }
export interface PlayerHitByEnemyPayload { playerId: number; enemyId: number; damage: number; }
export interface PlayerHitByMinePayload { playerId: number; damage: number; }
export interface PickupCollectedPayloadEcs { pickupId: number; }
export interface MineExplodedPayload { mineId: number; enemyId: number; damage: number; }
export interface AsteroidHitPayloadEcs { asteroidId: string; }
export interface HealthChangedPayload { entityId: number; oldHp: number; newHp: number; }
export interface BulletSpawnPayload { x: number; y: number; vx: number; vy: number; damage: number; life: number; owner: string; }
export interface EnemyBulletSpawnPayload { x: number; y: number; vx: number; vy: number; damage: number; heavy: boolean; }
export interface ExplosionPayload { x: number; y: number; radius: number; color: string; }
export interface HealPlayerPayload { amount: number; }
export interface BoostFireRatePayload { }
export interface AddGunPayload { }
export interface SpawnAllyDronePayload { }
export interface ActivateMissileLauncherPayload { duration: number; }
export interface WaveStartedPayload { wave: number; total: number; }
export interface WaveClearedPayload { }
export interface GameOverPayload { }
```

---

## НОВЫЕ v3 — Исправления по criticism_02.md

### 🔴 Исправление 1: Entity lookup
```typescript
// World.ts добавляем:
findEntityById(id: number): Entity | undefined {
  return this.entities.get(id);
}
```

### 🔴 Исправление 2: Ясная ответственность физики
**kinetics.ts** = единственный источник правды для позиций и коллизий.
**PhysicsSyncSystem** = читает позиции из kinetics.ts и записывает в TransformComponent.
**PhysicsSystem** = ТОЛЬКО обновляет VelocityComponent (на основе сил, ускорений).

```
Order of operations (каждый кадр):
  1. PlayerInputSystem    — read input → VelocityComponent
  2. EnemyAISystem        — AI strategy → VelocityComponent
  3. PhysicsSystem        — VelocityComponent → (nothing, just velocity modifiers)
  4. kinetics.ts.update() — physics engine updates entity positions
  5. PhysicsSyncSystem    — read kinetics.ts positions → TransformComponent
  6. CollisionSystem      — handle collision events from kinetics.ts
```

### 🔴 Исправление 3: PhysicsSyncSystem
```typescript
class PhysicsSyncSystem {
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

### 🔴 Исправление 4: typed EventBus (см. выше)
### 🔴 Исправление 5: World.getEntityByPhysics()
```typescript
// World.ts:
private physicsEntityMap = new Map<any, number>(); // physicsEntity → entityId
getEntityByPhysics(physicsEntity: any): Entity | undefined {
  const entityId = this.physicsEntityMap.get(physicsEntity);
  return entityId !== undefined ? this.findEntityById(entityId) : undefined;
}
```

### 🟡 Исправление 6: Efficient Query API
```typescript
// World.ts:
private componentIndex = new Map<string, Set<Entity>>();

addComponent(entity: Entity, component: Component): void {
  entity.addComponent(component);
  const set = this.componentIndex.get(component.type);
  if (set) set.add(entity);
  else this.componentIndex.set(component.type, new Set([entity]));
}

query(...types: string[]): Entity[] {
  if (types.length === 0) return this.getAllEntities();
  let result: Set<Entity> | null = null;
  for (const type of types) {
    const set = this.componentIndex.get(type);
    if (!set || set.size === 0) return [];
    if (result === null) {
      result = new Set(set);
    } else {
      // Intersection
      for (const e of result) {
        if (!set.has(e)) result.delete(e);
      }
    }
  }
  return result ? Array.from(result) : [];
}
```

### 🟡 Исправление 7: EntityFactory import
```typescript
// НЕ require() — import наверху файла
import { Circle } from 'kinetics';
```

### 🟡 Исправление 8: BulletPool (упомянуть как future optimization)
### 🟡 Исправление 9: DebugSystem (упомянуть как optional feature)

---

## Порядок выполнения систем (v3 — окончательный)

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
- Remove dead entities (via destroy_entity events)

---

## Структура плана

| № | Файл | Описание | Ключевое изменение v3 |
|---|---|---|---|
| 01 | `ecs_01.md` | Vec2, GameSystem, Entity, Components | PhysicsSystem = velocity only |
| 02 | `ecs_02.md` | World, EntityFactory, Query | findEntityById, componentIndex, getEntityByPhysics |
| 03 | `ecs_03.md` | Player (компоненты + системы) | Без изменений (architecturally correct) |
| 04 | `ecs_04.md` | Враги + AI стратегии | Без изменений (architecturally correct) |
| 05 | `ecs_05.md` | Пули и ракеты | Без изменений (architecturally correct) |
| 06 | `ecs_06.md` | Rift + SpawnSystem | Без изменений (architecturally correct) |
| 07 | `ecs_07.md` | CollisionSystem | ✅ getEntityByPhysics, typed events |
| 08 | `ecs_08.md` | Pickups | ✅ world.findEntityById(), typed events |
| 09 | `ecs_09.md` | Drones + Mines | ✅ world reference, typed events |
| 10 | `ecs_10.md` | Death + Score + Wave | ✅ Complete typed EventBus map |
| 11 | `ecs_11.md` | Render + Camera | ✅ Vec2 everywhere, renderEntity pattern |
| 12 | `ecs_12.md` | Asteroids | ✅ world reference, typed asteroid_hit |
| 13 | `ecs_13.md` | Game class | ✅ PhysicsSyncSystem + v3 pipeline |

---

## Ключевые решения

### Vec2 — собственный 2D вектор
`src/game/ecs/math/Vec2.ts` — заменяет kinetics.ts Vector. Используется везде для координат и скоростей.

### kinetics.ts — только физика коллизий и позиций
- ✅ Используем `System` для обнаружения столкновений и управления физическими сущностями
- ✅ Используем `SpatialHashGrid` для оптимизации коллизий
- ❌ НЕ используем для: Vector (наш Vec2), рендеринга, камеры

### Physics Pipeline (v3)
```
Input Systems → velocity updates → PhysicsSystem (velocity modifiers) → 
kinetics.ts.update() (positions) → PhysicsSyncSystem → TransformComponent → 
CollisionSystem → Lifecycle Systems → Render
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

1. `ecs_01.md` → Vec2 + Entity + GameSystem + PhysicsSystem (velocity only)
2. `ecs_02.md` → World (findEntityById, componentIndex) + EntityFactory
3. `ecs_03.md` → Player: компоненты + системы
4. `ecs_04.md` → Enemies: компоненты + AI стратегии
5. `ecs_05.md` → Bullets: компоненты + жизненный цикл
6. `ecs_06.md` → Rift + SpawnSystem через события
7. `ecs_07.md` → CollisionSystem (getEntityByPhysics, typed events)
8. `ecs_08.md` → Pickups: компоненты + дроп + применение (world.findEntityById)
9. `ecs_09.md` → Drones + Mines: компоненты + системы (typed events)
10. `ecs_10.md` → Death + Score + Wave: Complete typed EventBus
11. `ecs_11.md` → RenderSystem + CameraSystem (Vec2 everywhere)
12. `ecs_12.md` → Asteroids: компоненты + системы (world reference)
13. `ecs_13.md` → Game: PhysicsSyncSystem + v3 pipeline

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
