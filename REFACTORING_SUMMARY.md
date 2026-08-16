# Архитектурная декомпозиция Game.ts (God Object → SOLID)

## Проблема
Исходный `game.ts` (~2500 строк) нарушал все принципы SOLID:
- **S** — управлял игрой, рендерингом, физикой, ИИ, зонами, волнами, музыкой, вводом
- **O** — добавление нового типа врага требовало правки 10+ мест
- **L** — подклассы невозможны из-за жесткой связанности
- **I** — интерфейс `Hooks` перегружен 7 методами
- **D** — прямое создание зависимостей (`Renderer`, `AudioEngine`, etc.)

## Решение
Декомпозиция на независимые модули с коммуникацией через EventBus.

---

## Созданные файлы

### Core (ядро)
| Файл | Строк | Описание |
|------|-------|----------|
| `core/EventBus.ts` | ~90 | Шина событий для декуплинга систем |
| `core/GameState.ts` | ~265 | Централизованное хранилище состояния |
| `core/PhysicsSystem.ts` | ~220 | Обертка над kinetics.ts для физики и коллизий |

### Entities (сущности)
| Файл | Строк | Описание |
|------|-------|----------|
| `entities/Player.ts` | ~275 | Логика игрока: движение, стрельба, даш, дроны |
| `entities/Enemy.ts` | ~130 | Сущность врага с методами takeDamage, integrate |

### AI (искусственный интеллект)
| Файл | Строк | Описание |
|------|-------|----------|
| `ai/IEnemyStrategy.ts` | ~20 | Интерфейс стратегии врага |
| `ai/GameContext.ts` | ~115 | Контекст для ИИ (позиции, состояние) |
| `ai/EnemyAI.ts` | ~135 | Фабрика и менеджер стратегий |
| `ai/strategies/DroneStrategy.ts` | ~60 | Роевое поведение (Boids-lite) |
| `ai/strategies/HunterStrategy.ts` | ~40 | Предсказание позиции игрока |
| `ai/strategies/FighterStrategy.ts` | ~70 | Орбитальное движение + атаки |

### Wave (волны и зоны)
| Файл | Строк | Описание |
|------|-------|----------|
| `wave/ZoneManager.ts` | ~160 | Управление зоной: расширение, схлопывание, урон края |

### Progression (прогрессия)
| Файл | Строк | Описание |
|------|-------|----------|
| `progression/ScoreManager.ts` | ~170 | Очки, комбо, рекорды, события |

---

## Структура после рефакторинга

```
src/game/
├── core/
│   ├── EventBus.ts          # Шина событий (pub/sub)
│   └── GameState.ts         # Состояние игры
├── entities/
│   ├── Player.ts            # Игрок (движение, оружие, дроны)
│   └── Enemy.ts             # Враг (здоровье, позиция, стратегия)
├── ai/
│   ├── IEnemyStrategy.ts    # Интерфейс стратегии
│   ├── GameContext.ts       # Контекст для ИИ
│   ├── EnemyAI.ts           # Фабрика стратегий
│   └── strategies/
│       ├── DroneStrategy.ts      # Рой
│       ├── HunterStrategy.ts     # Перехват
│       └── FighterStrategy.ts    # Орбита
├── wave/
│   └── ZoneManager.ts       # Управление зоной
├── progression/
│   └── ScoreManager.ts      # Очки и комбо
├── rendering/               # TODO
├── systems/                 # TODO
└── game.ts                  # Orchestrator (будет сокращен до ~150 строк)
```

---

## Типы событий EventBus

```typescript
type EventType =
  | 'enemy_killed'        // Убийство врага → ScoreManager, FX
  | 'player_damaged'      // Урон игроку → HUD, Audio
  | 'player_healed'       // Лечение → HUD, FX
  | 'zone_expanded'       // Расширение зоны → Spawner
  | 'zone_collapsing'     // Схлопывание → UI
  | 'wave_started'        // Начало волны → Audio, UI
  | 'wave_cleared'        // Зачистка → ZoneManager
  | 'pickup_collected'    // Сбор бонуса → ScoreManager
  | 'enemy_spawned'       // Спавн врага → FX
  | 'rift_spawned'        // Спавн рифта → FX
  | 'rift_closed'         // Закрытие рифта → FX
  | 'asteroid_destroyed'  // Уничтожение астероида → ScoreManager
  | 'mine_detonated'      // Взрыв мины → FX, Damage
  | 'dash_activated'      // Активация даша → FX, Audio
  | 'game_over'           // Конец игры → Stats
  | 'score_changed'       // Изменение счета → HUD
  | 'enemy_fired'         // Выстрел врага → BulletSpawner
  | 'physics_collision'   // Коллизия тел → PhysicsSystem
```

---

## Преимущества новой архитектуры

| Принцип | Было | Стало |
|---------|------|-------|
| **Single Responsibility** | Game отвечает за всё | Каждый класс — одна задача |
| **Open/Closed** | Правка 10+ мест для нового врага | Новая стратегия без изменений ядра |
| **Liskov Substitution** | Невозможно | Стратегии взаимозаменяемы |
| **Interface Segregation** | Hooks с 7 методами | Подписка только на нужные события |
| **Dependency Inversion** | Прямое создание зависимостей | Внедрение через конструктор/EventBus |

---

## Следующие шаги (план)

1. ✅ **EventBus** — готово
2. ✅ **GameState** — готово
3. ✅ **Player Entity** — готово
4. ✅ **Enemy Entity + AI Strategies** — готово (3 из 5 типов)
5. ✅ **ZoneManager** — готово
6. ✅ **ScoreManager** — готово
7. ✅ **PhysicsSystem** — готово (kinetics.ts интегрирована)
8. ⏳ **WaveManager** — логика волн, спавн
9. ⏳ **EntityRenderer** — отрисовка сущностей
10. ⏳ **HUDRenderer** — интерфейс
11. ⏳ **BulletSystem** — пули и коллизии
12. ⏳ **PickupSystem** — бонусы и минералы
13. ⏳ **MineSystem** — мины с детонацией
14. ⏳ **DI Container** — управление зависимостями
15. ⏳ **Refactor Game.ts** — сократить до оркестратора

---

## Пример использования

```typescript
// Инициализация
const eventBus = new EventBus();
const state = new GameState();
const player = new Player({ eventBus });
const scoreManager = new ScoreManager(eventBus);
const zoneManager = new ZoneManager({ eventBus, state });
const enemyAI = new EnemyAI(eventBus);

// В игровом цикле
update(dt: number) {
  // Обновление контекста
  context.update(dt);
  
  // Обновление систем
  player.update(dt, inputDir, aimAngle);
  zoneManager.update(dt, player.x, player.y);
  enemyAI.updateEnemies(enemies, context, dt);
  scoreManager.update(dt);
  
  // Рендеринг (отдельные системы)
  entityRenderer.draw(player, enemies, bullets);
  hudRenderer.draw(scoreManager.getData(), state.zone);
}
```

---

## Метрики

| Показатель | До | После | Улучшение |
|------------|----|-------|-----------|
| Строк в Game.ts | ~2500 | ~150 (план) | **-94%** |
| Количество классов | 1 | 15+ | **+1400%** |
| Средний размер класса | 2500 | ~120 | **-95%** |
| Coupling | Высокий | Низкий (через EventBus) | ✅ |
| Testability | Нет | Высокая (моки легко) | ✅ |
| Расширяемость | Сложно | Просто (новые стратегии) | ✅ |

---

## Заключение

Рефакторинг превращает монолитный God Object в набор слабосвязанных компонентов, каждый из которых:
- Имеет одну ответственность
- Легко тестируется изолированно
- Расширяется без модификации существующего кода
- Взаимодействует через четко определенные интерфейсы

Результат: код становится поддерживаемым, расширяемым и соответствующим принципам SOLID.
