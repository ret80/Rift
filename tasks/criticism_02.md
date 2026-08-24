# Анализ переработанного плана ECS (v2)

## Общая оценка

План **значительно улучшен** по сравнению с v1. Ключевые архитектурные проблемы исправлены:

| Проблема v1 | Решение v2 | Статус |
|-------------|------------|--------|
| Entity как God Object | Entity = ID + контейнер компонентов | ✅ Исправлено |
| Смешение данных и логики | Компоненты = данные, Системы = логика | ✅ Исправлено |
| Размазанные коллизии | Централизованный CollisionSystem | ✅ Исправлено |
| Прямые вызовы | Event-Driven коммуникация | ✅ Исправлено |
| Game God Object | Game ≤ 200 строк | ✅ Исправлено |

**Оценка:** 8.5/10 — архитектурно правильный план.

---

## Критические проблемы (которые могут убить проект)

### 1. 🔴 **Отсутствие системы идентификации сущностей (Entity ID)**

**Проблема:** В `World` есть `nextId` и `entities: Map<number, Entity>`, но:
- `EventBus` передаёт `entityId`
- `DeathSystem` ищет сущность по ID
- В коде нет метода `findEntityById(id: number): Entity | undefined`

```typescript
// ecs_07.md — CollisionSystem
private findEntityByPhysics(physicsEntity: any): Entity | undefined {
  // В реальной реализации — поиск по World
  return undefined; // ⚠️ TODO
}

// ecs_08.md — ApplyPickupSystem
const pickup = findEntityById(payload.pickupId); // ⚠️ Не существует
```

**Решение:** Добавить в `World`:
```typescript
findEntityById(id: number): Entity | undefined {
  return this.entities.get(id);
}
```

---

### 2. 🔴 **Отсутствие синхронизации между Component и kinetics.ts**

**Проблема:** `PhysicsSystem` обновляет `TransformComponent`, но `kinetics.ts` не знает об этом. `kinetics.ts` управляет своей собственной физикой, и когда он обновляется, позиции в компонентах становятся неактуальными.

```typescript
// ecs_01.md — PhysicsSystem
transform.x += velocity.vx * dt;
transform.y += velocity.vy * dt;
// ⚠️ kinetics.ts ничего не знает об этом
```

В `GameSystem` есть `syncToPhysics`, но она вызывается только при добавлении компонента, а не каждый кадр.

**Решение:** Двусторонняя синхронизация:
```typescript
// После PhysicsSystem.update() — читать позиции из kinetics.ts
class PhysicsSyncSystem {
  update(world: World): void {
    for (const entity of world.getAllEntities()) {
      const physics = world.getPhysicsEntity(entity.id);
      const transform = entity.getComponent('transform');
      if (physics && transform) {
        transform.x = physics.position.x;
        transform.y = physics.position.y;
      }
    }
  }
}
```

---

### 3. 🔴 **Неясная ответственность PhysicsSystem**

**Проблема:** В `ecs_01.md` `PhysicsSystem` обновляет позицию, но:
- `kinetics.ts` уже обновляет позицию
- `GameSystem` тоже обновляет физику
- Кто из них "главный"?

```typescript
// GameSystem.update()
this.physics.update(dt);  // kinetics.ts обновляет позиции

// PhysicsSystem.update()
transform.x += velocity.vx * dt; // ⚠️ Дублирует кинематику
```

**Решение:** Чёткое разделение:
- **`kinetics.ts`** — ответственный за физику (коллизии, позиции)
- **`PhysicsSystem`** — только обновляет `VelocityComponent` (на основе сил)
- **`PhysicsSyncSystem`** — синхронизирует `kinetics.ts` → `TransformComponent`

---

### 4. 🟠 **EventBus — отсутствие строгой типизации**

**Проблема:** Все события используют `payload: Record<string, unknown>`.

```typescript
// ecs_10.md
this.eventBus.publish({
  type: 'damage_dealt',
  payload: {
    targetId: enemy.id,
    amount: dmg,
    source: 'player_bullet', // ⚠️ string, не enum
  },
});
```

Это ведёт к:
- Ошибкам в рантайме
- Невозможности автодополнения
- Трудностям рефакторинга

**Решение:** Типизированные события:
```typescript
type GameEventMap = {
  'damage_dealt': { targetId: number; amount: number; source: 'player' | 'enemy' | 'mine' };
  'entity_died': { entityId: number; kind?: string };
  'enemy_died': { entityId: number; scoreValue: number; kind: string; x: number; y: number };
  // ...
};

class TypedEventBus {
  publish<T extends keyof GameEventMap>(type: T, payload: GameEventMap[T]): void;
  subscribe<T extends keyof GameEventMap>(type: T, handler: (payload: GameEventMap[T]) => void): void;
}
```

---

### 5. 🟠 **CollisionSystem зависит от `World`, но `World` не предоставляет API**

```typescript
// ecs_07.md — CollisionSystem
private findEntityByPhysics(physicsEntity: any): Entity | undefined {
  // В реальной реализации — поиск по World
  return undefined;
}
```

**Решение:** Добавить в `World`:
```typescript
getEntityByPhysics(physicsEntity: any): Entity | undefined;
getPhysicsEntity(entityId: number): any | undefined;
```

---

### 6. 🟠 **Бесконечный цикл между `PhysicsSystem` и `kinetics.ts`**

```
kinetics.ts.update() → обновляет позиции
         ↓
PhysicsSystem.update() → обновляет позиции
         ↓
kinetics.ts.update() → позиции снова обновлены
```

**Решение:** Только один источник правды для позиций — `kinetics.ts`. `PhysicsSystem` обновляет только `VelocityComponent`.

---

## Второстепенные проблемы

### 7. 🟡 **Query API неэффективен**

```typescript
// ecs_02.md
query(...componentTypes: string[]): Entity[] {
  const results: Entity[] = [];
  for (const entity of this.entities.values()) {
    if (componentTypes.every(type => entity.hasComponent(type))) {
      results.push(entity);
    }
  }
  return results;
}
```

**Проблема:** O(n) сканирование всех сущностей каждый кадр. Для 1000+ сущностей — медленно.

**Решение:** Хранить массив сущностей по каждому компоненту:
```typescript
// World
private componentIndex = new Map<string, Set<Entity>>();

addComponent(entity: Entity, component: Component): void {
  entity.addComponent(component);
  if (!this.componentIndex.has(component.type)) {
    this.componentIndex.set(component.type, new Set());
  }
  this.componentIndex.get(component.type)!.add(entity);
}

query(...types: string[]): Entity[] {
  // Пересечение множеств
  let result: Set<Entity> | null = null;
  for (const type of types) {
    const set = this.componentIndex.get(type);
    if (!set) return [];
    result = result ? intersection(result, set) : new Set(set);
  }
  return result ? Array.from(result) : [];
}
```

---

### 8. 🟡 **EntityFactory.createBase() — `require('kinetics.ts')` внутри**

```typescript
// ecs_02.md
private createPhysicsCircle(entity: Entity, config: any): any {
  const { Entity as KineticsEntity, Circle } = require('kinetics.ts');
  // ⚠️ require() в TypeScript-модуле
}
```

**Решение:** Импортировать наверху:
```typescript
import { Entity as KineticsEntity, Circle } from 'kinetics.ts';
```

---

### 9. 🟡 **Отсутствие Pooling для пуль**

**Проблема:** Пули создаются и уничтожаются десятками в секунду, создавая нагрузку на GC.

**Решение:** `BulletPool`:
```typescript
class BulletPool {
  private pool: Entity[] = [];
  
  acquire(x: number, y: number, vx: number, vy: number): Entity {
    const entity = this.pool.pop() ?? this.factory.createBullet(x, y, 0, 0);
    // Переиспользовать с новыми параметрами
    return entity;
  }
  
  release(entity: Entity): void {
    this.pool.push(entity);
  }
}
```

---

### 10. 🟡 **Нет системы отладки**

**Проблема:** Трудно отлаживать ECS-приложения.

**Решение:** Добавить `DebugSystem`:
```typescript
class DebugSystem {
  render(world: World, renderer: Renderer): void {
    for (const entity of world.getAllEntities()) {
      // Рисовать bounding box
      // Показывать компоненты
    }
  }
}
```

---

## Сравнение v1 vs v2

| Аспект | v1 | v2 |
|--------|----|----|
| Entity | God Object | ID + Container |
| Компоненты | Внутри Entity | Отдельные data-классы |
| Системы | Смешаны с Entity | Чистая логика |
| Коллизии | В hooks | Централизованный CollisionSystem |
| Коммуникация | Прямые вызовы | EventBus |
| Game class | 1100 строк | ≤200 строк |
| Архитектура | Псевдо-ECS | Чистый ECS |
| **Оценка** | **6/10** | **8.5/10** |

---

## Что пропущено

### ✅ Присутствует:
- [x] Vec2
- [x] Entity как контейнер
- [x] Компоненты как данные
- [x] Системы как логика
- [x] EventBus
- [x] CollisionSystem
- [x] CameraSystem
- [x] RenderSystem
- [x] AI Strategy Pattern
- [x] SpawnSystem
- [x] WaveSystem
- [x] Pickups
- [x] Drones & Mines
- [x] Asteroids

### ❌ Отсутствует:
- [ ] **System с приоритетами** (порядок выполнения важен)
- [ ] **ECS Scheduler** (фиксированный порядок систем)
- [ ] **System групп** (PrePhysics, Physics, PostPhysics, Render)
- [ ] **Pooling** (для пуль, частиц)
- [ ] **DebugSystem**
- [ ] **Profiling** (время выполнения систем)
- [ ] **Snapshot/Serialization** (для сохранения)
- [ ] **Replay** (для отладки)
- [ ] **Batch-операции** (для рендера)

---

## Итоговый вердикт

| Критерий | Оценка | Комментарий |
|----------|--------|-------------|
| Архитектура | 8.5/10 | Правильный ECS, но есть технические долги |
| Документация | 9/10 | Исчерпывающая, детальная |
| План | 8/10 | Хороший, но требует уточнений |
| Рентабельность | 7/10 | Большой объём, но качественный результат |
| **Общая** | **8.5/10** | **План готов к реализации с доработками** |

---

## Критические доработки (до начала)

1. **Добавить `World.findEntityById(id)`** — иначе системы не найдут сущности
2. **Чётко определить кто управляет позицией** — `kinetics.ts` или `PhysicsSystem`
3. **Добавить синхронизацию** `kinetics.ts` ↔ `TransformComponent`
4. **Типизировать EventBus** — убрать `Record<string, unknown>`
5. **Добавить World.getEntityByPhysics()** — для CollisionSystem

---

## Рекомендации по реализации

1. **Начать с `World.findEntityById()`** — без этого ничего не работает
2. **Прототипировать синхронизацию с kinetics.ts** — до начала всех этапов
3. **Добавить типизированный EventBus** — спасёт от ошибок рантайма
4. **Использовать `Set` для query** — для производительности
5. **Добавить DebugSystem** — облегчит отладку

План **хороший** и **рабочий**. С указанными доработками — **отличный**.