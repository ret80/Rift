# План рефакторинга РАЗЛОМ

> Обновлённый анализ от 2026-10-22. Основан на глубоком изучении кодовой базы (~50 файлов, ~6000 строк). ECS-планы в `tasks/ecs_*.md` — дизайн-доки, в проекте нет `src/game/ecs/`. Цель — улучшить поддерживаемость без крупных архитектурных переписываний.

---

## Фаза 0: Подготовка (baseline)

1. Прогнать `npm run typecheck && npm run lint && npm run check:i18n`
2. Зафиксировать текущие ошибки/предупреждения
3. Ручной плейтест: новая игра, переход волн, покупка апгрейдов, смерть/рестарт, меню

---

## Фаза 1: Критичные баги (блокирующие)

### 1.1. Проброс волны в EnemySystem/EnemyShootingSystem

**Проблема**: `setWave()` есть, но не вызывается при переходах между волнами. Враги всегда с базовыми статами.

**Решение**: Вызывать `setWave()` из `WaveOrchestrator` при инициализации волны.

```
WaveOrchestrator.initWave()
  → enemySystem.setWave(wave)
  → enemyShootingSystem.setWave(wave)
```

**Файлы**: `src/game/systems/WaveOrchestrator.ts`, `src/game/systems/EnemySystem.ts`, `src/game/systems/EnemyShootingSystem.ts`

**Риск**: Нужно найти единственный источник правды по волне (`WaveOrchestrator.wave`).

### 1.2. Удаление `purchaseUpgradeNoCost()` или реализация

**Проблема**: Метод всегда возвращает `false`, обманывает UI.

**Решение**: Удалить метод (правило проекта: удалять мёртвый код сразу). Если нужен дебаг — добавить через `__DEV__` флаг.

**Файлы**: `src/game/game.ts`, `src/game/systems/UpgradeSystem.ts`

### 1.3. Магическое число `5` → вычисляемое

**Проблема**: `enabledEnemies.length === 5` сломается при изменении `EnemyKind`.

**Решение**:

```typescript
const ENEMY_KIND_COUNT = Object.keys(EnemyKind).length;
// или
const ALL_ENEMY_KINDS = Object.values(EnemyKind).filter(k => typeof k === 'string');
```

**Файлы**: `src/App.tsx`, `src/game/systems/SpawnSystem.ts`

---

## Фаза 2: Удаление мёртвого кода

### 2.1. Мёртвые поля и методы

| Файл | Что удалить | Обоснование |
|------|-------------|-------------|
| `ScoringSystem.ts` | `ScoringHooks` | Пустой интерфейс, нигде не используется |
| `PlayerState.ts` | `getRenderState()` | deprecated |
| `CollisionConstants.ts` | `BULLET_DAMAGE_ASTEROID` | не используется |
| `EnemySystem.ts` | `lerpAngleAngle` | не используется |
| `CountdownSystem.ts` | `showBanner`, `showToast`, `reset` (лишние) | не используются |
| `DeathSystem.ts` | `isDying`, хардкод `wave 0`, `addParts(0)` | не используется/хак |
| `RiftField` | `anyPending/clear` | не используются |
| `balance/player.ts` | `PLAYER_ACCEL`, `DASH_ACCEL`, `DASH_SPEED`, `DASH_DMG` | не используются |
| `Weapon.ts` | deprecated `PlayerBonuses` re-export | миграция завершена |

### 2.2. Неиспользуемые зависимости

**Файл**: `package.json`

Удалить: `canvas-confetti`, `framer-motion`, `lucide-react`. `@dnd-kit` не объявлен — игнорировать.

### 2.3. Неиспользуемые импорты

**Файлы**: `src/App.tsx`, `src/ui/*`, `src/game/systems/*`

Исправить по мере правок. Часть автоисправится линтером.

---

## Фаза 3: Декомпозиция God-объекта `Game`

### 3.1. Выделение `GameBootstrap`

**Цель**: Разделить конструктор `Game` (~300 строк) на логические блоки.

**Подход**: Не создавать адаптеры. Выделить функцию-фабрику, которая собирает системы с зависимостями:

```typescript
interface GameBootstrap {
  createSystems(canvas: HTMLCanvasElement, hooks: Hooks): GameInstance;
}
```

Системы группируются по назначению:
1. **Presentation**: renderer, fx, starfield, asteroidField, riftField, menuScene
2. **Input**: inputSystem, input
3. **Core**: eventBus, fsm, cameraSystem
4. **GameLogic**: playerSystem, enemySystem, enemyShootingSystem, bulletSystem, spawnSystem
5. **Weapons**: weaponManager, bonusManager, loadoutSystem
6. **Waves**: waveOrchestrator, waveFlowSystem, countdownSystem
7. **Persistence**: upgradeSystem, scoringSystem

**Файлы**: `src/game/game.ts`

**Риск**: Не нарушить порядок инициализации зависимостей.

### 3.2. Уменьшение параметров `render()`

**Цель**: Заменить 18+ параметров на структурированный объект.

**Решение**: Ввести `RenderFrame` интерфейс:

```typescript
interface RenderFrame {
  meta: { type: string; time: number; wave: number; score: number };
  player: PlayerRenderInput | null;
  aim: { angle: number | null; guns: number; phantomLevel: number };
  bonuses: { rateT: number; rateBoost: number; dashT: number };
  enemies: Enemy[];
  bullets: Bullet[];
  ebullets: EBullet[];
  pickups: Pickup[];
  drones: AllyDrone[];
  zone: ZoneRenderInput | null;
  camera: { x: number; y: number; zoom: number };
  view: { w: number; h: number };
  weaves: WeaveThread[];
}
```

**Файлы**: `src/game/game.ts`, `src/game/systems/RendererSystem.ts`, `src/game/types/ui.ts`

**Риск**: Много call sites — нужно аккуратно заменить все.

---

## Фаза 4: Консолидация коллизий

### 4.1. Единый `DamageResolver`

**Проблема**: Логика урона/убийства размазана по `CollisionSystem`, `BulletCollision`, `EntityCollision`.

**Решение**: Создать единый модуль для разрешения урона:

```typescript
class DamageResolver {
  resolveBulletHit(bullet: Bullet, target: Enemy): KillResult | null;
  resolveEntityCollision(a: Entity, b: Entity): CollisionResult;
  resolveAsteroidCollision(asteroid: Asteroid, other: Entity): AsteroidResult;
}
```

**Файлы**: `src/game/systems/CollisionSystem.ts`, `src/game/systems/BulletCollision.ts`, `src/game/systems/EntityCollision.ts`

**Риск**: Изменится порядок обработки — тестировать каждый тип коллизии.

### 4.2. Устранение дублирования астероид-астероид

**Проблема**: `AsteroidField.update()` и `CollisionSystem` оба обрабатывают астероид-астероид.

**Решение**: Выбрать единую ответственность — `AsteroidField` (физика астероидов там). Убрать из `CollisionSystem`.

---

## Фаза 5: Улучшение типизации

### 5.1. Убрать `unknown[]` из `RendererSystem`

**Проблема**: `enemies: unknown[]`, `bullets: unknown[]` и т.д.

**Решение**: Использовать конкретные типы: `Enemy[]`, `Bullet[]`, `EBullet[]`, `Pickup[]`, `AllyDrone[]`.

### 5.2. Убрать `as any` касты

**Файлы**: `RendererSystem.ts`, другие системы

### 5.3. Улучшить типы в `EventBus`

**Проблема**: `EnemyKilledPayload.enemy?: unknown` — бесполезен.

**Решение**: `enemy?: Enemy` или убрать поле вовсе.

---

## Фаза 6: Оптимизация и чистка

### 6.1. Кэширование `buildContext()` в `WeaponManager`

**Проблема**: 10+ вызовов/кадр создают новый объект.

**Решение**: Кэшировать контекст, пересчитывать только при изменении данных.

### 6.2. Декомпозиция `SpawnSystem`

**Проблема**: 430 строк, смешивает размещение, спавн волн, анонсы, математику.

**Решение**: Разбить на:
- `SpawnPlacer` — размещение точек (`placeRiftPoints`, `fallbackRiftPoint`)
- `WaveSpawner` — логика волн (`initWave`, `trySpawnReinforcements`)
- `SpawnAnnouncer` — анонсы (`announceNewKinds`)

### 6.3. Декомпозиция `balance/player.ts`

**Проблема**: 145 строк, всё в одном файле.

**Решение**: Разделить:
- `balance/player/stats.ts` — статы игрока
- `balance/player/colors.ts` — палитра
- `balance/player/graze.ts` — грейз
- `balance/player/weaver.ts` — ткань пространства
- `balance/player/death.ts` — смерть
- `starfield.ts` — перенести STAR_LAYERS

---

## Порядок выполнения

| Шаг | Фаза | Описание | Критерий успеха |
|-----|------|----------|-----------------|
| 1 | 0 | Baseline | typecheck + lint зафиксированы |
| 2 | 1.1 | Проброс волны | Враги масштабируются по волне |
| 3 | 1.2 | Удалить `purchaseUpgradeNoCost` | Метод удалён |
| 4 | 1.3 | Магическое `5` → константа | Работает при любом `EnemyKind` |
| 5 | 2 | Удаление мёртвого кода | typecheck проходит |
| 6 | 3.2 | `RenderFrame` тип | 18 параметров → 1 объект |
| 7 | 4.1 | `DamageResolver` | Коллизии в одном месте |
| 8 | 4.2 | Убрать дубли астероидов | Одна система обрабатывает |
| 9 | 5 | Улучшение типизации | 0 `any`, 0 `unknown[]` |
| 10 | 3.1 | `GameBootstrap` | Конструктор < 150 строк |
| 11 | 6 | Оптимизация | `buildContext` кэш, декомпозиция |
| 12 | — | Финальная проверка | typecheck + lint + плейтест |

---

## Верификация

- `npm run typecheck` — 0 ошибок
- `npm run lint` — 0 ошибок (warnings минимизировать)
- `npm run check:i18n` — 0 ошибок
- Ручной плейтест:
  - Новая игра, несколько волн (проверить рост HP/урона врагов)
  - Покупка апгрейдов
  - Смерть/рестарт
  - Меню
  - Тач-контролы

---

## Риски

1. **Неправильный проброс `setWave`** — нужен единый источник правды (`WaveOrchestrator.wave`)
2. **Консолидация коллизий** — изменится порядок обработки, нужно тестировать каждый тип
3. **Удаление «кажется неиспользуемого»** — полагаться на grep, не на догадки
4. **`RendererSystem` рефактор** — много call sites в `Game`, править аккуратно
5. **`GameBootstrap`** — порядок инициализации зависимостей критичен

---

## Примечания по проектным правилам

- Удалять мёртвый код сразу, без закомментированных блоков
- Комментарии/JSDoc на русском, идентификаторы на английском
- Рефакторить напрямую, не городить адаптеры
- Сохранять стиль и паттерны проекта
- SOLID: Single Responsibility — каждый модуль за одно дело
