# 🏗️ Архитектурный анализ проекта

Отличный код! Видно, что проект прошёл через несколько итераций рефакторинга. Давай разберём, что сделано хорошо, а что можно улучшить.

---

## ✅ Сильные стороны

### 1. Чёткое разделение ответственности
```
game.ts (оркестратор)
    ├── systems/ (бизнес-логика)
    ├── core/ (состояние, события, камера)
    ├── entities/ (сущности)
    └── ...
```

Каждая система делает **одно** и делает это хорошо:
- `PlayerSystem` — только игрок
- `EnemySystem` — только враги
- `BulletSystem` — только пули
- `AsteroidField` — только астероиды

Это **Single Responsibility Principle** в действии. 👍

### 2. EventBus для слабой связанности
```typescript
this.eventBus.publish('enemy_killed', { scoreValue: e.score });
this.eventBus.on('enemy_killed', (event) => { /* реакция */ });
```
Системы не знают друг о друге — они общаются через события. Это **золотой стандарт** для игровых архитектур.

### 3. Dependency Injection (DI)
```typescript
new EnemySystem(eventBus, state, fx, audio, enemyFireCallback, getZoneBounds)
```
Все зависимости передаются через конструктор. Легко тестировать, легко заменять.

### 4. Чистые функции в `balance.ts`
```typescript
export function hpScale(w: number) {
  return 1 + 0.5 * ramp01(w, 1, 15) + 3.0 * ramp01(w, 15, 40);
}
```
Все игровые константы и формулы **в одном месте**. Это гениально — можно балансировать игру, не трогая код.

### 5. Chunk-based генерация
```typescript
// Астероиды генерируются чанками
const CHUNK = 1000;
// Звёзды — тоже
```
Бесконечный мир без замедлений. Идеально для космического шутера.

### 6. WebGL рендеринг с блюром
```typescript
// Bloom post-process
gl.uniform2f(this.loc(1, "uDir"), 1.4 / this.sceneFbo.w, 0);
```
Не просто линии — а **красивые** линии с эффектами. Это выделяет проект.

### 7. Аудио как отдельный движок
```typescript
class AudioEngine {
  private tone(...) { /* синтез звуков */ }
  shoot() { this.tone("square", 950, 240, 0.05, 0.045); }
}
```
Всё генерируется процедурно — нет зависимости от звуковых файлов. Минималистично и гибко.

---

## ⚠️ Слабые стороны

### 1. 🔴 **Game.ts — God Object (главная проблема)**
```typescript
class Game {
  // 400+ строк
  // Координирует ВСЁ
  // Знает о всех системах
  // Содержит логику волн, зоны, спавна, UI, и т.д.
}
```
Это **нарушение Single Responsibility**. `Game` делает слишком много:
- Оркестрирует системы
- Управляет волнами
- Содержит логику зоны
- Обрабатывает ввод
- Управляет меню
- И т.д.

**Решение:** Вынести логику волн и зоны в отдельные менеджеры (у тебя уже есть `WaveManager` и `ZoneManager`, но они не используются!).

### 2. 🔴 **Дублирование состояния**
```typescript
// В GameState:
this.player = { x, y, vx, vy, ... }
// В PlayerSystem:
this.player = { x, y, vx, vy, ... }
// В Game:
this.camX, this.camY, this.zoneX, this.zoneY, ...
```
Одно и то же состояние хранится в **трёх местах**. Это ведёт к рассинхронизации и багам.

**Решение:** Использовать **единый источник истины** (Single Source of Truth). Все системы должны читать состояние из `GameState`, а не хранить своё.

### 3. 🟡 **Типизация «наполовину»**
```typescript
// Есть интерфейсы
interface Enemy { kind: EnemyKind; x: number; ... }
// Но некоторые функции используют any
const data = event.payload as { scoreValue: number };
```
Типизация есть, но не везде. `any` просачивается в код.

**Решение:** Использовать discriminated unions для событий:
```typescript
type GameEvent = 
  | { type: 'enemy_killed'; payload: { scoreValue: number; kind: EnemyKind } }
  | { type: 'player_hit'; payload: { dmg: number } }
  // ...
```

### 4. 🟡 **Системы знают слишком много друг о друге**
```typescript
// PlayerSystem знает о GameState
// GameState знает о PlayerSystem
// Циклическая зависимость
```
`PlayerSystem` принимает `GameState` в конструкторе, но `GameState` содержит `PlayerState`. Это создаёт циклическую связь.

**Решение:** Использовать паттерн **Observer** или **Mediator**:
```typescript
// Вместо того чтобы система читала GameState напрямую:
const pos = this.state.player.getPosition();

// Она должна получать данные через параметры:
update(dt: number, playerX: number, playerY: number) { ... }
```

### 5. 🟡 **Магические числа**
```typescript
// В game.ts:
this.zoneR = 17.25; // Что это? Почему 17.25?
if (dist > this.zoneR - margin) { ... } // margin = 40
```
Это **магические числа** — их значение не очевидно.

**Решение:** Вынести в `balance.ts`:
```typescript
export const ZONE_INITIAL_RADIUS = 17.25;
export const ZONE_EDGE_MARGIN = 40;
```

### 6. 🟡 **Отсутствие тестов**
```typescript
// Нет ни одного теста
// Нет возможности проверить баланс автоматически
```
Без тестов сложно рефакторить и добавлять новые механики.

**Решение:** Добавить юнит-тесты для критических систем:
- `balance.ts` — чистая логика, легко тестировать
- `CollisionSystem` — можно тестировать столкновения
- `EnemySystem` — можно тестировать AI

### 7. 🟡 **RVO-js не используется**
```typescript
// Импортируется, но не используется
// import RVO from 'rvo-js';
```
Ты добавил RVO для избегания столкновений, но используешь самописную `applyAvoidance`. 700KB библиотека лежит мёртвым грузом.

**Решение:** Или использовать RVO, или удалить зависимость из `package.json`.

### 8. 🟡 **UI логика в Game**
```typescript
this.hooks.onHud(hud);
this.hooks.onBanner(banner);
this.hooks.onPopup(popup);
```
Game отвечает за UI — это нарушение разделения.

**Решение:** Вынести UI в отдельную систему:
```typescript
class UISystem {
  update(gameState: GameState) {
    // Обновляет HUD на основе состояния
  }
}
```

---

## 🎯 Рекомендации по улучшению

### P0 — Критическое (сделать сейчас)

#### 1. Избавиться от God Object
```typescript
// РЕФАКТОРИНГ Game.ts:

class Game {
  private orchestrator: GameOrchestrator;
  
  constructor() {
    this.orchestrator = new GameOrchestrator(
      new WaveManager(),
      new ZoneManager(),
      new SpawnManager(),
      // ...
    );
  }
  
  update(dt: number) {
    this.orchestrator.update(dt);
  }
}

class GameOrchestrator {
  update(dt: number) {
    this.waveManager.update(dt);
    this.zoneManager.update(dt);
    this.enemySystem.update(dt);
    // Порядок важен
  }
}
```

#### 2. Единый источник истины
```typescript
// Вместо дублирования:

// GameState — единственное место хранения состояния
class GameState {
  player: PlayerState;
  zone: ZoneState;
  wave: WaveState;
  // ...
}

// Системы НЕ хранят состояние
class PlayerSystem {
  // Состояние приходит из GameState
  update(state: GameState, dt: number) {
    const player = state.player;
    // ...
  }
}
```

#### 3. Убрать циклические зависимости
```typescript
// Вместо того чтобы система знала о GameState:
class EnemySystem {
  constructor(private state: GameState) { }
  update() {
    const playerX = this.state.player.x; // ❌
  }
}

// Система получает только то, что ей нужно:
class EnemySystem {
  update(dt: number, playerX: number, playerY: number) { // ✅
    // ...
  }
}
```

### P1 — Важное (сделать в ближайшее время)

#### 4. Строгая типизация событий
```typescript
// Вместо:
this.eventBus.publish('enemy_killed', { scoreValue: e.score });

// Использовать:
type GameEvents = {
  enemy_killed: { scoreValue: number; kind: EnemyKind; x: number; y: number };
  player_hit: { dmg: number; x: number; y: number };
  // ...
}

this.eventBus.publish('enemy_killed', {
  scoreValue: e.score,
  kind: e.kind,
  x: e.x,
  y: e.y
});
```

#### 5. Вынести UI в отдельную систему
```typescript
class UISystem {
  private hooks: UIHooks;
  
  update(state: GameState) {
    if (state.wave.changed) {
      this.hooks.onBanner(this.buildBanner(state));
    }
    this.hooks.onHud(this.buildHud(state));
  }
}
```

#### 6. Убрать магические числа
```typescript
// Вместо:
this.zoneR = 17.25;

// Использовать:
import { ZONE_INITIAL_RADIUS } from './balance';
this.zoneR = ZONE_INITIAL_RADIUS;
```

### P2 — Желательное (для будущих итераций)


#### 8. ECS (Entity-Component-System) для сущностей
```typescript
// Текущий подход:
interface Enemy {
  x: number; y: number; hp: number; // всё в одном месте
}

// ECS подход:
class Enemy extends Entity {
  components: [
    new Position(x, y),
    new Health(hp, maxHp),
    new Velocity(vx, vy),
    new AI(kind),
  ]
}

// Системы работают с компонентами:
class MovementSystem {
  update(entities: Entity[]) {
    for (const e of entities) {
      const pos = e.get(Position);
      const vel = e.get(Velocity);
      pos.x += vel.x * dt;
    }
  }
}
```

#### 9. Использовать RVO или удалить - нужно удалить
```typescript
// Либо активно использовать:
class EnemySystem {
  private rvo = new RVO.Simulator();
  
  update() {
    this.rvo.setAgentPrefVelocity(id, vx, vy);
    this.rvo.run();
    // Применяем новые позиции
  }
}

// Либо удалить зависимость
// npm remove rvo-js
```

#### 10. Сохранение/загрузка состояния
```typescript
// Добавить возможность сохранять игру:
class SaveManager {
  save(state: GameState) {
    localStorage.setItem('save', JSON.stringify(state));
  }
  
  load(): GameState | null {
    const raw = localStorage.getItem('save');
    return raw ? JSON.parse(raw) : null;
  }
}
```

---

## 📊 Архитектурная оценка

| Критерий | Оценка | Комментарий |
|----------|--------|-------------|
| **Разделение ответственности** | 7/10 | Хорошо, но Game делает слишком много |
| **Слабая связанность** | 8/10 | EventBus помогает, но есть циклические зависимости |
| **Тестируемость** | 5/10 | Сложно тестировать из-за God Object |
| **Расширяемость** | 7/10 | Добавлять новые системы легко |
| **Читаемость** | 8/10 | Код чистый, комментарии есть |
| **Производительность** | 9/10 | WebGL + чанки = отлично |
| **Типизация** | 7/10 | Есть, но не везде |
| **Следование принципам SOLID** | 6/10 | S нарушен (Game), O — ок, L — ок, I — ок, D — ок |

---

