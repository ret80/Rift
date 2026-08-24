# План миграции на ECS — Обзор (v2, исправленный)

> **Версия 2:** Переработана в соответствии с архитектурной критикой.
> Ключевое изменение: Entity → контейнер компонентов, компоненты = чистые данные, системы = чистая логика.

---

## Критические архитектурные исправления

### 1. Entity ≠ God Object
**Было (проблема):** `Entity` содержит поля (`_hp`, `_guns`, `_rateMult`...) и методы (`moveBy`, `addVelocity`, `hit`).
**Стало:** `Entity` — простой ID + контейнер компонентов. Все данные в компонентах, вся логика в системах.

### 2. Компоненты = чистые данные
Компонент не содержит логики. Только данные:
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
      if (health && health.hp <= 0) {
        eventBus.emit('entity_died', { entity: e });
      }
    }
  }
}
```

### 4. Event-Driven коммуникация
Вместо прямых вызовов `enemy.damage(10)` → `DeathSystem.onDeath(enemy)`:
```typescript
eventBus.emit('damage_dealt', { target: enemy, amount: 10 });
eventBus.on('damage_dealt', ({ target, amount }) => { /* ... */ });
```

### 5. Типобезопасные мета-данные
```typescript
entity.setMeta<BulletMeta>('bullet', { damage: 10, life: 1.5 });
const meta = entity.getMeta<BulletMeta>('bullet'); // ✅ без cast
```

---

## Структура плана

| № | Файл | Описание | Ключевое изменение v2 |
|---|---|---|---|
| 01 | `ecs_01.md` | Vec2, GameSystem, Entity, Components | Entity = ID + контейнер, компоненты разделены |
| 02 | `ecs_02.md` | World, EntityFactory, Query | World хранит сущности по наборам компонентов |
| 03 | `ecs_03.md` | Player (компоненты + системы) | Player = Transform + Health + Weapons + Input компоненты |
| 04 | `ecs_04.md` | Враги + AI стратегии | Enemy = Transform + Health + AIState + Weapons компоненты |
| 05 | `ecs_05.md` | Пули и ракеты | Bullet = Transform + Velocity + Lifetime компоненты |
| 06 | `ecs_06.md` | Rift + SpawnSystem | Rift = Transform + SpawnQueue компоненты |
| 07 | `ecs_07.md` | CollisionSystem | Централизованная система коллизий, не hooks |
| 08 | `ecs_08.md` | Pickups | Pickup = Transform + Lifetime + Kind компоненты |
| 09 | `ecs_09.md` | Drones + Mines | Drone = Transform + Health + Orbit компоненты |
| 10 | `ecs_10.md` | Death + Score + Wave | Полностью через EventBus события |
| 11 | `ecs_11.md` | Render + Camera | RenderSystem читает компоненты для отрисовки |
| 12 | `ecs_12.md` | Asteroids | Asteroid = Transform + Velocity + Health + Shape компоненты |
| 13 | `ecs_13.md` | Game class | Game = только подписка на события и запуск систем |

---

## Ключевые решения

### Vec2 — собственный 2D вектор
`src/game/ecs/math/Vec2.ts` — заменяет kinetics.ts Vector. Используется везде для координат и скоростей.

### kinetics.ts — только физика коллизий
Используем `System` для обнаружения столкновений и `SpatialHashGrid` для оптимизации.
Не используем для: Vector, рендеринга, камеры.

### Event-Driven коммуникация
| Событие | Отправитель | Получатель |
|---------|-------------|------------|
| `damage_dealt` | CombatSystem | HealthSystem |
| `entity_died` | HealthSystem | DeathSystem, ScoringSystem, PickupDropSystem |
| `pickup_collected` | CollisionSystem | ApplyPickupSystem, ScoringSystem |
| `wave_cleared` | WaveSystem | SpawnSystem |
| `game_over` | HealthSystem | UI, ScoringSystem |

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

### Именование
Без префикса "Rift" — общие имена: `GameSystem`, `Entity`, `Vec2`.

### Сохранение абстракций
- ✅ EventBus — межсистемная связь
- ✅ FSM — управление состояниями
- ✅ Strategy Pattern — AI врагов (внутри EnemyAISystem)
- ✅ AudioEngine — синтез звука
- ✅ WebGL Renderer — wireframe + bloom

### НЕ переносится на ECS
- ❌ `Starfield` — фон
- ❌ `AudioEngine` — аудио
- ❌ `UI Screens` — React-компоненты

---

## Целевая архитектура

```
Game (thin container, ≤200 строк)
├── World (хранит сущности и компоненты)
│   └── GameSystem (обёртка kinetics.ts System)
├── Vec2 (математика)
├── Компоненты (чистые данные)
│   ├── TransformComponent { x, y, angle }
│   ├── VelocityComponent { vx, vy }
│   ├── HealthComponent { hp, maxHp }
│   ├── WeaponsComponent { guns, rateMult, fireCd }
│   ├── LifetimeComponent { life }
│   ├── AIStateComponent { kind, mode, cooldowns }
│   ├── RenderComponent { color, glow, strokeWidth }
│   ├── CollisionLayerComponent { layer }
│   ├── OrbitComponent { angle, radius, speed }
│   └── SpawnQueueComponent { queue, timer }
├── Системы (чистая логика)
│   ├── PhysicsSystem (move + velocity + friction)
│   ├── PlayerInputSystem (read input → velocity)
│   ├── PlayerCombatSystem (fire bullets via EventBus)
│   ├── EnemyAISystem (Strategy Pattern → velocity)
│   ├── EnemyCombatSystem (fire → EventBus)
│   ├── BulletLifecycleSystem (lifetime + homing)
│   ├── CollisionSystem (kinetics.ts → detect → EventBus)
│   ├── HealthSystem (handle damage/death via EventBus)
│   ├── DeathSystem (explosions + cleanup)
│   ├── ScoringSystem (score + combo via events)
│   ├── WaveSystem (wave management via events)
│   ├── SpawnSystem (spawn from rifts via events)
│   ├── PickupSystem (drop + collect via events)
│   ├── DroneSystem (orbit + aim + fire)
│   ├── MineSystem (fuse + explode)
│   ├── CameraSystem (smooth follow player)
│   ├── RenderSystem (read components → WebGL)
│   ├── RiftField (open/spawn/close rifts)
│   └── AsteroidField (spawn + split + cleanup)
└── EventBus (межсистемная связь)
```

---

## Порядок выполнения

1. `ecs_01.md` → Vec2 + Entity (ID + компоненты) + GameSystem
2. `ecs_02.md` → World + EntityFactory + Query
3. `ecs_03.md` → Player: компоненты + системы
4. `ecs_04.md` → Enemies: компоненты + AI стратегии
5. `ecs_05.md` → Bullets: компоненты + жизненный цикл
6. `ecs_06.md` → Rift + SpawnSystem через события
7. `ecs_07.md` → CollisionSystem централизованная
8. `ecs_08.md` → Pickups: компоненты + дроп + применение
9. `ecs_09.md` → Drones + Mines: компоненты + системы
10. `ecs_10.md` → Death + Score + Wave: EventBus
11. `ecs_11.md` → RenderSystem + CameraSystem
12. `ecs_12.md` → Asteroids: компоненты + системы
13. `ecs_13.md` → Game: подписка + запуск

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
