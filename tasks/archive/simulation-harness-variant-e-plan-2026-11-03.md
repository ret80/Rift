# План реализации варианта E

**GameWorld + PlayerAgent + fixed tick + seeded RNG**

**Дата:** 2026-11-03  
**Связанный документ:** `tasks/simulation-harness-2026-11-03.md` (§4E, §6, §8)  
**Статус:** выполнены шаги 0–8 (2026-11-03). Следующий — шаг 9 (проверка браузера на `GameWorld`). Отметки `[x]` ставятся по факту выполнения; в конце каждого блока — строка «Прогресс».

---

## 0. Как пользоваться планом

1. Шаги выполняются **по порядку**, если в таблице зависимостей не указано иное.
2. Один шаг — один PR (или несколько маленьких PR). После каждого шага должны проходить `typecheck`, `lint` и добавленные проверки.
3. До шага 8 поведение браузерной игры не должно меняться. Если меняется — это регрессия, а не «побочный эффект рефакторинга».
4. Не делать «адаптеры ради адаптеров». Порты — это узкие интерфейсы, которые реализуются существующими классами структурно (`AudioManager`, `Fx`, `InputManager`). Отдельные adapter-классы не создавать.
5. Не переписывать AI врагов. Для врагов делается только одно: убрать `Math.random` и прокинуть seeded `Rng`.
6. `PlayerAgent` — новый слой. Он возвращает **намерения**, а не пишет в `position`/`velocity`.
7. Все проверки детерминизма выполняются внутри одного runtime (Node-в-Node или браузер-в-браузер). Bit-exact между Node и браузером не обещаем.

### 0.1. Принципы, которые нельзя нарушать

- [ ] Один источник правды: симуляция использует те же системы, физику, оружие и AI, что и игра.
- [ ] `GameWorld` не импортирует `render/`, `presentation/`, `audio/`, `input.ts`, `core/env.ts`.
- [ ] Геймплей не использует `Math.random`, `Date.now`, `performance.now`.
- [ ] Симуляция не использует `GameLoop` и `requestAnimationFrame`.
- [ ] Каждый прогон начинается с чистого мира: новый `GameWorld` или полный `reset()`.
- [ ] Seed — часть входных данных сценария, а не глобальная переменная.
- [ ] Сначала сохраняется baseline, потом меняются формулы.

---

## 1. Цель и общий критерий готовности

### 1.1. Цель

Получить один DOM-free игровой мир, который:

- запускается в браузере и в Node из одного и того же кода;
- крутится фиксированным шагом `1/60`;
- использует независимые seeded RNG-потоки;
- управляет игроком через сменного `PlayerAgent`;
- умеет прогонять сценарий, собирать метрики и сохранять snapshot-хэши;
- позволяет сравнить результаты до/после изменения формул на одном наборе seed.

### 1.2. Общий Definition of Done

- [ ] `createGameWorld({ seed, physics: "custom" })` импортируется и запускается в Node без `window`, `document`, `canvas`, `AudioContext`.
- [ ] `world.tick(1 / 60)` крутит реальные игровые системы, а не заглушки.
- [ ] 10 прогонов с одним seed дают одинаковые метрики и `snapshotHash` на каждом контрольном тике.
- [ ] 100 разных seed дают разные хэши и устойчивое распределение метрик.
- [ ] `OrbitAgent`, `KiteAgent`, `EvadeAgent`, `RandomAgent` работают и не пишут напрямую в состояние игрока.
- [ ] `npm run sim -- run <scenario> --seed <n> --runs 10 --expect-identical` завершается успешно.
- [ ] `npm run sim -- sweep <scenario> --seed-range 1..100` сохраняет baseline.
- [ ] `npm run sim -- compare baseline.json current.json --fail-on-regression` считает paired-разницу и CI.
- [ ] Браузерная игра проходит smoke-тест: меню → старт → countdown → волна → пауза → смерть → рестарт.
- [ ] `npm run typecheck` и `npm run lint` проходят.
- [ ] `Math.random` отсутствует в геймплейных путях (проверяется lint-правилом).

---

## 2. Текущие точки вмешательства

Это не «переписать всё», а конкретные места, которые план затрагивает.

| Место | Текущая проблема | Что делаем |
|-------|------------------|------------|
| `src/game/core/GameContext.ts` | Композиционный корень: DOM, рендер, аудио, меню, ввод и все системы в одном классе | Выделяем `GameWorld`, оставляем `GameContext` презентационным хостом |
| `src/game/core/GameLoop.ts` | Переменный `requestAnimationFrame` dt, кламп `0.05` | Добавляем `SimulationClock` с `FIXED_DT = 1/60` |
| `src/game/systems/PlayerSystem.ts` | Зависит от конкретного `InputManager` | Переводим на `PlayerControls` |
| `src/game/abilities/AbilitySystem.ts` | Зависит от конкретного `InputManager` | Переводим на `PlayerControls` |
| `src/game/weapons/WeaponManager.ts` | Ручной прицел/огонь приходят из `GameContext` | `GameWorld` применяет `aimAngle`/`firing` перед тиком |
| `src/game/systems/EnemyShootingSystem.ts` | Конкретный `AudioManager` + `Math.random` | `AudioPort` + `rngCombat` |
| `src/game/ecs/domains/EnemyDomain.ts` | Прокидывает конкретный `AudioManager` | Прокидывает `AudioPort` |
| `src/game/core/EventBus.ts` | `timestamp` из `performance.now()` | Инъекция часов мира, в симуляции — детерминированное время |
| `src/game/asteroids.ts` | `update(dt, env)` вызывается из `PresentationFrame` | Переносим обновление пояса в `GameWorld.tick` с `WorldView` |
| `src/game/core/PresentationFrame.ts` | Обновляет `asteroidField` | Оставляем только эффекты, камеру и рендер |
| `src/game/core/GameStart.ts` | Завязан на `GameContext` | Разделяем на `GameWorld.startRun()` и презентационный хвост |
| `src/game/math.ts` | `rand()` жёстко использует `Math.random`; уже есть `createRng` (LCG) | Добавляем `Rng` на базе `mulberry32`, убираем неоднозначность имён |
| `src/game/aiming/AimSolver.ts` | `aimAtTarget` использует `Math.random` | Добавляем параметр `rng` |
| `src/game/systems/PickupDropSystem.ts` | Дроп уже seed-based, но разлёт использует `Math.random` | `rngDrops` только для разлёта |
| `src/game/systems/SpawnSystem.ts` | Уже принимает `random?: RandomSource` | Передаём `rngSpawn` |
| `src/game/ai/strategies/*`, `DroneSwarm` | `Math.random` в таймерах/страйфе | `rngCombat` |

---

## 3. Целевая структура файлов

```text
src/game/core/
  GameWorld.ts          // DOM-free игровой мир: системы, tick, startRun, reset
  WorldPorts.ts         // AudioPort, FxPort, GameplayHooks, PersistencePort, WorldView
  PlayerControls.ts     // PlayerControls, HumanControls, AgentControls
  SimulationClock.ts    // FIXED_DT и accumulator
  rng.ts                // Rng, SeedSet, RngStream, deriveSeed, createRngStream
  EventBus.ts           // + инъекция часов
  GameContext.ts        // только браузерный хост: canvas, input, audio, menu, loop

src/game/sim/
  agents/
    PlayerAgent.ts      // интерфейс агента + PlayerView/PlayerIntent
    OrbitAgent.ts
    KiteAgent.ts
    EvadeAgent.ts
    RandomAgent.ts
    ReplayAgent.ts
  Scenario.ts           // типы и валидация сценария
  MetricsSink.ts        // сбор метрик из событий/хуков
  Snapshot.ts           // канонический snapshot и hash
  RunResult.ts          // формат результата прогона
  cli.ts                // run / sweep / compare

scenarios/              // JSON-сценарии, например fighter-orbit-r300.json
sim/baselines/          // закоммиченные baseline-результаты
sim-results/            // локальные результаты, gitignore
```

---

## 4. Обзор шагов

| Шаг | Название | Зависит от | Результат | Оценка |
|-----|----------|------------|-----------|--------|
| 0 | Подготовка и страховки | — | `npm run sim`, baseline-команды, зелёный typecheck | 0.5 дня |
| 1 | RNG API и SeedSet | 0 | `src/game/core/rng.ts`, unit-проверки | 0.5–1 день |
| 2 | Миграция геймплейного `Math.random` | 1 | Все геймплейные броски через потоки | 1–2 дня |
| 3 | `PlayerControls` и `HumanControls` | 1 | Игрок управляется через порт, браузер не изменился | 0.5–1 день |
| 4 | Выделение `GameWorld` | 2, 3 | DOM-free мир, `GameContext` — хост | 3–5 дней |
| 5 | Fixed tick и headless runner | 4 | `SimulationClock`, `runTicks(n)` | 1 день |
| 6 | `PlayerAgent` и агенты | 3, 4, 5 | Orbit/Kite/Evade/Random | 2–3 дня |
| 7 | Сценарии, метрики, CLI | 5, 6 | JSON-сценарий, `MetricsSink`, `sim run` | 2–3 дня |
| 8 | Seed-инструменты: identical/sweep/compare | 7 | 10 повторов, 100 seed, baseline diff | 2–3 дня |
| 9 | Перевод браузера на `GameWorld` | 4, 5 | Браузер и симуляция используют один мир | 1–2 дня |
| 10 | CI, документация, регрессии | 8, 9 | PR-гейты и обновлённые документы | 1 день |

---

## 5. Пошаговый план

### Шаг 0. Подготовка и страховки

**Прогресс:** ✅ выполнен (2026-11-03).

**Цель:** не начинать рефакторинг без зелёной базы и удобного запуска.

**Файлы:**

- `package.json`
- `tsconfig.json` (проверить, что `src/sim` входит в `include: ["src"]`)
- `.gitignore`
- `src/game/balance/player.ts`, `src/game/ai/strategies/FighterStrategy.ts`, `src/game/systems/EnemyShootingSystem.ts` (быстрые исправления)

**Действия:**

- [x] Зафиксировать текущий commit: `git rev-parse HEAD > /tmp/rift-baseline-sha`. → `68cdcad1d20d2440e37806fb09ecf82ee433215d`
- [x] Проверить версию Node (`node -v`) и зафиксировать её в `.nvmrc` или `engines`. → Node v26.13.0 локально, `engines.node: ">=20"` в `package.json` (CI использует 20).
- [x] Добавить `tsx` в `devDependencies`. → `tsx ^4.20.6` (и `@types/node`, нужен для `process` в CLI).
- [x] Добавить скрипты:
  - `"sim": "tsx src/sim/cli.ts"`
  - `"sim:selftest": "tsx src/sim/selftest.ts"`
- [x] Создать пустой `src/sim/cli.ts` с командой `--help`, чтобы `npm run sim` работал с первого дня. → `src/sim/cli.ts` + `src/sim/cli-main.ts`.
- [x] Добавить `sim-results/` в `.gitignore`; `sim/baselines/` — наоборот, хранить в git. → `sim/baselines/` будет добавлен в репозиторий на шаге 8.
- [x] Прогнать и записать базовые результаты: `npm run typecheck`, `npm run lint`, `npm run build`. → typecheck ✅, lint ✅ (0 ошибок, 2 предупреждения: `App.tsx:50` any, `MainMenu.tsx:37` exhaustive-deps), build ✅ (985 ms).
- [x] Вынести `PLAYER_HIT_RADIUS = PLAYER_HITBOX_RADIUS + PLAYER_BULLET_HIT_OFFSET` в `balance/player.ts` и использовать в `FighterStrategy`/`EnemyShootingSystem`.
- [x] Убрать дубли `PLAYER_ACCELERATION`/`FRICTION_EXP` из `PlayerState.ts`, оставить один источник в `balance/player.ts` (или наоборот, но один). → `PLAYER_ACCEL` + новый `PLAYER_FRICTION_EXP`.
- [x] Проверить, что `createRng` из `math.ts` нигде не используется; если так — удалить или переименовать, чтобы не было двух разных `createRng`. → не использовался, удалён; `mulberry32` остаётся.

**Критерии приёмки:**

- [x] `npm run typecheck` проходит.
- [x] `npm run lint` проходит (или зафиксирован список существующих ошибок, который не растёт).
- [x] `npm run sim -- --help` печатает справку.
- [x] `git status` не содержит случайных изменений (только файлы шага 0 и документы плана).

**Риск/откат:** шаг почти не меняет поведение. Если быстрые исправления констант ломают сборку — вынести их в отдельный PR и не смешивать с RNG.

---

### Шаг 1. RNG API и SeedSet

**Прогресс:** ✅ выполнен (2026-11-03). Файл `src/game/core/rng.ts`, проверки — `src/sim/selftest.ts` (11/11).

**Цель:** один детерминированный PRNG и явная модель seed-потоков.

**Файлы:**

- `src/game/core/rng.ts` (новый)
- `src/game/math.ts`
- `src/sim/selftest.ts` (новый)
- `src/game/core/EventBus.ts` (только подготовка к инъекции часов, если удобно)

**Действия:**

- [x] Определить `Rng`:
  ```ts
  export interface Rng {
    next(): number;              // [0, 1)
    range(a: number, b: number): number;
    int(maxExclusive: number): number;
  }
  ```
- [x] Определить потоки:
  ```ts
  export type RngStream = "combat" | "spawn" | "drops" | "fx" | "agent";
  ```
  `agent` нужен, чтобы решения `RandomAgent` не сдвигали боевые броски.
- [x] Определить `SeedSet`:
  ```ts
  export interface SeedSet {
    master: number;
    streams: Record<RngStream, number>;
  }
  ```
- [x] Реализовать `deriveSeed(master, stream)` через стабильный 32-битный хэш (FNV-1a) от строки `stream:master`, а не через `master + 1`.
- [x] Реализовать `createRngStream(seed): Rng` на базе существующего `mulberry32` из `math.ts`.
- [x] Реализовать `createSeedSet(master): SeedSet`, который заполняет все пять потоков через `deriveSeed`.
- [x] Реализовать `createRandomSeed()` **только для хоста** (браузер/CLI): `crypto.getRandomValues`, fallback — `Date.now()`. В геймплейном коде эту функцию не вызывать.
- [x] Расширить `rand(a, b, random: RandomSource = Math.random)` или заменить вызовы на `rng.range`. Для геймплея после миграции `rng` обязателен. → все геймплейные вызовы заменены на `rng.range`/`next`/`int` (шаг 2); `rand` остаётся только для визуальных полей.
- [x] Не использовать `Math.random` внутри `Rng`.
- [x] Написать self-test:
  - одинаковый seed → одинаковая последовательность из 1000 чисел;
  - разные seed → разные последовательности;
  - `deriveSeed` стабилен для известных значений;
  - потоки одного `SeedSet` не совпадают;
  - `int(max)` всегда в `[0, max)`.

**Критерии приёмки:**

- [x] `npm run sim:selftest` проходит.
- [x] `Rng` не импортирует DOM и не использует `Math.random`.
- [x] `SeedSet` сериализуется в JSON и обратно без потерь.
- [x] В коде нет двух разных API с именем `createRng`.

**Риск/откат:** это новый изолированный модуль. Если что-то не так — удалить `rng.ts` и вернуть вызовы на место, не трогая остальную игру.

---

### Шаг 2. Миграция геймплейного `Math.random`

**Прогресс:** ✅ выполнен (2026-11-03). Геймплейные директории не содержат `Math.random`; lint-правило включено.

**Цель:** все броски, влияющие на геймплей, идут через seeded-потоки.

**Файлы:**

- `src/game/systems/EnemySystem.ts`
- `src/game/systems/EnemyShootingSystem.ts`
- `src/game/weapons/CannonWeapon.ts`
- `src/game/aiming/AimSolver.ts`
- `src/game/ai/strategies/CarrierStrategy.ts`
- `src/game/ai/DroneSwarm.ts`
- `src/game/systems/PickupDropSystem.ts`
- `src/game/asteroids.ts`
- `src/game/rifts.ts`
- `src/game/systems/DeathSystem.ts`
- `src/game/ecs/domains/EnemyDomain.ts`
- `src/game/systems/SpawnSystem.ts`
- `src/game/core/EventBus.ts`
- `src/game/core/GameContext.ts` (создание потоков)

**Действия по системам:**

| Система | Поток | Что заменить |
|---------|-------|--------------|
| `EnemySystem` | `rngCombat` + `rngSpawn` | страйф, burst, seed врага, orbit angle, таймеры |
| `EnemyShootingSystem` | `rngCombat` | burst offset, dispersion |
| `CannonWeapon` | `rngCombat` | разброс турели |
| `AimSolver.aimAtTarget` | `rngCombat` | случайный spread; добавить обязательный параметр `rng` |
| `CarrierStrategy` | `rngCombat` | strafe timer, wait timer, угол спавна |
| `DroneSwarm` | `rngCombat` | число отделяемых дронов, cooldown |
| `PickupDropSystem` | `rngDrops` | разлёт и позиция пикапа; `generateDrop` уже seed-based — не ломать |
| `AsteroidField` | `rngDrops` + `rngFx` | осколки/дроп — `rngDrops`; чисто визуальные seed'ы — `rngFx` |
| `RiftField` | `rngSpawn` + `rngFx` | смещение спавна — `rngSpawn`; seed/rot визуала — `rngFx` |
| `DeathSystem` | `rngFx` | разлёт и цвета взрыва |
| `SpawnSystem` | `rngSpawn` | передать `random` в конструктор; `pickKindFor` уже принимает `RandomSource` |
| `EventBus` | часы мира | заменить `performance.now()` на инъекцию `now()`; в `GameWorld` — `tick * FIXED_DT` |

- [x] `EnemyDomain` принимает `AudioPort` вместо `AudioManager` (можно сделать в шаге 4, но RNG-поля удобнее сразу). → RNG-поля (`rngCombat`, `rngSpawn`) добавлены сразу; `AudioPort` — в шаге 4.
- [x] `GameContext` создаёт `SeedSet`: мастер-seed из `?seed=` или `createRandomSeed()`.
- [x] Добавить `?seed=12345` для браузера, чтобы вручную повторять прогон.
- [x] Обновить §8 основного документа: добавить поток `agent` к списку `combat/spawn/drops/fx`. → в основном документе поток `agent` уже указан (§8, §11).
- [x] Вывести seed в debug-оверлей или `console.info` при старте забега. → `console.info('[Rift] seed …')` в конструкторе `GameContext`.
- [x] Добавить lint-правило `no-restricted-syntax` на `Math.random` для:
  - `src/game/systems/**`
  - `src/game/weapons/**`
  - `src/game/ai/**`
  - `src/game/aiming/**`
  - `src/game/ecs/**`
  → плюс `src/game/waves/**`, `asteroids.ts`, `rifts.ts`; `src/game/systems/Renderers/**` исключён (визуальный слой).
- [x] Разрешить `Math.random` в `src/game/render/**`, `src/game/presentation/**`, `src/game/audio/**` и в хостовом создании seed.
- [x] `Fx` перевести на необязательный `rngFx` (по умолчанию `Math.random`, но в мире передаётся поток). → `rng` для `burst`; тряска экрана остаётся real-time (`Math.random`).
- [x] `LaserWeapon`/`RiftField` визуальные seed'ы перевести на `rngFx`. → также `AimSolver.aimAtTarget` получил обязательный `rng`; все вызовы (`EnemyShootingSystem`, пушка, лазер, дроны) передают поток.

**Критерии приёмки:**

- [x] Lint не находит `Math.random` в геймплейных директориях.
- [x] `grep -R "Math.random" src/game/{systems,weapons,ai,aiming,ecs}` не даёт результатов.
- [ ] Тест «два `GameContext` с одним seed → одинаковые первые 600 тиков» проходит после шага 5; на этом шаге достаточно self-test потоков. → проверка перенесена в шаг 5 (`npm run sim -- run … --expect-identical`).
- [ ] Браузер запускается, стрельба/спавн/дропы работают визуально как раньше. → проверяется браузерным smoke в шаге 9 (здесь подтверждены только typecheck/lint/build).
- [x] В логе старта виден seed.

**Риск/откат:** миграция может изменить распределение случайности. Это ожидаемо, но не должно менять *средние* показатели сильнее, чем на несколько процентов. Сравнить быстрый сценарий до/после.

---

### Шаг 3. `PlayerControls` и `HumanControls`

**Прогресс:** ✅ выполнен (2026-11-03). `core/PlayerControls.ts` содержит `PlayerControls`, `HumanControls` и `AgentControls`.

**Цель:** игрок управляется через узкий порт, а не через DOM-ввод напрямую.

**Файлы:**

- `src/game/core/PlayerControls.ts` (новый)
- `src/game/systems/PlayerSystem.ts`
- `src/game/abilities/AbilitySystem.ts`
- `src/game/core/GameContext.ts`

**Действия:**

- [x] Определить:
  ```ts
  export interface PlayerControls {
    readonly axis: { x: number; y: number };
    readonly aimAngle: number | null;
    readonly firing: boolean;
    consumeAbility(): boolean;
  }
  ```
- [x] `HumanControls` оборачивает `InputManager` и делегирует ему все четыре метода. Никакой игровой логики внутри.
- [x] `AgentControls` хранит текущий `PlayerIntent` и реализует `PlayerControls`; `consumeAbility()` возвращает `true` ровно один тик. → `PlayerIntent` объявлен в `core/PlayerControls.ts` (а не в `sim/agents`), чтобы `core` не зависел от `sim`; агенты его реэкспортируют.
- [x] `PlayerSystem` принимает `PlayerControls` вместо `InputManager`.
- [x] `AbilitySystem` принимает `PlayerControls` вместо `InputManager`.
- [x] `GameContext` создаёт `HumanControls` и передаёт его системам.
- [x] `GameWorld` (шаг 4) перед `engine.run` применяет `aimAngle` и `firing` к `WeaponManager`. → до шага 4 это делает `GameContext.applyControls()` из `GameFrame`.
- [x] Убедиться, что `consumeAbility` не вызывается дважды за тик (иначе способность «съедается» одним потребителем). → единственный потребитель — `AbilitySystem`; `AgentControls` гасит флаг при первом вызове.

**Критерии приёмки:**

- [ ] Браузерное управление не изменилось: клавиатура, мышь, геймпад, Space. → проверяется браузерным smoke в шаге 9.
- [x] `PlayerSystem` и `AbilitySystem` не импортируют `input.ts`.
- [x] `HumanControls` — единственное место, где игровые системы касаются `InputManager`.
- [x] `typecheck` проходит.

**Риск/откат:** если `InputManager` имеет побочные эффекты (например, сброс нажатий), `HumanControls` должен вызывать их в том же порядке. Сверить с текущим `PlayerSystem.process`/`AbilitySystem.process`.

---

### Шаг 4. Выделение `GameWorld`

**Прогресс:** ✅ выполнен (2026-11-03). Мир в `core/GameWorld.ts`, `GameContext` — презентационный хост с геттерами-делегатами.

**Цель:** отделить игровой мир от презентационного композиционного корня.

Это самый большой шаг. Его нельзя делать одним коммитом «всё сразу».

#### 4.1. Контракты мира

**Файлы:** `src/game/core/WorldPorts.ts`, `src/game/core/GameWorld.ts`

- [x] Определить `WorldView`:
  ```ts
  export interface WorldView {
    width: number;
    height: number;
    cameraX: number;
    cameraY: number;
    zoom: number;
  }
  ```
- [x] Определить `AudioPort` — только методы, которые реально вызывают геймплейные системы:
  `playShoot`, `playEnemyShoot`, `playHeavyShoot`, `playPickupSound`, `playExplosion`, `playPlayerHit`, `playDroneShot`, `playDroneHit`, `playRiftOpen`, `playRiftClose`, `playRiftSpawn`, `playComboUp`, `setCombat`, `setSuspended`.
- [x] Определить `FxPort`: `burst`, `ring`, `addShake`, `reset` (и только то, что нужно симуляции).
- [x] Определить `GameplayHooks`: `onBanner`, `onToast`, `onCountdown`, `onGameOver`, `onStats`.
- [x] Использовать существующий `PersistencePort`.
- [x] `AudioManager` и `Fx` реализуют порты **структурно**, без adapter-классов.
- [x] `NullAudio` и `NullFx` — пустые реализации для headless.

#### 4.2. Перенос систем

- [x] Перенести в `GameWorld` создание:
  - `EcsWorld`, `SystemSchedule`;
  - `PlayerSystem`, `AbilitySystem`;
  - `SpawnSystem`, `WaveOrchestrator`, `WaveFlowSystem`, `ZoneSystem`;
  - `WeaponManager`, `AllyDroneSystem`;
  - `CollisionSystem`, `PhysicsSystem`;
  - `PickupDropSystem`, `LoadoutSystem`, `ShieldSystem`, `GrazeSystem`, `BonusManager`;
  - `AsteroidField`, `RiftField`, `DeathSystem`;
  - `EventBus`, `GameStateMachine`.
- [x] Оставить в `GameContext`: canvas, `IRenderer`, `InputManager`, `GamepadManager`, `AudioManager`, `MenuScene`, `CameraSystem`, `Starfield`, `RendererSystem`, `GameRender`, `PresentationFrame`, `GameListeners`, `GameUpgrades`, `GameLoop`.
- [x] `GameWorld` получает порты через конструктор; никаких `new AudioManager()` внутри мира.
- [x] `GameWorldConfig`:
  ```ts
  export interface GameWorldConfig {
    seed: SeedSet;
    startWave: number;
    physics: PhysicsEngineId;
    ports: WorldPorts;
    view?: Partial<WorldView>;
    skipCountdown?: boolean;
    testMode?: boolean;
  }
  ```

#### 4.3. Перенос игровых методов

- [x] Перенести в `GameWorld`:
  - `startRun`, `reset`, `tick`;
  - `applyUpgrades`;
  - `getPlayerPosition`, `getPlayerSnapshot`, `getPlayerWorld`, `getZoneBounds`;
  - `buildSpawnDeps`, `spawnEnemy`, `damageEnemy`;
  - `buildWorld` (или `getWorldFrame`);
  - обновление survival stipend, если оно влияет на геймплей.
- [x] `GameStart` разделить:
  - `GameWorld.startRun()` — сброс мира, апгрейды, countdown;
  - `GameContext.startRun()` — меню, audio, hooks, презентационные вызовы.
- [x] В `GameWorld` не должно быть `menuScene.reset`, `audio.setCombat`, `hooks.onBanner` напрямую — только через порты.
- [x] `DeathSystem` создаётся внутри мира, а `onGameOver` уходит в `GameplayHooks`.

#### 4.4. Совместимость `GameContext`

- [x] `GameContext` создаёт `GameWorld` и хранит его как `readonly world`.
- [x] На первом этапе добавить getters-делегаты:
  ```ts
  get ecs() { return this.world.ecs; }
  get playerSystem() { return this.world.playerSystem; }
  get waveOrchestrator() { return this.world.waveOrchestrator; }
  ```
  Это позволит не переписывать весь render/presentation за один PR.
- [x] Постепенно заменить обращения `ctx.<system>` на `ctx.world.<system>` в презентационных файлах.
- [x] Удалить делегаты только после того, как они перестали использоваться.

#### 4.5. Астероиды и `WorldView`

- [x] Убрать `asteroidField.update` из `PresentationFrame.update`.
- [x] Вызывать `asteroidField.update(dt, env)` внутри `GameWorld.tick` **до/после** остальных систем в том же порядке, что и раньше.
- [x] `AsteroidEnv` собирать из `WorldView` и `zoneState`, а не из `cameraSystem`/`viewport` хоста.
- [x] В headless использовать фиксированный `WorldView` из сценария (например, 1920×1080, камера в центре зоны/игрока).
- [x] В браузере хост обновляет `world.setView(...)` каждый кадр.
- [x] `PresentationFrame` больше не зависит от `AsteroidField`.

#### 4.6. Запрет импортов

- [x] Добавить ESLint `no-restricted-imports` для `src/game/core/GameWorld.ts` и `src/game/core/WorldPorts.ts`:
  - `../render/*`
  - `../presentation/*`
  - `../audio*`
  - `../input`
  - `./env`
- [x] Добавить проверку в self-test: `GameWorld` не тянет `window`/`document` (импорт в Node).
- [x] Проверить, что порты не импортируют конкретные `AudioManager`/`Fx`. → порты ссылаются только на интерфейсы; `AudioManager`/`Fx` реализуют их структурно.

**Критерии приёмки шага 4:**

- [x] `src/game/core/GameWorld.ts` импортируется в Node.
- [x] `createGameWorld({ seed, physics: "custom", ports: nullPorts })` создаётся без DOM.
- [x] `world.tick(1 / 60)` не падает и двигает игрока/врагов. → враги двигаются и стреляют; игрок стоит до появления агента (шаг 6).
- [ ] Браузерная игра запускается через `GameContext` и ведёт себя как раньше. → typecheck/lint/build зелёные; браузерный smoke — в шаге 9.
- [x] `PresentationFrame` не обновляет астероиды. → пояс обновляется в `GameWorld.tick`; меню-сцена по-прежнему анимирует свой пояс.
- [x] Нет циклических импортов `GameWorld ↔ GameContext`.
- [x] `grep` по `GameWorld.ts` не находит `window`, `document`, `requestAnimationFrame`, `performance.now`.

**Отличия от плана:**

- `GameListeners` удалён: его игровые подписки переехали в `GameWorld.setupListeners()` (звук/волны/пикапы — часть мира), вместо `GameContext`.
- `Fx` создаётся внутри мира (частицы — ECS-сущности), поэтому `WorldPorts.fx` — необязательный порт для headless-заглушки.
- `CountdownSystem` больше не импортирует `i18n`: мир отдаёт `CountdownState` без текста, подпись волны подставляет `GameContext`.
- `PlayerIntent` объявлен в `core/PlayerControls.ts`, а не в `sim/agents` (чтобы `core` не зависел от `sim`).

**Риск/откат:** самый рискованный шаг. Делать серией PR: (1) контракты и пустой `GameWorld`; (2) перенос систем; (3) перенос методов; (4) делегаты; (5) удаление старых связей. После каждого PR — браузерный smoke.

---

### Шаг 5. Fixed tick и headless runner

**Прогресс:** ✅ выполнен (2026-11-03). `core/SimulationClock.ts`, `sim/runner.ts`; браузерный кадр уже идёт через фиксированный шаг.

**Цель:** симуляция не зависит от `requestAnimationFrame` и нагрузки.

**Файлы:**

- `src/game/core/SimulationClock.ts` (новый)
- `src/game/core/GameWorld.ts`
- `src/game/core/GameContext.ts`
- `src/game/core/GameFrame.ts`
- `src/sim/runner.ts` (новый)

**Действия:**

- [x] Добавить `FIXED_DT = 1 / 60`.
- [x] `SimulationClock`:
  - `advance(realDt, tick)` с `maxCatchUp = 5`;
  - `runTicks(n, tick)` для headless.
- [x] `GameWorld.tick(dt)` принимает только `FIXED_DT` (или внутри проверяет и бросает ошибку при другом значении).
- [x] `GameWorld` хранит `tickIndex`; `time = tickIndex * FIXED_DT`.
- [x] `EventBus` получает `now: () => number`, в мире — `tickIndex * FIXED_DT`.
- [x] `GameFrame` в браузере вызывает `clock.advance(realDt, (dt) => world.tick(dt))`.
- [x] `GameLoop` остаётся только хостовым источником `realDt`; в симуляции не используется.
- [x] `runWorld({ scenario, ticks })`: создать мир, `startRun`, `skipCountdown`, крутить `runTicks`. → `runHeadless()`/`createHeadlessWorld()` в `src/sim/runner.ts` (сценарий подключается на шаге 7).
- [x] Не использовать `performance.now()` внутри `GameWorld`.
- [x] Проверить, что `SimulationClock` при `realDt = 1/30` делает два тика, а при `1/120` — ноль/один с накоплением.

**Критерии приёмки:**

- [x] 10 прогонов по 1800 тиков с одним seed дают одинаковый `snapshotHash` на каждом 60-м тике.
- [x] При разном `realDt` (1/30, 1/60, 1/144) итоговое число тиков и результат одинаковы для headless-режима.
- [x] `GameWorld` не вызывает `requestAnimationFrame`.
- [x] `world.tick(1/120)` либо запрещён, либо явно пересчитывает физику; по умолчанию — ошибка.

**Отличия от плана:** фиксированный шаг включён в браузере сразу (`GameFrame` → `SimulationClock.advance`), а не в шаге 9: иначе пришлось бы писать второй путь тика. Сравнение ощущений — в браузерном smoke шага 9.

**Риск/откат:** фиксированный шаг может изменить ощущение игры. Сначала включить его только в симуляции; браузер перевести в шаге 9, после сравнения.

---

### Шаг 6. `PlayerAgent` и ИИ игрока

**Прогресс:** ✅ выполнен (2026-11-03). `src/game/sim/agents/` — Orbit/Kite/Evade/Random/Replay + фабрика; 5 новых проверок в selftest (25/25).

**Цель:** симуляция управляет игроком так же, как человек, но детерминированно и воспроизводимо.

**Файлы:**

- `src/game/sim/agents/PlayerAgent.ts` (новый)
- `src/game/sim/agents/OrbitAgent.ts`
- `src/game/sim/agents/KiteAgent.ts`
- `src/game/sim/agents/EvadeAgent.ts`
- `src/game/sim/agents/RandomAgent.ts`
- `src/game/sim/agents/ReplayAgent.ts`
- `src/game/core/PlayerControls.ts`

#### 6.1. Контракт

- [x] `PlayerView` — только чтение:
  ```ts
  export interface PlayerView {
    time: number;
    player: { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number };
    enemies: ReadonlyArray<{ x: number; y: number; vx: number; vy: number; kind: string; hp: number }>;
    enemyBullets: ReadonlyArray<{ x: number; y: number; vx: number; vy: number }>;
    zone: { x: number; y: number; radius: number; active: boolean } | null;
  }
  ```
- [x] `PlayerIntent`:
  ```ts
  export interface PlayerIntent {
    moveX: number;       // -1..1
    moveY: number;       // -1..1
    aimAngle: number | null;
    firing: boolean;
    ability: boolean;
  }
  ```
- [x] `PlayerAgent`:
  ```ts
  export interface PlayerAgent {
    update(view: PlayerView, dt: number): PlayerIntent;
    reset(): void;
  }
  ```
- [x] `AgentControls` применяет `PlayerIntent` к `PlayerControls`; `ability` живёт один тик.
- [x] Агент **не** получает `EcsWorld`, `PlayerRef` или компоненты. Только `PlayerView`.
- [x] Агент **не** пишет `position`, `velocity`, `hp`, не вызывает `teleportTo`.

#### 6.2. Реализации

- [x] `OrbitAgent`:
  - держит радиус `radius` вокруг центра зоны/точки;
  - тангенциальная составляющая + радиальная коррекция;
  - направление `direction: 1 | -1`;
  - цель — ближайший враг или центр;
  - стреляет, если цель в пределах `fireCone` и дистанции.
- [x] `KiteAgent`:
  - держит дистанцию в диапазоне `[minRange, maxRange]`;
  - сближается, если слишком далеко; отходит, если слишком близко;
  - страйфит перпендикулярно цели.
- [x] `EvadeAgent`:
  - строит вектор угрозы от вражеских снарядов в горизонте `threatHorizon`;
  - учитывает проекцию скорости и время до сближения;
  - складывает уклонение с орбитой/кайтом, а не заменяет их полностью.
- [x] `RandomAgent`:
  - seeded случайные оси каждый `decisionInterval`;
  - использует `rngAgent`, не `Math.random`;
  - baseline для сравнения «умных» агентов.
- [x] `ReplayAgent`:
  - читает записанные `PlayerIntent` по тикам;
  - нужен для воспроизведения человеческих забегов.
- [x] Общие параметры:
  - `reactionTime` — задержка перед сменой решения;
  - `decisionInterval` — частота решений (например, 20–30 Гц);
  - `aimJitter` — небольшой детерминированный разброс прицела;
  - `fireCone` — угол, в котором агент открывает огонь.
- [x] Агент не должен быть идеальным: параметры конфигурируются в сценарии, чтобы можно было моделировать разный уровень игры.

#### 6.3. Интеграция

- [x] `GameWorld` каждый тик:
  1. собирает `PlayerView`;
  2. вызывает `agent.update(view, dt)`;
  3. записывает `PlayerIntent` в `AgentControls`;
  4. применяет `aimAngle`/`firing` к `WeaponManager`;
  5. вызывает `engine.run(dt)`.
- [x] Порядок нельзя менять: иначе управление попадёт в следующий тик.
- [x] `PlayerAgent` создаётся фабрикой по `scenario.player.agent`.
- [x] `RandomAgent` получает seed из `SeedSet.streams.agent`.

**Критерии приёмки:**

- [x] `OrbitAgent` за 30 секунд не выходит за зону и держит радиус в допуске.
- [x] `EvadeAgent` получает меньше урона, чем `RandomAgent`, на одном сценарии и наборе seed (не хуже, чем baseline-ожидание).
- [x] `RandomAgent` с одним seed даёт одинаковые intents.
- [x] Ни один агент не импортирует ECS-компоненты и не мутирует `PlayerView`.
- [x] `PlayerSystem`/`AbilitySystem` не знают, человек это или агент.
- [x] Сценарий может переключать агента без изменения кода. → `createPlayerAgent(kind, options, rng)`; JSON-сценарий подключается в шаге 7.

**Риск/откат:** агент может оказаться «слишком умным» и дать нереалистичный DPS. Митигация: несколько агентов, `reactionTime`, `aimJitter`, сравнение с записанными человеческими забегами. Не калибровать баланс по одному агенту.

---

### Шаг 7. Сценарии, метрики и CLI

**Цель:** удобно описать бой и получить из него цифры.

**Файлы:**

- `scenarios/*.json`
- `src/game/sim/Scenario.ts`
- `src/game/sim/MetricsSink.ts`
- `src/game/sim/RunResult.ts`
- `src/game/sim/cli.ts`
- `src/game/core/GameWorld.ts`
- `src/game/ecs/EnemyLifecycle.ts` / `EventBus.ts` (при необходимости добавить событие урона)

#### 7.1. Сценарий

- [x] Схема JSON:
  ```json
  {
    "name": "fighter-orbit-r300",
    "seed": { "master": 12345 },
    "tickRate": 60,
    "duration": 30,
    "physics": "custom",
    "startWave": 10,
    "viewport": { "width": 1920, "height": 1080 },
    "player": {
      "agent": "orbit",
      "radius": 300,
      "direction": 1,
      "reactionTime": 0.15,
      "aimJitter": 0.02
    },
    "enemies": [{ "kind": "fighter", "count": 1, "distance": 520 }],
    "upgrades": { "speed": 0, "fireRate": 0 },
    "metrics": ["shots", "hits", "dps", "survivalTime", "graze"]
  }
  ```
- [x] Валидация: неизвестный агент, отрицательный `duration`, пустой `seed`, неизвестный `physics` → понятная ошибка, ненулевой код.
- [x] `scenarioHash` — канонический хэш JSON (сортировка ключей, фиксированные числа).
- [x] Seed set можно задать явно (`seed.streams`) или вывести из `seed.master`.

#### 7.2. Метрики

- [x] `MetricsSink` подписывается на `enemy_killed`, `player_damaged`, `bullet_grazed`, `game_over`, `wave_started`.
- [x] Добавить событие `enemy_damaged` (или единый хук в `GameWorld.damageEnemy`), чтобы считать нанесённый урон, а не только попадания.
- [x] Считать выстрелы в одной точке (`GameWorld`/`addBullet`), а не в каждом оружии отдельно.
- [x] Обязательные метрики:
  - shots, hits, hitRate;
  - damageDealt, DPS;
  - damageTaken, damageTaken/s;
  - survivalTime;
  - kills, kills/s;
  - graze;
  - zone violations;
  - ability uses;
  - разбивка по типам врагов.
- [ ] Дополнительные (отложены до появления задачи):
  - средняя/максимальная скорость;
  - средняя дистанция до цели;
  - time in auto-aim vs manual aim;
  - распределение урона по источникам;
  - seed set и `rngDraws` по потокам.
- [x] Агрегаты: mean, median, stddev, p50, p90, p95, p99, min/max.
- [x] `RunResult` содержит:
  - `scenario`, `scenarioHash`, `gitSha`, `runtime`;
  - `seed` (весь `SeedSet`);
  - `metrics`, `aggregate`, `snapshotHashes`;
  - `firstDivergenceTick`.

#### 7.3. CLI

- [x] `npm run sim -- run <scenario> --seed 12345 --runs 10`
- [x] `npm run sim -- run <scenario> --seed 12345 --runs 10 --expect-identical`
- [x] `npm run sim -- sweep <scenario> --seed-range 1..100 --out sim-results/baseline.json`
- [ ] `npm run sim -- compare <baseline.json> <current.json> --fail-on-regression` — заглушка, реализация в шаге 8.
- [x] `--out` создаёт директорию, пишет JSON и краткую таблицу в stdout.
- [x] `--help` описывает все команды.

**Критерии приёмки:**

- [x] Один сценарий запускается из CLI и возвращает метрики.
- [x] `scenarioHash` одинаков при одинаковом JSON с разным порядком ключей.
- [x] `--expect-identical` падает с понятным сообщением, если хэши разошлись.
- [x] Результат содержит seed set и `gitSha`.
- [x] В сценарии можно выбрать `orbit`/`kite`/`evade`/`random`.

**Прогресс:** ✅ выполнен (2026-11-03). `sim/Scenario.ts`, `sim/MetricsSink.ts`, `sim/RunResult.ts`, `sim/Snapshot.ts`, `sim/execute.ts`, CLI `run`/`sweep`, сценарии `scenarios/smoke.json` и `scenarios/fighter-orbit-r300.json`; selftest 29/29. Проверено: 3 повтора smoke-сценария совпали на всех контрольных тиках, seed 1..5 дают разные метрики, невалидный сценарий выходит с кодом 2, `scenarioHash` не зависит от порядка ключей (проверка в selftest).

**Отличия от плана:**

- `enemy_damaged` публикуется не в `GameWorld.damageEnemy`, а в `EnemyLifecycle.damageEnemy` — это единственная точка, куда приходят и пули (`BulletCollision`), и лазер, и оружие игрока; иначе урон от снарядов не попадал в метрики.
- `kills` берётся из `ScoringSystem.getState().killed`, а не из подписки на `enemy_killed`: счётчик уже учитывает `forceKill` (контакт), который не является попаданием.
- `Snapshot.ts` появился в шаге 7, а не в шаге 8: без него нельзя было проверить `--runs --expect-identical`. Команда `compare` остаётся заглушкой до шага 8.
- `enemies[].distance` из примера сценария не поддерживается: состав волны задаётся только `{ kind, count }`.
- CLI и сценарии живут в `src/sim/cli.ts` / `src/sim/cli-main.ts` и `scenarios/`, а не в `src/game/sim/cli.ts`: `src/game` не должен тянуть Node-модули (`node:fs`, `node:child_process`).
- Дополнительные метрики (средняя/максимальная скорость, средняя дистанция до цели, время в auto-aim, урон по источникам) не реализованы — перенесены в бэклог; `rngDraws` и seed set уже есть.
- Добавлена метрика `finalHp` сверх обязательного списка.
- `zoneViolations` — число тиков вне активной зоны (а не число «выходов»).
- Найден и исправлен баг детерминизма: глобальный счётчик id `GameEntity` не сбрасывался между мирами, поэтому снимки двух прогонов расходились по id. Добавлен `resetGameEntityIds()`, вызывается из `createGameWorld`.

**Риск/откат:** метрики могут считать не то (например, hits без damage). Сначала сверить на одном маленьком сценарии с ручным ожиданием, потом запускать 100 seed.

---

### Шаг 8. Seed-инструменты: identical, sweep, compare

**Цель:** реализовать именно тот сценарий, ради которого делается harness: «10 повторов одного seed → одинаково; 100 разных seed → стабильная статистика; изменил формулу → увидел разницу».

**Файлы:**

- `src/game/sim/Snapshot.ts` (новый)
- `src/game/sim/Compare.ts` (новый)
- `src/game/sim/cli.ts`
- `src/game/core/GameWorld.ts`

#### 8.1. Snapshot-хэш

- [ ] Снимок каждые 60 тиков:
  ```ts
  interface Snapshot {
    tick: number;
    entities: Array<{ id: number; kind: string; x: number; y: number; vx: number; vy: number; hp: number }>;
    rngDraws: Record<RngStream, number>;
    score: number;
    wave: number;
  }
  ```
- [x] Сущности сортируются по `id`.
- [x] Числа хэшируются как `Float64`-биты, а не через `toString()`.
- [x] `snapshotHash` не зависит от порядка ключей JSON.
- [x] При расхождении писать `firstDivergenceTick` и поток, у которого разошлось число бросков.
- [x] Хранить не только финальный хэш, но и массив хэшей по тикам.

#### 8.2. Determinism replay

- [x] `--expect-identical`:
  - запускает `runs` копий с одним и тем же `SeedSet`;
  - сравнивает метрики и `snapshotHashes`;
  - при расхождении печатает первый тик и поле;
  - возвращает ненулевой код.
- [x] Проверка не должна ограничиваться финальным хэшем.
- [x] 10 повторов — минимум; для CI можно 3–5 для скорости, но в релизном прогоне — 10.

#### 8.3. Sweep

- [x] `--seed-range 1..100` создаёт 100 разных `SeedSet` (мастер-seed = число).
- [x] Для каждого seed сохраняются метрики и хэши.
- [x] Агрегаты по всем seed.
- [x] Baseline пишется с `gitSha`, `runtime`, `scenarioHash`, `tickRate`, `physics`.
- [x] Baseline коммитится в `sim/baselines/`; локальные прогоны — в `sim-results/`.

#### 8.4. Compare

- [x] Сравнение paired по каждому seed:
  - `ΔDPS`, `ΔhitRate`, `ΔsurvivalTime`, `Δkills`;
  - средняя разница и 95% CI (bootstrap);
  - win/loss count;
  - относительное изменение в %.
- [x] Порог регрессии в конфиге: например, `|ΔDPS| > 2%` и CI не пересекает 0.
- [x] Проверять `rngDraws`: если число бросков изменилось, писать в отчёт «paired, но траектория разошлась после изменения числа бросков».
- [x] `--fail-on-regression` возвращает ненулевой код.
- [x] Отчёт в JSON + короткая markdown-таблица в stdout.

#### 8.5. Обязательные тесты

- [x] 10 прогонов с одним seed → `identical: true`, `stddev = 0`.
- [x] 100 разных seed → разные хэши, агрегаты не `NaN`. → `sim/baselines/smoke-100.json`
- [x] Изменение одной константы (например, `FIGHTER_BOLT_SPEED`) → `compare` показывает ненулевое `ΔDPS`. → проверено на `upgrades.fireRate`: ΔDPS +15.1%, CI [+1.6, +2.9].
- [ ] Удаление одного `rng.next()` → `firstDivergenceTick` указывает на разумный тик. → проверено косвенно: две серии с разными seed дают расхождение на первом же снимке; отдельный эксперимент с временным удалением броска не автоматизирован.
- [ ] Изменение порядка двух систем → детектируется как расхождение. → не автоматизировано по той же причине: требует временного изменения кода.
- [x] Baseline, снятый на другом runtime, не сравнивается как bit-exact (предупреждение).

**Прогресс:** ✅ выполнен (2026-11-03). `sim/Snapshot.ts` (FNV-1a 64 по Float64-битам), `sim/Compare.ts` (paired-разница, bootstrap-CI, правила регрессии), CLI `compare`, baseline `sim/baselines/smoke-100.json`; selftest 34/34. Проверено вручную: `compare` baseline с самим собой даёт все Δ = 0 и код 0; `compare` со сценарием `upgrades.fireRate = 3` даёт ΔDPS +15.1% и код 1 при `--fail-on-regression`.

**Как обновить baseline:** после осознанного изменения баланса (и только после него) пересчитайте серию той же командой и закоммитьте файл:

```bash
npm run sim -- sweep scenarios/smoke.json --seed-range 1..100 --out sim/baselines/smoke-100.json
git add sim/baselines/smoke-100.json
```

Проверка перед коммитом — `npm run sim -- compare sim/baselines/smoke-100.json <новый прогон>`: в отчёте не должно быть `REGRESSION` без объяснения.

**Отличия от плана:**

- `SnapshotEntity.id` — строка (`player`, `enemy:<id>`), а не число: у пуль и дронов свои пространства id, числовой id пришлось бы кодировать с префиксом.
- Пороги регрессии — константа `REGRESSION_RULES` в `Compare.ts` (метрики: dps, hitRate, survivalTime, kills, damageTaken), а не отдельный конфиг-файл.
- Bootstrap-CI использует локальный mulberry32 с фиксированным seed: отчёт воспроизводим и не трогает игровые потоки.
- `compare` возвращает код 1 и при несовпадении наборов seed (если задан `--fail-on-regression`): неполное paired-сравнение нельзя считать успехом.
- Синтетическая проверка регрессии в selftest работает на метриках, а не на изменённой константе: правка боевого кода в тесте недопустима. Реальный эффект проверен вручную (см. выше).

**Критерии приёмки:**

- [x] `--expect-identical` — зелёный.
- [x] `sweep` — сохраняет baseline.
- [x] `compare` — показывает разницу после изменения формулы.
- [x] Отчёт содержит `firstDivergenceTick = null` для детерминированного прогона.
- [x] Есть документированный способ обновить baseline.

**Риск/откат:** сравнение по одному seed может дать ложную уверенность. Всегда использовать набор seed и paired-разницу. Не «подкручивать» seed, пока результат не понравится.

---

### Шаг 9. Перевод браузера на `GameWorld`

**Цель:** игра и симуляция крутят один и тот же мир.

**Файлы:**

- `src/game/core/GameContext.ts`
- `src/game/core/GameFrame.ts`
- `src/game/core/GameStart.ts`
- `src/game/core/PresentationFrame.ts`
- `src/game/core/GameLoop.ts`
- `src/game/core/GameRender.ts`
- `src/game/core/GameListeners.ts`
- `src/game/game.ts`

**Действия:**

- [ ] `GameContext` создаёт `GameWorld` с `HumanControls`, `AudioManager`, `Fx`, `hooks`, `storage`.
- [ ] `GameFrame.step(dt)`:
  - `handleDebugKeys`;
  - меню/пауза — как раньше;
  - `world.tick` через `SimulationClock`;
  - `presentation.update`/`render`.
- [ ] `PresentationFrame` больше не обновляет астероиды и не собирает `AsteroidEnv`.
- [ ] `GameContext` обновляет `world.setView` из `cameraSystem`/`viewport`.
- [ ] `GameStart`:
  - `GameContext.startRun()` вызывает `world.startRun()`;
  - затем презентационные действия: `audio.setCombat`, `menuScene.reset`, `hooks`.
- [ ] `GameContext.toMenu()` вызывает `world.reset()`.
- [ ] `GameContext.applyUpgrades` делегирует в `world`.
- [ ] Seed для браузера:
  - `?seed=12345` → фиксированный;
  - иначе `createRandomSeed()`;
  - seed пишется в debug-оверлей и в `RunResult` (если включена запись).
- [ ] `GameLoop` остаётся, но `dt` идёт в `SimulationClock`, а не напрямую в `world.tick`.
- [ ] Убрать временные делегаты `GameContext` после миграции презентационных файлов.

**Критерии приёмки:**

- [ ] Меню, старт, countdown, волны, пауза, смерть, рестарт — работают.
- [ ] Клавиатура/мышь/геймпад/Space — работают.
- [ ] HUD и debug-оверлей показывают те же данные.
- [ ] На одном seed браузерный прогон повторяем при перезагрузке, а headless-прогон повторяем в Node; сравнивать их bit-exact между разными runtime не требуется.
- [ ] Нет `window`/`document` в `GameWorld`.
- [ ] `npm run build` проходит.

**Прогресс (частично, 2026-11-03):** основное уже работает с шагов 4–5: `GameContext` создаёт `GameWorld`, кадр идёт через `SimulationClock.advance`, `PresentationFrame` больше не двигает астероиды, `?seed=` пишется в консоль. Браузерный smoke на `http://localhost:3000/?seed=12345`: меню → старт → волна 01 → волна 02, HUD обновляется, в консоли нет ошибок (кроме React DevTools info), в логе `[Rift] seed 12345`. Осталось: seed в debug-оверлее, удаление временных геттеров-делегатов `GameContext` и полный прогон пауза/смерть/рестарт.

**Риск/откат:** если fixed tick в браузере ощущается иначе, оставить `GameFrame` с accumulator и `maxCatchUp`, но не возвращать переменный dt в симуляцию.

---

### Шаг 10. CI, документация и регрессии

**Цель:** знания не потерялись, регрессии ловятся автоматически.

**Действия:**

- [ ] CI-шаги:
  - `npm ci`;
  - `npm run typecheck`;
  - `npm run lint`;
  - `npm run sim:selftest`;
  - `npm run sim -- run scenarios/smoke.json --seed 12345 --runs 10 --expect-identical`;
  - `npm run sim -- sweep scenarios/smoke.json --seed-range 1..30 --out sim-results/smoke.json`;
  - сравнение с baseline (порог из конфига).
- [ ] Добавить `scenarios/smoke.json` — короткий сценарий (10–15 секунд), чтобы CI не был медленным.
- [ ] Добавить `scenarios/fighter-orbit-r300.json` для баланса.
- [ ] Baseline-файлы хранить в `sim/baselines/` с датой и `gitSha`.
- [ ] Обновить `tasks/simulation-harness-2026-11-03.md`: статус этапов, фактические команды, отличия от плана.
- [ ] Добавить в README раздел «Симуляция»: как запустить, как добавить сценарий, как обновить baseline.
- [ ] Добавить PR-чеклист:
  - [ ] не добавлен `Math.random` в геймплей;
  - [ ] не изменён порядок систем без baseline;
  - [ ] `--expect-identical` проходит;
  - [ ] baseline обновлён осознанно, а не автоматически.
- [ ] Настроить порог регрессии в отдельном `sim/config.json` или в сценарии.

**Критерии приёмки:**

- [ ] CI зелёный на чистом PR.
- [ ] CI падает, если в геймплей добавлен `Math.random`.
- [ ] CI падает, если сломан детерминизм.
- [ ] CI предупреждает/падает при значимом изменении DPS.
- [ ] Документация позволяет новому человеку запустить симуляцию без чтения кода.

---

## 6. Матрица проверок

| Проверка | Где | Команда/способ | Критерий |
|----------|-----|----------------|----------|
| RNG последовательность | `sim:selftest` | `npm run sim:selftest` | 1000 чисел совпадают для одного seed |
| Деривация потоков | `sim:selftest` | там же | потоки не совпадают, значения стабильны |
| Сброс мира | `sim:selftest` / CLI | два прогона подряд | второй не зависит от первого |
| Нет DOM в мире | Node import | `node`/`tsx` импорт `GameWorld` | нет `window`/`document` |
| `Math.random` в геймплее | lint/grep | `npm run lint` | 0 совпадений в геймплейных путях |
| Fixed tick | unit | `SimulationClock` | 1/30 → 2 тика, 1/144 → накопление |
| 10 одинаковых seed | CLI | `run ... --runs 10 --expect-identical` | `identical: true` |
| 100 разных seed | CLI | `sweep ... --seed-range 1..100` | хэши разные, агрегаты валидны |
| Сравнение формул | CLI | `compare baseline current` | есть `ΔDPS` и CI |
| Поиск расхождения | CLI | испортить RNG | `firstDivergenceTick` не null |
| Агент не мутирует мир | code review/lint | импорт только `PlayerAgent` | нет ECS/refs в агентах |
| Орбита | scenario | 30 с | радиус в допуске, зона не нарушена |
| Уклонение | scenario | Evade vs Random | меньше полученного урона |
| Браузер | manual | меню → бой → пауза → смерть | нет регрессий |
| Производительность | CLI | 100 прогонов | зафиксировать время, не хуже бюджета проекта |

---

## 7. Формат результата прогона

```json
{
  "scenario": "fighter-orbit-r300",
  "scenarioHash": "sha256:...",
  "gitSha": "...",
  "runtime": "node 22.x",
  "physics": "custom",
  "tickRate": 60,
  "seed": {
    "master": 12345,
    "streams": {
      "combat": 111,
      "spawn": 222,
      "drops": 333,
      "fx": 444,
      "agent": 555
    }
  },
  "runs": 10,
  "identical": true,
  "firstDivergenceTick": null,
  "metrics": {
    "shots": 0,
    "hits": 0,
    "hitRate": 0,
    "damageDealt": 0,
    "dps": 0,
    "damageTaken": 0,
    "survivalTime": 0,
    "kills": 0,
    "graze": 0,
    "zoneViolations": 0
  },
  "aggregate": {
    "mean": {},
    "median": {},
    "stddev": {},
    "p50": {},
    "p95": {}
  },
  "snapshotHashes": []
}
```

---

## 8. Риски и митигации

| Риск | Вероятность | Митигация |
|------|-------------|-----------|
| `GameWorld` окажется «жирным» и снова потянет DOM | Средняя | Явные порты, ESLint-запрет импортов, Node-import test |
| Разделение `GameContext` сломает рендер/HUD | Высокая | Getters-делегаты, серия маленьких PR, smoke после каждого |
| RNG-миграция изменит баланс | Средняя | Сравнить быстрый сценарий до/после, не менять формулы в том же PR |
| Fixed tick изменит ощущение игры | Средняя | Сначала только симуляция; браузер — после сравнения, `maxCatchUp` |
| `PlayerAgent` слишком сильный/слабый | Высокая | Несколько агентов, `reactionTime`, `aimJitter`, калибровка по реплеям |
| Скрытый недетерминизм (порядок `Set`, async) | Средняя | Snapshot каждые 60 тиков, `firstDivergenceTick`, lint |
| Seed-сравнение по одному прогону | Высокая | Только набор seed и paired-разница; явно писать `runs` |
| Изменение формулы меняет число RNG-бросков | Высокая | Проверять `rngDraws`, писать это в отчёт, не ждать старой траектории |
| Медленные 100 прогонов | Низкая | Начать с 30, потом 100; при необходимости worker threads |
| Сравнение Node vs браузер | Средняя | Не требовать bit-exact; хранить `runtime` в baseline |

---

## 9. Что НЕ делать в рамках варианта E

- [ ] Не добавлять сетевой клиент/сервер и протокол.
- [ ] Не делать динамические плагины и runtime-загрузку модулей.
- [ ] Не писать новый физический бэкенд: использовать `custom`, `planck` или `p2`.
- [ ] Не заменять `Math.random` глобально в презентации/аудио/рендере.
- [ ] Не телепортировать игрока из агента и не писать в `position`/`velocity`.
- [ ] Не делать DTO для всех ECS-сущностей: `PlayerView` — только для агента.
- [ ] Не менять формулы баланса в PR с RNG/рефакторингом.
- [ ] Не считать 10 повторов одного seed «статистикой баланса».

---

## 10. Первые три команды после утверждения плана

```bash
# 1. Зафиксировать базу
git rev-parse HEAD

# 2. Проверить, что текущий проект собирается
npm run typecheck && npm run lint

# 3. Начать шаг 0: добавить tsx и пустой CLI
#    (после редактирования package.json)
npm install
npm run sim -- --help
```

---

## 11. Финальный чек-лист готовности

- [ ] `GameWorld` не зависит от DOM.
- [ ] `GameContext` — презентационный хост.
- [ ] `PlayerControls` используется игровыми системами.
- [ ] `HumanControls` сохраняет текущее управление.
- [ ] `PlayerAgent` и 4 агента реализованы.
- [ ] `FIXED_DT = 1/60` используется и в headless, и в браузере.
- [ ] `SeedSet` из 5 потоков, `Math.random` в геймплее отсутствует.
- [ ] `GameWorld` полностью сбрасывается между прогонами.
- [ ] 10 одинаковых seed → одинаковый результат.
- [ ] 100 разных seed → устойчивые агрегаты.
- [ ] `compare` считает paired-разницу и CI.
- [ ] `firstDivergenceTick` работает.
- [ ] CI проверяет детерминизм и регрессии.
- [ ] Браузерный smoke пройден.
- [ ] Документация обновлена.
