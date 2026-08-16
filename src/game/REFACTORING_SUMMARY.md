# Архитектурный рефакторинг игры (SOLID + kinetics.ts)

## Обзор

Рефакторинг монолитного `game.ts` (~2500 строк God Object) в модульную SOLID-архитектуру с использованием физической библиотеки **kinetics.ts**.

---

## ✅ Завершенные компоненты (14 файлов, ~2100 строк)

### Core (3 файла)
| Файл | Строк | Описание |
|------|-------|----------|
| `core/EventBus.ts` | ~90 | Шина событий (pub/sub) для декуплинга систем |
| `core/GameState.ts` | ~260 | Централизованное хранилище состояния игры |
| `core/PhysicsSystem.ts` | ~220 | Обертка над kinetics.ts для физической симуляции |

### Entities (2 файла)
| Файл | Строк | Описание |
|------|-------|----------|
| `entities/Player.ts` | ~270 | Логика игрока: движение, стрельба, даш, дроны, мины |
| `entities/Enemy.ts` | ~130 | Сущность врага с методами takeDamage, integrate |

### AI System (6 файлов)
| Файл | Строк | Описание |
|------|-------|----------|
| `ai/IEnemyStrategy.ts` | ~25 | Интерфейс стратегии ИИ |
| `ai/GameContext.ts` | ~120 | Контекст для ИИ (позиции, зона, враги) |
| `ai/EnemyAI.ts` | ~140 | Фабрика и менеджер стратегий |
| `ai/strategies/DroneStrategy.ts` | ~60 | Роевое поведение (Boids-lite) |
| `ai/strategies/HunterStrategy.ts` | ~40 | Предсказание позиции игрока |
| `ai/strategies/FighterStrategy.ts` | ~75 | Орбитальное движение + атаки |

### Wave System (2 файла)
| Файл | Строк | Описание |
|------|-------|----------|
| `wave/ZoneManager.ts` | ~160 | Управление зоной: расширение, схлопывание, урон края |
| `wave/WaveManager.ts` | ~295 | Генерация волн, спавн врагов, подсчет убитых |

### Progression (1 файл)
| Файл | Строк | Описание |
|------|-------|----------|
| `progression/ScoreManager.ts` | ~175 | Очки, комбо, рекорды, события |

---

## 📋 Типы событий EventBus (17 типов)

```typescript
type EventType =
  | 'enemy_killed'         // Враг уничтожен
  | 'player_damaged'       // Игрок получил урон
  | 'player_healed'        // Игрок вылечен
  | 'zone_expanded'        // Зона расширилась
  | 'zone_collapsing'      // Зона начала схлопываться
  | 'wave_started'         // Волна началась
  | 'wave_cleared'         // Волна зачищена
  | 'pickup_collected'     // Бонус собран
  | 'enemy_spawned'        // Враг заспавнен
  | 'rift_spawned'         // Рифт появился
  | 'rift_closed'          // Рифт закрылся
  | 'asteroid_destroyed'   // Астероид разрушен
  | 'mine_detonated'       // Мина detonated
  | 'dash_activated'       // Даш активирован
  | 'game_over'            // Конец игры
  | 'score_changed'        // Счет изменился
  | 'enemy_fired'          // Враг выстрелил
  | 'physics_collision';   // Физическая коллизия (kinetics.ts)
```

---

## 🔧 PhysicsSystem (kinetics.ts интеграция)

### Создание физического тела
```typescript
const physics = new PhysicsSystem({ 
  width: 800, 
  height: 600, 
  eventBus 
});

// Создать круглое тело
physics.createCircle(
  'player-1',    // ID
  100, 100,      // Позиция
  15,            // Радиус
  1.0,           // Масса
  'player',      // Тип
  { hp: 100 },   // UserData
  false          // Static
);

// Обновить позицию
physics.setPosition('player-1', newX, newY);

// Обновить скорость
physics.setVelocity('player-1', vx, vy);

// Применить силу
physics.applyForce('player-1', fx, fy);

// Обновление в игровом цикле
physics.update(dt);
```

### Обработка коллизий
```typescript
eventBus.subscribe('physics_collision', (event) => {
  const { bodyA, bodyB, normal, depth } = event.payload;
  // Обработать столкновение
});
```

---

## 📊 Метрики рефакторинга

| Показатель | До | После | Улучшение |
|------------|----|-------|-----------|
| Файлов | 12 | 25 | +108% |
| Классов | 1 (God Object) | 15+ | +1400% |
| Coupling | Высокий | Низкий | ✅ |
| Testability | Нет | Высокая | ✅ |
| Строк в Game.ts | ~2500 | TBD | -90% (план) |

---

## 🏗️ Архитектура

```
src/game/
├── core/
│   ├── EventBus.ts          # Шина событий
│   ├── GameState.ts         # Состояние игры
│   └── PhysicsSystem.ts     # Физика (kinetics.ts)
├── entities/
│   ├── Player.ts            # Игрок
│   └── Enemy.ts             # Враг
├── ai/
│   ├── IEnemyStrategy.ts    # Интерфейс стратегии
│   ├── GameContext.ts       # Контекст для ИИ
│   ├── EnemyAI.ts           # Менеджер ИИ
│   └── strategies/
│       ├── DroneStrategy.ts    # Рой
│       ├── HunterStrategy.ts   # Охотник
│       └── FighterStrategy.ts  # Истребитель
├── wave/
│   ├── ZoneManager.ts       # Зона
│   └── WaveManager.ts       # Волны
├── progression/
│   └── ScoreManager.ts      # Очки и комбо
├── rendering/               # TODO
│   ├── SceneRenderer.ts
│   ├── EntityRenderer.ts
│   └── HUDRenderer.ts
├── systems/                 # TODO
│   ├── BulletSystem.ts
│   ├── PickupSystem.ts
│   └── MineSystem.ts
├── balance.ts               # Константы баланса
└── game.ts                  # Оркестратор (будет сокращен)
```

---

## 🎯 Принципы SOLID

| Принцип | Реализация |
|---------|------------|
| **SRP** | Каждый класс отвечает за одну задачу: враг, волна, ИИ, физика |
| **OCP** | Новый тип врага = новая стратегия, не трогая `EnemyAI` |
| **LSP** | Стратегии взаимозаменяемы через интерфейс `IEnemyStrategy` |
| **ISP** | Подсистемы подписываются только на нужные события через шину |
| **DIP** | Зависимости передаются через конструктор (EventBus, GameState) |

---

## 📝 Пример использования

### Инициализация систем
```typescript
const eventBus = new EventBus();
const gameState = new GameState();
const physics = new PhysicsSystem({ width: 800, height: 600, eventBus });
const player = new Player({ eventBus });
const enemyAI = new EnemyAI(eventBus);
const waveManager = new WaveManager(eventBus, gameState);
const zoneManager = new ZoneManager({ eventBus, state: gameState });
const scoreManager = new ScoreManager(eventBus);
```

### Игровой цикл
```typescript
update(dt: number) {
  // Обновление контекста
  gameContext.update(dt);
  
  // Игрок
  player.update(dt, inputDir, aimAngle);
  
  // Волны и спавн
  waveManager.update(dt, (kind, x, y) => createEnemy(kind, x, y));
  
  // Зона
  zoneManager.update(dt, player.x, player.y);
  
  // ИИ врагов
  enemyAI.updateEnemies(enemies, gameContext, dt);
  
  // Физика
  physics.update(dt);
  
  // Очки
  scoreManager.update(dt);
}
```

---

## ⏳ Следующие шаги

1. ✅ **PhysicsSystem** — интеграция kinetics.ts
2. ✅ **WaveManager** — логика волн и спавн врагов
3. ⏳ **BulletSystem / PickupSystem / MineSystem** — системы для сущностей
4. ⏳ **EntityRenderer / HUDRenderer** — отрисовка
5. ⏳ **DI Container** — управление зависимостями
6. ⏳ **Refactor Game.ts** — сокращение до ~150 строк оркестрации

---

## 📚 Документация по компонентам

### EventBus
Центральная шина событий для декуплинга систем. Системы публикуют и подписываются на события, не зная друг о друге.

### GameState
Единый источник истины для состояния игры. Содержит:
- `player` — состояние игрока
- `wave` — прогресс волны
- `zone` — параметры зоны
- `score` — очки и комбо
- `world` — массивы сущностей (враги, пули, бонусы и т.д.)

### PhysicsSystem
Обертка над kinetics.ts для:
- Создания физических тел (круги)
- Детекции коллизий через Spatial Hash Grid
- Интеграции с EventBus для событий столкновений

### EnemyAI + Strategies
Паттерн Strategy для ИИ врагов:
- `DroneStrategy` — роевое поведение с сепарацией
- `HunterStrategy` — предсказание позиции игрока
- `FighterStrategy` — орбитальное движение вокруг цели

---

*Документ обновлен: 2025-08-16*
