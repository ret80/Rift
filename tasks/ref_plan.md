# План рефакторинга — Итоговый анализ архитектуры

## Сводка проекта

**Игра:** "РАЗЛОМ // СЕКТОР-9" (RIFT // SECTOR-9) — 2D space shooter
**Стек:** React 18 + TypeScript 5.7 + Vite 6 + Tailwind CSS 4 + WebGL
**Архитектура:** ECS-like systems + Strategy (AI) + EventBus
**Общий размер:** ~30,571 строк (все game-файлы)

---

## 🚨 КРИТИЧЕСКИЕ ПРОБЛЕМЫ

### 1. Полное дублирование сущностей (удалить ~850 строк)

#### 1.1. `entities/Player.ts` — МЕРТВЫЙ ФАЙЛ
- **Статус:** Не используется. Весь код идёт через `systems/PlayerSystem.ts`
- **Обнаружение:** Класс `Player` (273 строки) определяет ту же логику что и `PlayerSystem` (555 строк)
- **Действие:** УДАЛИТЬ `src/game/entities/Player.ts`
- **Риск:** Низкий — 0 импортов в кодовой базе

#### 1.2. `entities/Enemy.ts` — МЕРТВЫЙ ФАЙЛ
- **Статус:** Не используется. Enemy определяется как interface в `types.ts`
- **Обнаружение:** Класс `Enemy implements EnemyData` (133 строки) создаёт дубликат
- **Действие:** УДАЛИТЬ `src/game/entities/Enemy.ts`
- **Риск:** Низкий — 0 импортов в кодовой базе

#### 1.3. `progression/ScoreManager.ts` — МЕРТВЫЙ ФАЙЛ
- **Статус:** Не используется. Весь scoring идёт через `systems/ScoringSystem.ts`
- **Обнаружение:** Два независимых scoring системы: ScoreManager (174 строки) vs ScoringSystem (161 строки)
- **Действие:** УДАЛИТЬ `src/game/progression/ScoreManager.ts`
- **Риск:** Низкий — 0 импортов в кодовой базе
- **Бонус:** Удаление пустой директории `src/game/progression/`

#### 1.4. `core/GameFSM.ts` — ЧАСТИЧНО ИСПОЛЬЗУЕТСЯ
- **Статус:** ⚠️ ИСПОЛЬЗУЕТСЯ — экспортирует `GameFSMContext` и `GameStateId`
- **Импорты:** `game.ts:39` импортирует `GameFSMContext`, `FSMBridge.ts:14` импортирует оба типа
- **Действие:** Переместить интерфейсы в `FSMBridge.ts`, удалить `createGameFSM` (не используется)
- **Детали:** См. `tasks/ref_01.md` Task 1.5

#### 1.5. `core/PhysicsSystem.ts` — МЕРТВЫЙ ФАЙЛ
- **Статус:** Не интегрирован. Collision делается вручную в `CollisionSystem.ts` и `AsteroidField.update()`
- **Обнаружение:** 222 строки обёртки над kinetics.ts, но нигде не используется
- **Действие:** УДАЛИТЬ `src/game/core/PhysicsSystem.ts`
- **Риск:** Низкий — 0 импортов в кодовой базе

---

### 2. Слишком большие файлы (разделить)

| Файл | Строки | Проблема | Решение |
|------|--------|----------|---------|
| `game.ts` | 1,122 | Оркестратор + setup + config + lifecycle | Разделить на `GameSetup.ts`, `GameLifecycle.ts` |
| `RendererSystem.ts` | 868 | Рендер всех сущностей + ship shapes | Вынести `drawShipPoly`, `drawEnemyPoly` в `render.ts` |
| `audio.ts` | 695 | SFX + music генерация | Разделить на `SoundFx.ts` и `MusicEngine.ts` |
| `systems/PlayerSystem.ts` | 555 | Movement + shooting + missiles + state | Вынести missiles в `MissileSystem.ts` |
| `systems/EnemySystem.ts` | 455 | AI + movement + firing + avoidance | Разделить на `EnemyMovement.ts` и `EnemyFiring.ts` |
| `systems/CollisionSystem.ts` | 417 | Проверка всех коллизий | Вынести asteroid logic в `asteroids.ts` |
| `systems/RendererSystem.ts` | 868 | Рисует ВСЁ | Разделить по типам сущностей |

---

### 3. Дублирование логики отрисовки (объединить)

**Проблема:** Функции отрисовки `drawShipPoly` и `drawRift` дублируются в:
- `rifts.ts` (private `drawRift`, ~54 строки)
- `systems/RendererSystem.ts` (public `drawShipPoly`, `drawRiftShape`)
- `systems/MenuScene.ts` (copy of rift drawing)

**Решение:** Создать `src/game/render/shapes.ts`:
```typescript
// Вывести все shape-функции
export function drawShipPoly(...): void
export function drawRiftShape(...): void
export function drawEnemyPoly(kind, ...): void
export function drawAsteroid(...): void
```

---

### 4. Дублирование утилит (объединить)

**Проблема:** `rand()` определён в 4+ файлах:
- `src/game/math.ts` ✅ (правильно)
- `src/game/systems/PlayerSystem.ts` ❌
- `src/game/systems/EnemySystem.ts` ❌
- `src/game/audio.ts` ❌ (rgba)

**Решение:** Заменить локальные импорты на `import { rand, rgba } from '../math'`

---

## 📋 ДЕТАЛЬНЫЙ ПЛАН РЕФАКТОРИНГА

### Фаза 1: Удаление мёртвого кода (безопасно, 0 рисков)

#### Task 1.1: Удалить `entities/Player.ts`
```
- Удалить файл src/game/entities/Player.ts
- Удалить пустую директорию src/game/entities/
- Проверить: npm run typecheck
```

#### Task 1.2: Удалить `entities/Enemy.ts`
```
- Удалить файл src/game/entities/Enemy.ts
- (остается только types.ts)
- Проверить: npm run typecheck
```

#### Task 1.3: Удалить `progression/ScoreManager.ts`
```
- Удалить файл src/game/progression/ScoreManager.ts
- Удалить пустую директорию src/game/progression/
- Проверить: npm run typecheck
```

#### Task 1.4: Удалить `core/GameFSM.ts` и рефакторить FSMBridge
```
- Удалить файл src/game/core/GameFSM.ts
- В FSMBridge.ts:
  - Удалить импорт GameFSMContext из GameFSM.ts
  - Переместить интерфейс GameFSMContext в FSMBridge.ts
  - Удалить дублирующие onEnter колбэки
- Проверить: npm run typecheck
```

#### Task 1.5: Удалить `core/PhysicsSystem.ts`
```
- Удалить файл src/game/core/PhysicsSystem.ts
- Проверить: npm run typecheck
```

**Итого сэкономлено:** ~850 строк

---

### Фаза 2: Разделение крупных файлов

#### Task 2.1: Разделить `systems/PlayerSystem.ts` (555 строк)

**Создать `systems/MissileSystem.ts`:**
```typescript
export class MissileSystem {
  private missileActive: boolean = false;
  private missilePort: number = 0;
  private missileCd: number = 0;
  private missileDurationT: number = 0;
  
  activateMissileLauncher(duration: number): void
  launchMissiles(dt: number, enemies: Enemy[]): void
  fireMissile(target: Target): void
  update(dt: number): void
  reset(): void
}
```
- Перенести все missile-методы из PlayerSystem
- PlayerSystem будет ~300 строк

#### Task 2.2: Разделить `systems/EnemySystem.ts` (455 строк)

**Создать `systems/EnemyMovement.ts`:**
```typescript
export class EnemyMovementSystem {
  private ai: EnemyAI;
  private context: GameContext;
  
  updateMovement(enemyList: Enemy[], dt: number, playerPos: Pos): void
  applyAvoidance(enemyList: Enemy[], dt: number): void
  private updateAI(...): void
}
```

**Создать `systems/EnemyFiring.ts`:**
```typescript
export class EnemyFiringSystem {
  private wave: number;
  
  updateFiring(enemyList: Enemy[], dt: number, playerPos: Pos): void
  getAccuracy(wave: number): number
  damageEnemy(index: number, dmg: number): boolean
}
```
- EnemySystem будет ~200 строк

#### Task 2.3: Разделить `audio.ts` (695 строк)

**Создать `systems/SoundFx.ts` (SFX только):**
```typescript
export class SoundFx {
  shoot(): void
  enemyShoot(): void
  heavyShoot(): void
  explode(size: number): void
  riftOpen(): void
  riftSpawn(): void
  riftClose(): void
  // ... только SFX
}
```

**Создать `systems/MusicEngine.ts` (только музыка):**
```typescript
export class MusicEngine {
  startCombat(): void
  stopCombat(): void
  startMenu(): void
  // ... только music
}
```

#### Task 2.4: Разделить `systems/RendererSystem.ts` (868 строк)

**Создать `render/shapes.ts` (фигуры):**
```typescript
export function drawShipPoly(R: Renderer, state): void
export function drawEnemyPoly(R: Renderer, enemy): void
export function drawRiftShape(R: Renderer, rift): void
export function drawDrone(R: Renderer, drone): void
export function drawAsteroid(R: Renderer, ast): void
```

**Создать `render/BatchRenderer.ts` (batching):**
```typescript
export class BatchRenderer {
  addLine(...): void
  addPoly(...): void
  flush(): void
}
```

---

### Фаза 3: Унификация naming conventions (ref_10)

#### Task 3.1: EntityPoolSystem — суффикс `List`
```typescript
// БЫЛО:
bullets: Bullet[] = [];          // ❌
pickups: Pickup[] = [];          // ❌
allyDrones: AllyDrone[] = [];    // ❌
mines: Mine[] = [];              // ❌

// СТАЛО:
bulletList: Bullet[] = [];       // ✅
pickupList: Pickup[] = [];       // ✅
allyDroneList: AllyDrone[] = []; // ✅
mineList: Mine[] = [];           // ✅
```

#### Task 3.2: Убрать публичные поля
```typescript
// БЫЛО:
enemyList: Enemy[] = [];         // ❌ публичное
bulletList: Bullet[] = [];       // ❌ публичное

// СТАЛО:
private enemyList: Enemy[] = [];
getEnemyList(): Enemy[] { return this.enemyList; }
```

---

### Фаза 4: Улучшение качества кода

#### Task 4.1: Убрать `any` типы
**Файлы с `any`:**
- `game.ts` — ~15 вхождений
- `systems/CollisionSystem.ts` — ~8 вхождений
- `systems/EnemySystem.ts` — ~3 вхождения
- `systems/DroneSystem.ts` — ~3 вхождения

**Решение:** Создать конкретные типы:
```typescript
interface EnemyRef { x: number; y: number; dead: boolean; r?: number }
interface DroneRef { x: number; y: number; r?: number }
```

#### Task 4.2: Убрать дублирование `rand()` и `rgba()`
```bash
# Заменить в:
# - systems/PlayerSystem.ts
# - systems/EnemySystem.ts
# - audio.ts
# На:
import { rand, rgba } from '../math';
```

#### Task 4.3: Улучшить `game.ts` (1,122 строки)

**Разделить на 3 файла:**

1. **`GameSetup.ts`** — инициализация систем:
```typescript
export class GameSetup {
  static createSystems(config): SystemContainer { ... }
  static subscribeEvents(container): void { ... }
}
```

2. **`GameLifecycle.ts`** — manage lifecycle:
```typescript
export class GameLifecycle {
  startGame(): void
  pauseGame(): void
  resumeGame(): void
  stopGame(): void
  transitionTo(state): void
}
```

3. **`game.ts`** — только orchestrator (~200 строк):
```typescript
export class Game {
  setup(): void
  update(dt: number): void
  render(R: Renderer, time: number): void
}
```

---

## 📊 ОЖИДАЕМЫЙ РЕЗУЛЬТАТ

| Метрика | До | После |
|---------|-----|-------|
| Мёртвый код | ~850 строк | 0 |
| Макс. размер файла | 1,122 (game.ts) | <600 |
| Макс. размер системы | 868 (RendererSystem) | <400 |
| Дублирование `rand()` | 4 файла | 0 |
| Дублирование рисования | 3 места | 1 (shapes.ts) |
| Файлов в `entities/` | 2 | 0 (удалить) |
| Файлов в `progression/` | 1 | 0 (удалить) |
| `any` типов | ~30 | <5 |

---

## 📦 ДЕТАЛЬНЫЕ ЗАДАЧИ (ref_01 — ref_04)

Все задачи разбиты на отдельные файлы в `tasks/`:

| Файл | Описание | Приоритет |
|------|----------|-----------|
| `ref_01.md` | Удаление мёртвого кода (~930 строк) | 🔴 Критично, делать первым |
| `ref_02.md` | Унификация naming + удаление дубликатов утилит | 🟡 После ref_01 |
| `ref_03.md` | Спавн врагов только из разломов | 🟡 После ref_01 |
| `ref_04.md` | Коллизии и оружие | 🟢 После ref_01-ref_03 |

---

## 🔗 ЗАВИСИМОСТИ МЕЖДУ ЗАДАЧАМИ

```
Фаза 1 (Удаление мёртвого кода)
  └── Может выполняться полностью независимо
  └── Безопасна для выполнения в первую очередь

Фаза 2 (Разделение крупных файлов)
  ├── Зависит от: Фаза 1
  └── Task 2.1-2.3 независимы друг от друга

Фаза 3 (Naming conventions)
  ├── Зависит от: Фаза 1 (если удаляем GameFSM)
  └── Независима от Фазы 2

Фаза 4 (Качество кода)
  ├── Зависит от: Фаза 2 (при перераспределении кода)
  └── Task 4.1-4.2 независимы
```

---

## ✅ КРИТЕРИИ ГОТОВНОСТИ

- [ ] Все мёртвые файлы удалены
- [ ] `npm run typecheck` без ошибок
- [ ] Нет файлов >600 строк в `src/game/`
- [ ] Все коллекции имеют суффикс `List`
- [ ] Нет дублирования утилит (`rand`, `rgba`)
- [ ] Нет дублирования shape-функций
- [ ] Нет `any` типов кроме критических мест
- [ ] Все тесты проходят

---

## ⚠️ РИСКИ

1. **GameFSM vs FSMBridge:** Убедиться, что `game.ts` действительно использует только `FSMBridge`
2. **PlayerSystem vs entities/Player:** Убедиться, что `entities/Player.ts` нигде не импортируется
3. **Разделение файлов:** Правильно распределить зависимости между новыми файлами
4. **Ref_10 naming:** Все вызовы `this.bullets.push()` должны быть обновлены на `this.bulletList.push()`

---

## 🎯 РЕКОМЕНДУЕМЫЙ ПОРЯДОК ВЫПОЛНЕНИЯ

### Шаг 1: `ref_01` — Удаление мёртвого кода (СЕЙЧАС)
- Удалить 4 мёртвых файла
- Переместить типы из GameFSM в FSMBridge
- Сэкономить ~930 строк

### Шаг 2: `ref_02` — Унификация
- Приватные поля в EntityPool с getters
- Удалить дубликаты `rand()` и `rgba()`

### Шаг 3: `ref_03` — Спавн врагов
- Центральный разлом в меню
- Враги только из разломов
- Не удалять врагов за пределами камеры в игре

### Шаг 4: `ref_04` — Коллизии и оружие
- Проверить радиусы коллизий
- Добавить Drone ↔ Player избегание
- Удалить `PlayerSystem.bulletList` (дубликат)

### Шаг 5: `ref_05+` — Разделение крупных файлов (ОПЦИОНАЛЬНО)
- Разделить `game.ts` (1,122 строки)
- Разделить `RendererSystem.ts` (868 строк)
- Разделить `audio.ts` (695 строк)
- Разделить `PlayerSystem.ts` (555 строк)

**ВНИМАНИЕ:** Шаг 5 — ОПЦИОНАЛЬНЫЙ, требует тщательного тестирования.
