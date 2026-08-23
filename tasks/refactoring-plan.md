# Plan: Рефакторинг проекта rift (sandbox-workspace)

## Сводка проекта

| Метрика | Значение |
|---|---|
| Язык | TypeScript 5.7 + React 18 |
|总 строки кода | ~42 976 строк |
| Файлов `src/**/*` | 58 |
| Фреймворк | Vite 6 + Tailwind v4 |
| Архитектура | ECS-like (системы + EventBus + StateMachine) |
| Зависимости | dnd-kit, supabase, framer-motion, kinetics.ts, lucide-react, recharts, etc. |
| Типо-чек | ✅ Проходит чисто (`tsc --noEmit`) |
| CI/CD | GitHub Actions → GitHub Pages |

---

## Критические проблемы (Blockers)

### 1. `game.ts` — God Class (1122 строки)

**Проблема:** Единый файл координирует все ~20 систем, содержит игровой цикл, FSM, спавн, HUD, entity pools, применение пикапов, авто-стрельбу.

**Действия:**
- [ ] Вынести `DeathSystem` (дублирование: создаётся в `constructor` и в `startRun()`)
- [ ] Вынести логику применения пикапов (`applyPickup()` — switch на 40 строк) в `UpgradeSystem` или `PickupSystem`
- [ ] Убрать дублирование орбиты дронов: фаза/орбита считается и в `game.ts` (line 613-618), и в `DroneSystem`
- [ ] Вынести HUD-обновление (Banners, Toasts, Popups, HUD data) — это UI-забоченность
- [ ] Вынести `enemyFire()` и `handleAutoFire()` в `EnemySystem` или создать `CombatSystem`
- [ ] Убрать `as any` касты (line 629-636 для CollisionSystem)
- [ ] Убрать `setTimeout` из детерминированного игрового цикла (`showCountdown`)

**Ожидаемый результат:** `game.ts` → ~400 строк, чистый orchestration без бизнес-логики

---

### 2. `RendererSystem.ts` — 868 строк

**Проблема:** Рендеринг всех объектов, HUD и меню в одном файле. Глубокие вложенные switch-ы.

**Действия:**
- [ ] Выделить `drawPickups()` (switch, 60 строк) в `PickupRenderer.ts`
- [ ] Выделить `drawEnemies()` (switch, 40 строк) в `EnemyRenderer.ts`
- [ ] Выделить `drawShipPoly()` и общую логику кораблей в `ShipRenderer.ts`
- [ ] Убрать дублирование анимации rift (lines 687-731 и 772-806)
- [ ] Заменить magic numbers (90, 6, 11, 3, 2.2, 3.1, 1.3...) на именованные константы
- [ ] `renderHud()` — пустой плейсхолдер, удалить или завершить

**Ожидаемый результат:** `RendererSystem.ts` → ~350 строк, +3-4 файла рендереров по 100-150 строк

---

### 3. `audio.ts` — 695 строк

**Проблема:** Крупнейший файловый модуль. Процедурный WebAudio движок — SFX, ambient music, combat music.

**Действия:**
- [ ] Разделить на `audio/SfxSynth.ts` (tone/noise helpers)
- [ ] Разделить на `audio/AmbientMusic.ts` (4 ambient scenes)
- [ ] Разделить на `audio/CombatMusic.ts` (128 BPM groove)
- [ ] Разделить на `audio/VolumePersist.ts` (localStorage volumes)
- [ ] Убрать дублирование `tone()`/`musicTone()` и `noise()`/`musicNoise()`
- [ ] Заменить magic numbers (`0.43`, `0.0001`, `43758.5453`) на именованные константы

**Ожидаемый результат:** 1 файл на 695 строк → 4 файла по 120-200 строк

---

### 4. `game/systems/CollisionSystem.ts` — 432 строки

**Проблема:** Один метод `update()` обрабатывает 8+ типов коллизий. Мутация чужих массивов.

**Действия:**
- [ ] Разделить на `BulletCollision.ts` (пули-враги/астероиды)
- [ ] Разделить на `EntityCollision.ts` (игрок-враги/астероиды)
- [ ] Разделить на `PickupCollection.ts` (коллекция пикапов)
- [ ] Убрать дублирование `Enemy` interface (должен импортироваться из `../types`)
- [ ] Вынести `eventBus.publish('enemy_killed', ...)` в helper (3 копии)
- [ ] Убрать `as any` касты
- [ ] Заменить magic numbers (`500`, `20`, `12`, `80`, `60`, `30`, `0.15`, `200`, `10`, `0.5`)

**Ожидаемый результат:** 1 файл на 432 строки → 3-4 файла по 80-130 строк

---

## Высокий приоритет

### 5. `game/systems/EnemySystem.ts` — 452 строки

- [ ] Убрать дублирование `spawn` логики (`addEnemy()` и `spawn()` — ~40 строк copy-paste)
- [ ] Убрать dead code: `checkSideFree()` (50 строк, нигде не вызывается)
- [ ] Заменить switch `getDodgeWeight()` на lookup table
- [ ] Исправить `playerVx/playerVy = 0` (line 153-154) — враги не доджируют с учётом скорости игрока
- [ ] Заменить magic numbers (`35`, `1.2`, `0.3`, `0.8`, `1.5`, `500`, `760`, `0.013`)

### 6. `game/systems/PlayerSystem.ts` — 529 строк

- [ ] Разделить на `PlayerMovement.ts` (движение, ускорение)
- [ ] Разделить на `PlayerCombat.ts` (стрельба, missile, auto-fire)
- [ ] Разделить на `PlayerState.ts` (здоровье, щит, стейты)
- [ ] Убрать dead code: `checkAndFireAuto()` (пустой стаб)
- [ ] Убрать redundant `Math.max(0, val)` затем `if (val < 0) val = 0` (line 393-394)
- [ ] Убрать дублирование reset логики (constructor vs `reset()`)

### 7. `ui/Screens.tsx` — 714 строк

- [ ] Разделить на отдельные экраны: `MainMenu.tsx`, `SettingsScreen.tsx`, `HelpScreen.tsx`, `DebugScreen.tsx`, `PauseOverlay.tsx`, `GameOverScreen.tsx`
- [ ] Вынести общие компоненты: `GameButton.tsx`, `SliderRow.tsx`, `LangButton.tsx`, `ScreenShell.tsx`
- [ ] Убрать дублирование `formatTime()` (есть в `App.tsx`)
- [ ] Добавить `type="button"` в `GameButton`
- [ ] Добавить `aria-pressed` в `DevToggle`

### 8. `App.tsx` — 599 строк

- [ ] Вынести `FloatingPopup` в `ui/FloatingPopup.tsx`
- [ ] Вынести `TouchControls` в `ui/TouchControls.tsx`
- [ ] Создать `usePersistedState` hook (4 копии localStorage boilerplate)
- [ ] Создать `useHudUpdater` hook (imperative DOM callback, 35 строк)
- [ ] Вынести reset sequence в `resetGameState()`
- [ ] Заменить 13 `useState` на `useReducer` для game state transitions

### 9. `game/systems/WaveOrchestrator.ts` — 354 строки

- [ ] Убрать `setTimeout` утечки — отменять таймеры при reset
- [ ] Именованные константы для timing (`0.6`, `2.6`, `3.6`, `0.42`, `0.58`)
- [ ] Исправить reinitialization `waveFSM` (создаётся в `initWave` и `reset`)

---

## Средний приоритет

### 10. `game/core/EventBus.ts` — 127 строк

- [ ] Заменить `payload: Record<string, unknown>` на discriminated union:
  ```ts
  type GameEventMap = {
    player_hit: { damage: number };
    enemy_killed: { score: number; kind: string };
    // ... typed payloads per event
  }
  ```
- [ ] Убрать legacy event aliases (`'player_hit'`, `'wave_start'`)
- [ ] Убрать `hasListeners()` — mёртвый код
- [ ] Единый API: убрать `on()`/`emit()` aliases, оставить `subscribe()`/`publish()`

### 11. `game/balance.ts` — 337 строк

- [ ] Разделить на секции: `balance/player.ts`, `balance/enemies.ts`, `balance/waves.ts`, `balance/zones.ts`, `balance/drops.ts`
- [ ] Magic numbers в `hpScale()`/`dmgScale()` (wave boundaries 1, 10, 15, 20, 40) → именованные константы
- [ ] Заменить `kindWeights()` hardcode на конфигурационный объект

### 12. `game/core/FSMBridge.ts` — 136 строк

- [ ] Убрать pattern "mysterious sender" (пустые no-op функции, заполняемые позже)
- [ ] Исправить `as any` на transitions
- [ ] Заполнить незаполненные hooks (`onPlayerDeath` и т.д.) или удалить

### 13. `i18n.ts` — 335 строк

- [ ] Добавить missing keys в русский словарь: `debug.details`, `debug.detailsDesc`
- [ ] Добавить TypeScript type-check на консистентность RU/EN ключей
- [ ] Добавить pluralization для русского (1 дрон, 2 дрона, 5 дронов)
- [ ] Заменить `split().join()` на compiled placeholder parser для производительности

### 14. `game/systems/SpawnSystem.ts` — 284 строки

- [ ] Убрать `game: any` параметр, ввести typed interface
- [ ] Магические числа → именованные константы
- [ ] Russian comment ("Рифы спавнятся только...") → английский

### 15. `game/systems/BulletSystem.ts` — 241 строки

- [ ] Убрать dual ownership — пули должны владеть одной системой
- [ ] Заменить hardcoded values (`speed = 300`, `life = 1.35`, offsets `9, -9, 17, -17`) на balance constants
- [ ] Убрать неиспользуемый параметр `bulletIndex` в `checkCollision()`

---

## Низкий приоритет (Polish)

### 16. `game/systems/EntityPoolSystem.ts` — 80 строк

- [ ] Переименовать в `EntityPools` (не система, а контейнер данных)
- [ ] Убрать `spawnEnemy()` делегирование
- [ ] Убрать position-based `removeAllyDroneAt()` — использовать UUID

### 17. `game/systems/ZoneSystem.ts` — 219 строк

- [ ] Убрать dead code: `clampToZone()` helper
- [ ] Заменить `overdrive = 0` на константу

### 18. `game/systems/UpgradeSystem.ts` — 97 строк

- [ ] Убрать `null!` non-null assertion
- [ ] Убрать `forceReload()` alias
- [ ] `purchaseNoCost()` — за Gate behind debug flag

### 19. `game/math.ts` — 66 строк

- [ ] Добавить docs к `lerpAngle()` catastrophic shift protection
- [ ] Убрать русские комментарии → английский
- [ ] Унифицировать PRNG (убрать `createRng`, оставить только `mulberry32`)

### 20. `game/fx.ts` — 116 строк

- [ ] Убрать `shake()` alias для `addShake()`

### 21. `game/render.ts` — 466 строк

- [ ] Магические числа → именованные константы
- [ ] Кэшировать результаты `rgba()` парсинга

### 22. `main.tsx` — 6 строк

- [ ] Добавить React Error Boundary

---

## План по фазам

### Фаза 0: Подготовка (3-5 задач)
- [ ] Добавить React Error Boundary (`main.tsx`)
- [ ] Добавить type-safe EventBus (discriminated union payloads)
- [ ] Добавить TypeScript check на i18n ключи (скрипт или тест)
- [ ] Добавить `.eslintrc` с правилами для max-len, max-lines-per-function
- [ ] Заменить все русские комментарии на английский

### Фаза 1: Разбивка God Class (5-6 задач)
- [ ] Разделить `game.ts` (цель: <400 строк)
- [ ] Вынести DeathSystem дублирование
- [ ] Вынести ApplyPickup логику
- [ ] Убрать дублирование орбиты дронов
- [ ] Убрать setTimeout из game loop
- [ ] Убрать as any касты

### Фаза 2: Разбивка крупных файлов (6-8 задач)
- [ ] Разделить `RendererSystem.ts` (868 → 4 файла)
- [ ] Разделить `audio.ts` (695 → 4 файла)
- [ ] Разделить `CollisionSystem.ts` (432 → 4 файла)
- [ ] Разделить `PlayerSystem.ts` (529 → 3 файла)
- [ ] Разделить `EnemySystem.ts` (452 → 2 файла + dead code cleanup)
- [ ] Разделить `Screens.tsx` (714 → 6+ файлов)

### Фаза 3: Рефакторинг систем (4-5 задач)
- [ ] Исправить `WaveOrchestrator.ts` (setTimeout утечки, именованные константы)
- [ ] Исправить `BulletSystem.ts` (dual ownership, magic numbers)
- [ ] Исправить `SpawnSystem.ts` (typed interface, magic numbers)
- [ ] Разделить `balance.ts` (337 → 5 файлов)
- [ ] Улучшить `FSMBridge.ts` (убрать mysterious sender)

### Фаза 4: UI Polish (3-4 задачи)
- [ ] Рефакторинг `App.tsx` (вынести sub-components, useReducer, hooks)
- [ ] Убрать все дублирования (`formatTime`, reset sequence, localStorage boilerplate)
- [ ] Добавить accessibility: aria-pressed, type="button", aria-modal
- [ ] Добавить `aria-label` на canvas

### Фаза 5: Финальный полинг (3-4 задачи)
- [ ] Убрать все dead code (`checkSideFree`, `shake()` alias, `clampToZone`, `hasListeners`)
- [ ] Унифицировать PRNG в `math.ts`
- [ ] Добавить docs к критичным алгоритмам
- [ ] Финальный typecheck + lint + manual testing

---

## Метрики успеха

| Метрика | Текущее | Цель |
|---|---|---|
| Самый большой файл | 1122 строки (`game.ts`) | <500 строк |
| Файлов >500 строк | 6 | 0 |
| Файлов >300 строк | 11 | <4 |
| Magic numbers | ~150+ | <20 (именованные константы) |
| Dead code | ~200 строк | 0 |
| Дублирования кода | 4-5 заметных | 0 |
| TypeScript errors | 0 | 0 |
| ESLint errors | N/A | 0 |
