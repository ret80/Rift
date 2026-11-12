# Simulation Harness — проблемы и варианты решения

**Дата:** 2026-11-03  
**Ревизия:** 3 (аудит исходного предложения + player control + модульность + client/server + seed-based reproducibility)  
**Статус:** документ-предложение. Код игры не изменялся.

> Исходные идеи A–D сохранены в разделе 4 в блоках «Исходная формулировка»; ниже они дополнены поправками, а не заменены молча. Новые варианты E–G добавлены отдельно.
>
> Пошаговый план реализации варианта E с чекбоксами и критериями приёмки: `tasks/simulation-harness-variant-e-plan-2026-11-03.md`.

---

## 0. Краткое резюме

Исходное направление выбрано верно: симуляция должна переиспользовать игровые формулы, а не копировать их. Но исходный документ содержит несколько фактических ошибок и сильно недооценивает главную работу — отделение игрового мира от `GameContext` (композиционного корня с рендером, DOM-вводом, аудио, меню и `requestAnimationFrame`).

Главные выводы:

1. **Вариант A полезен, но его надо упростить.** Не нужно создавать `src/game/core/math.ts` и `src/game/core/ballistics.ts`: `src/game/math.ts` уже существует, а `AimSolver.ts` уже является чистым модулем. Достаточно импортировать их из скриптов и убрать захардкоженные константы.
2. **Вариант B в исходном виде неверен.** `EcsWorld` — это тонкий фасад ECS и доменов, а не весь игровой кадр. Полный кадр собирается в `GameContext`: `WeaponManager`, `PhysicsSystem`, `CollisionSystem`, `SpawnSystem`, `WaveFlowSystem`, `ZoneSystem`, `LoadoutSystem` и т.д. Для headless-симуляции нужен отдельный `GameWorld`, а не «headless-обёртка над EcsWorld».
3. **Не хватает трёх обязательных вещей, без которых harness будет давать красивые, но невоспроизводимые цифры:**
   - **управление игроком** (`PlayerAgent`) — игрок не имеет AI и сейчас управляется только человеком;
   - **детерминизм** — seeded RNG вместо разбросанного `Math.random`;
   - **фиксированный шаг** — сейчас `GameLoop` использует переменный `requestAnimationFrame` dt с клампом `0.05`.
4. **Модульность полезна, но только как статическая типизированная композиция** (`GameModule`: контент + системы + сценарии). Динамические плагины и runtime-загрузка модулей сейчас не нужны.
5. **Сеть и client/server не нужны.** Полезная часть идеи — запускать один и тот же DOM-free игровой мир в браузере и в Node. Это «headless host»/симулятор, а не сетевой сервер. Сетевой split добавит протокол, авторитет, задержки, сериализацию и деплой без пользы для офлайн-игры.
6. **Рекомендуемый порядок:**
   - этап 0 — быстрый импорт чистых модулей и исправление констант (0.5–2 дня);
   - этап 1 — `GameWorld` + `PlayerAgent` + fixed tick + seeded RNG + headless CLI (1–2 недели);
   - этап 2 — JSON-сценарии, метрики, прогоны, регрессионный хэш (3–5 дней);
   - этап 3 — модульная композиция, CI-регрессии, авто-баланс, при желании отдельный пакет.
7. **Сиды — не дополнительная опция, а контракт детерминизма.** Один и тот же seed при одном сценарии, одной версии кода и одном runtime должен давать **побайтово одинаковый** результат на каждом тике, а не «примерно похожий». Но 10 повторов одного seed измеряют только детерминизм, а не баланс: для оценки баланса нужны 10–100 **разных** seed. Подробная спецификация, baseline и сравнение формул — в §8.

---

## 1. Что уже есть

### 1.1 Существующие инструменты

| Файл | Назначение | Что считает | Главная проблема |
|------|-----------|-------------|------------------|
| `scripts/fighter-circle-sim.mjs` | Анализ окна выстрела файтера при круговом движении игрока | Есть ли попадание при разных скоростях болта | Копирует формулы, константы устарели |
| `scripts/fighter-engagement-sim.mjs` | Полный бой «игрок кружит — файтер атакует» | Выстрелов/с, попаданий/с, урон/с для разных конфигов | Упрощённая физика и AI, копии формул |
| `scripts/upgrade-cost-calc.mjs` | Экономика деталей и стоимости апгрейдов | Суммарная стоимость апгрейдов vs доход по волнам | Копирует экономические формулы |

### 1.2 Чистые игровые модули, которые уже можно переиспользовать

**Прицеливание и баллистика:**
- `src/game/aiming/AimSolver.ts` — `solveInterceptTime`, `predictArc`, `solveArcInterceptTime`, `solveLead`, `solveFireWindow`, `spreadForChance`, `aimAtTarget`, `trackTurnRate`. Модуль уже импортирует только `balance` и `math`, то есть пригоден для Node.
- `src/game/balance/aiming.ts` — `LEAD_MIN_TIME`, `LEAD_MAX_TIME`, `AIM_CHANCE_CEILING`, `AIM_MIN_SPREAD`, `AIM_MANEUVER_FACTOR`.

**Математика:**
- `src/game/math.ts` — `clamp`, `lerpAngle`, `ramp01`, `rand`, `mulberry32`, тип `RandomSource`. Отдельного `core/math.ts` нет и создавать его не нужно.
- `mulberry32` уже даёт детерминированный PRNG, его можно использовать как основу seeded RNG.

**AI и стрельба врагов:**
- `src/game/ai/strategies/FighterStrategy.ts` — состояния `PATROL/SEARCH/CUT/ATTACK/FIRE/EVADE/COOLDOWN`, `solveFireWindow`, `solveLead`, `solveInterceptTime`.
- `src/game/systems/EnemyShootingSystem.ts` — `aimAtTarget`, `spreadForChance`, спавн болтов, таймеры турелей.
- `src/game/ai/GameContext.ts` — контекст для AI: позиция/скорость/угловая скорость игрока, волна, зона.

**Физика игрока:**
- `src/game/systems/PlayerMovement.ts` — `updateMovement`: ускорение, экспоненциальное трение, cap скорости, интеграция позиции, доворот угла.
- `src/game/systems/PlayerState.ts` — `PLAYER_ACCELERATION = 1500`, `FRICTION_EXP = 2.4`.
- `src/game/balance/player.ts` — `PLAYER_MAX_SPEED = 600`, `PLAYER_ACCEL = 1500` (экспортируется, но нигде не используется), `PLAYER_RADIUS`, `PLAYER_HITBOX_RADIUS`, `PLAYER_BULLET_HIT_OFFSET`.

**Баланс:**
- `src/game/balance/enemies.ts` — `FIGHTER_BOLT_SPEED = 720`, `FIGHTER_FIRE_MIN_TIME = 0.2`, `FIGHTER_FIRE_MAX_TIME = 0.9`, `FIGHTER_FIRE_MIN_ANGULAR = 0.05`, константы всех классов врагов.
- `src/game/balance/waves.ts` — `waveTotalFor`, `kindWeights`, `pickKindFor` (уже принимает `RandomSource`).
- `src/game/balance/accuracy.ts` — `enemyHitChance`.

**Физика:**
- `src/game/physics/IPhysics.ts`, `PhysicsSystem.ts`, `CustomCurrentPhysics.ts`, `PlanckPhysics.ts`, `P2Physics.ts` — интерфейс и все три бэкенда не зависят от DOM. `planck` и `p2-es` — обычные JS-библиотеки, работают в Node.

**Хранилище:**
- `src/game/core/PersistencePort.ts` — порт уже есть; для симуляции можно передать in-memory реализацию вместо `localStorage`.

### 1.3 Что скрипты делают сейчас

**Переиспользуемые функции (ручные копии из игры):**
- `linearIntercept` — копия `solveInterceptTime` из `AimSolver.ts`;
- `arcPoint` — копия `predictArc`;
- `arcIntercept` — копия `solveArcInterceptTime`;
- `clamp`, `ramp01` — копии из `src/game/math.ts`;
- `waveTotalFor`, `kindWeights`, `PARTS_PER_ENEMY` — копии из `src/game/balance/`.

**Захардкоженные значения и их фактическое состояние:**

| В скрипте | В игре | Комментарий |
|-----------|--------|-------------|
| `HIT_R = 28` | `PLAYER_HITBOX_RADIUS = 16` + `PLAYER_BULLET_HIT_OFFSET = 12` | Сегодня совпадает, но выведено вручную. При изменении любого слагаемого скрипт соврёт. |
| `VP = 600` | `PLAYER_MAX_SPEED = 600` | Не `PLAYER_SPEED`; такого имени в коде нет. |
| `MIN_TIME = 0.12` | `FIGHTER_FIRE_MIN_TIME = 0.2` | Уже устарело. |
| `MAX_TIME = 1.1` | `FIGHTER_FIRE_MAX_TIME = 0.9` | Уже устарело. В `fighter-engagement-sim` в комментарии указано `1.25` — тоже неверно. |
| `MIN_ANGULAR = 0.05` | `FIGHTER_FIRE_MIN_ANGULAR = 0.05` | Совпадает. |

---

## 2. Аудит исходного документа

| Утверждение исходного документа | Фактически | Вердикт |
|----------------------------------|------------|---------|
| «Создаём `src/game/core/math.ts`» | Чистая математика уже лежит в `src/game/math.ts` | ❌ Лишний перенос. Импортировать существующий модуль. |
| «Вынести `AimSolver` в `ballistics.ts`, а `AimSolver` сделать re-export» | `AimSolver.ts` уже чистый и не зависит от ECS/DOM | ❌ Не нужно. Импортировать `AimSolver.ts` напрямую. |
| «`HIT_R = 28` — должен быть суммой констант» | Так и есть: `16 + 12 = 28` | ✅ Идея верна, но надо вычислять, а не хардкодить. |
| «`VP = 600` — это `PLAYER_SPEED`/`PLAYER_MAX_SPEED`» | `PLAYER_SPEED` не существует; есть `PLAYER_MAX_SPEED` | ⚠️ Имя неверное, значение верное. |
| «`PlayerState.ts` определяет `PLAYER_MAX_SPEED`» | `PLAYER_MAX_SPEED` — в `balance/player.ts`; `PlayerState.ts` — только `PLAYER_ACCELERATION` и `FRICTION_EXP` | ⚠️ Ссылка неточная. |
| «`EcsWorld` собирает физику, рендер (picogl), аудио, эффекты» | `EcsWorld` создаёт только ECS-движок, домены и ECS-системы. Физику, рендер, аудио, меню, ввод и полный schedule собирает `GameContext` | ❌ Важно для варианта B. |
| «`EcsWorld` + headless-обёртка = полное переиспользование» | Полный кадр включает системы, которые живут в `GameContext`, а не в `EcsWorld` | ❌ Недооценка объёма. |
| «Headless-физика — простое интегрирование скорости» | `IPhysics` уже имеет три DOM-free бэкенда | ❌ Ещё один бэкенд создаст новое расхождение. Использовать существующий. |
| «`FighterStrategy` принимает DTO или адаптер» | `EnemyRef` — это живая связка ECS-компонентов, она Node-совместима. Достаточно узких структурных интерфейсов | ⚠️ DTO-адаптеры не нужны и противоречат стилю проекта. |
| «`@trixt0r/ecs` — причина невозможности headless» | Библиотека не требует DOM. Блокеры — композиционный корень, `InputManager`, `AudioManager`, рендер, меню, `requestAnimationFrame` | ❌ Причина названа неверно. |
| «Node.js ESM vs TypeScript — использовать `tsx`/`vite-node`» | Ни `tsx`, ни `vite-node` сейчас не установлены. В `node_modules/.bin` есть `vite`, `esbuild`, `jiti`, `tsc` | ⚠️ Нужен явный выбор раннера и добавление зависимости. |
| «Audio — просто noop» | `EnemyShootingSystem` и домены принимают конкретный `AudioManager`; нужен узкий порт, иначе придётся тащить WebAudio | ⚠️ Нужен `AudioPort`, а не «noop где-то». |
| «Input — noop» | `InputManager` вешает слушатели на `window`/`document`; `InputSystem` — на canvas | ⚠️ Нужен отдельный control-порт, а не фиктивный DOM. |
| «Game Core Library — 2–3 недели» | Физическое выделение npm-пакета раньше времени добавит сборку/алиасы. Сначала достаточно границы зависимостей внутри `src/game` | ⚠️ Пакет — поздняя опция, не этап 1. |

Дополнительно: в среде, где готовился этот документ, `node` не был найден в `PATH`, поэтому запуск скриптов и тестов требует настроенного Node-окружения. Это не архитектурная проблема, но её надо учесть в плане.

---

## 3. Проблемы

### 3.1 Расхождение формул и констант

Скрипты **копируют вручную** функции из `AimSolver.ts`. При каждом изменении в игре (новый коэффициент, изменение константы, новый параметр рассеивания) скрипты нужно обновлять вручную. Если забыли — результат симуляции расходится с реальной игрой.

Это уже произошло:

- `fighter-circle-sim.mjs`: `MIN_TIME = 0.12`, `MAX_TIME = 1.1`;
- игра: `FIGHTER_FIRE_MIN_TIME = 0.2`, `FIGHTER_FIRE_MAX_TIME = 0.9`;
- `fighter-engagement-sim.mjs` в комментарии фиксирует `FIGHTER_FIRE_MAX_TIME 1.25`.

То есть проблема не гипотетическая: скрипты **уже** описывают другую игру.

Дополнительно есть дублирование внутри самого игрового кода:

- `PLAYER_ACCELERATION = 1500` в `PlayerState.ts` используется;
- `PLAYER_ACCEL = 1500` в `balance/player.ts` экспортируется, но не используется;
- `FRICTION_EXP` живёт в `PlayerState.ts`, хотя это балансная константа;
- `PLAYER_HIT_RADIUS = PLAYER_HITBOX_RADIUS + PLAYER_BULLET_HIT_OFFSET` заново вычисляется в `FighterStrategy.ts` и `EnemyShootingSystem.ts` — это ещё одна копия формулы, которую надо вынести в `balance/player.ts`.

Это надо привести к одному источнику до того, как на него начнут опираться симуляции.

### 3.2 Упрощённая физика и AI в скриптах

- Скрипты не учитывают **экспоненциальное трение** (`FRICTION_EXP`) и **экспоненциальное сглаживание скорости**; в `fighter-engagement-sim` позиция обновляется простым `x += vx * dt`.
- Скрипты не учитывают **переменную скорость игрока** (апгрейд `speedMult`); в скриптах `PLAYER_SPEED = 600` — константа.
- `FighterStrategy` имеет 7 состояний (`PATROL`, `SEARCH`, `CUT`, `ATTACK`, `FIRE`, `EVADE`, `COOLDOWN`), а в скриптах моделируются только 2–3 тактики (standoff, cut, orbit+flip).
- Нет **турелей крейсера** с `tCd1/tCd2`, джиттера таймера и двух дульных срезов.
- Нет **бонусов/апгрейдов** игрока (shield, fireRate, speed) — они влияют на фактический DPS.
- Нет **зоны**, астероидов, дронов-компаньонов, разломов и волнового спавна.

### 3.3 Нет управления симуляциями

- Параметры захардкожены в коде скриптов.
- Нет конфигурационных файлов (JSON/YAML) для описания сценариев.
- Нет возможности задать «запусти 50 прогонов с разными R и посмотри статистическое распределение».
- Нет агрегации результатов (среднее, медиана, стандартное отклонение, перцентили).

### 3.4 Нет headless-режима (уточнённо)

Исходная формулировка «игровой код привязан к `@trixt0r/ecs`, поэтому нельзя запустить без DOM» неверна. Точная картина:

- `@trixt0r/ecs`, `planck`, `p2-es` — Node-совместимы;
- `IPhysics` и все три бэкенда (`custom`, `planck`, `p2`) — DOM-free;
- `AimSolver`, `balance/*`, `math.ts`, `PlayerMovement` — DOM-free;
- `Fx` — DOM-free, но использует `Math.random`;
- **реальные блокеры:**
  - `GameContext` в конструкторе создаёт `PicoGLRenderer`/`NullRenderer`, `MenuScene`, `InputSystem`, `InputManager`, `GamepadManager`, `GameLoop`, `AudioManager`, вызывает `resize()` через `getViewport()`/`getDpr()`;
  - `InputManager` и `InputSystem` вешают DOM-слушатели;
  - `AudioManager`/`AudioEngine` инициализируют WebAudio;
  - презентационные слои (`GameRender`, `PresentationFrame`, `RendererSystem`, `MenuScene`) завязаны на canvas/WebGL;
  - игровой цикл приходит из `requestAnimationFrame`.

Вывод: **headless-режим возможен, но он требует отделить игровой мир от презентационного хоста**, а не «заглушить ECS».

### 3.5 Масштабируемость

Каждый новый анализ (например, «как изменится DPS файтера при апгрейде speed до максимума») требует **написания нового скрипта**. Нет единого механизма: «возьми эту сцену, запусти N раз, верни статистику».

### 3.6 Детерминизм (пропущено в исходном документе)

Без детерминизма статистика прогонов невоспроизводима, а регрессионные тесты бессмысленны. Сейчас `Math.random` используется в игровой логике:

| Файл | Что влияет на геймплей |
|------|------------------------|
| `systems/EnemySystem.ts` | сторона страйфа дронов, burst карателя, seed/cooldown спавна, угол орбиты |
| `systems/EnemyShootingSystem.ts` | смещение burst, дисперсия выстрела |
| `weapons/CannonWeapon.ts` | разброс турели |
| `aiming/AimSolver.ts` | `aimAtTarget` — случайный разброс |
| `ai/strategies/CarrierStrategy.ts` | таймеры страйфа/ожидания, угол спавна |
| `ai/DroneSwarm.ts` | количество отделяемых дронов, cooldown |
| `systems/PickupDropSystem.ts` | скорость/позиция выпадения пикапов |
| `asteroids.ts` | разлёт осколков, тип/дроп астероида |
| `rifts.ts` | seed/поворот разлома (визуал, но участвует в общем порядке) |

Плюс `Fx`, `LaserWeapon`, `audio/*` используют randomness, но это визуал/звук. Если они используют тот же поток, отключение эффектов изменит геймплейные броски. Нужны **независимые seeded-потоки** (например, `rngCombat`, `rngSpawn`, `rngDrops`, `rngFx`), а не один глобальный.

Важно: `math.rand(a, b)` сейчас жёстко вызывает `Math.random`, а `pickKindFor` уже принимает `RandomSource`. Нужно продолжить этот подход и протащить `Rng` через конструкторы систем.

Детерминизм — это не только «заменить `Math.random`». Нужны независимые потоки, сброс состояния между прогонами, стабильный порядок обхода сущностей и snapshot-хэши. Полная спецификация системы сидов, baseline и сравнения формул — в §8.

### 3.7 Фиксированный шаг (пропущено в исходном документе)

`src/game/core/GameLoop.ts`:

```ts
const rdt = clamp((now - this.lastT) / 1000, 0, 0.05);
```

Это переменный `dt`. Для симуляции нужен фиксированный шаг, иначе:

- физика и трение будут давать разные результаты при разной нагрузке;
- повторный прогон с тем же seed не совпадёт;
- результаты «100 прогонов» будут смесью разных условий.

При этом менять шаг «на глаз» нельзя: `PHYSICS_MAX_TRANSLATION_PER_STEP = 12` в `IPhysics.ts` рассчитан примерно на `1/60` (12 × 60 = 720 world-units/s). Для симуляции нужно использовать `1/60`, чтобы совпадать с продакшен-физикой, либо явно пересчитывать параметры физики под другой шаг.

### 3.8 Нет управления игроком (пропущено в исходном документе)

Игрок — не AI. Сейчас его поведение задаётся только человеком:

- `PlayerSystem.process()` читает `this.input.axis`;
- `AbilitySystem.process()` читает `this.input.consumePress(ABILITY_KEY)`;
- прицел и огонь приходят из `InputSystem` в `WeaponManager` (`setManualAim`, `setManualFiring`);
- большая часть стрельбы — автонаведение `Targeting`: если в радиусе есть враг, оружие стреляет само.

Следовательно, для симуляции нужно синтезировать **намерения игрока**, а не «поставить игрока в центр и ждать». При этом нельзя напрямую писать в `position`/`velocity`: это обойдёт `PlayerMovement`, трение, cap скорости, коллизии и даст нереалистичные цифры.

Нужен слой `PlayerAgent`, который возвращает:

- ось движения (`moveX`, `moveY`) в диапазоне `[-1, 1]`;
- ручной угол прицела (или `null`);
- намерение стрелять;
- намерение активировать способность.

Реализации:

- `HumanAgent` — текущий ввод (для игры и для записи реплеев);
- `OrbitAgent` — кружит вокруг точки/центра зоны с заданным радиусом и направлением;
- `KiteAgent` — держит дистанцию, уходит от сближения;
- `EvadeAgent` — уклоняется от ближайших снарядов/врагов;
- `RandomAgent` — seeded случайные оси (baseline);
- `ReplayAgent` — воспроизводит записанные интенты.

Для баланса в первую очередь нужны `OrbitAgent`, `KiteAgent`, `EvadeAgent`. Они должны выдавать **аналоговую** ось, а не только `-1/0/1`, иначе движение игрока будет отличаться от человеческого.

### 3.9 Композиционный корень и жизненный цикл (пропущено в исходном документе)

`GameContext` — не просто «контекст», а композиционный корень, который:

- создаёт рендер, ввод, аудио, меню, эффекты, камеру, HUD;
- создаёт все игровые системы;
- устанавливает `SystemSchedule`;
- создаёт FSM и цикл;
- вызывает `resize()` и `getViewport()`;
- подписывает debug/геймпадные слушатели.

Пока этот класс не разделён, любая «headless-обёртка» будет либо тащить DOM, либо повторять сборку систем вручную — то есть снова дублировать источник правды.

---

## 4. Варианты решения

### Вариант A: «Импорт из игры» — минимальные изменения

> **Исходная формулировка.** Вынести все чистые функции (aim solver, баллистика, константы баланса) в отдельную библиотеку `game-math` / `simulation-core`. Скрипты импортируют её через Node.js. Создать `src/game/core/math.ts` и `src/game/core/ballistics.ts`, `AimSolver.ts` сделать re-export'ом, `balance/*.ts` оставить как есть, скрипты перевести на импорт.

**Что делаем после аудита:**

1. **Не создаём** `src/game/core/math.ts` и `src/game/core/ballistics.ts`.
2. Импортируем существующие `src/game/math.ts`, `src/game/aiming/AimSolver.ts`, `src/game/balance/*` из скриптов.
3. Вычисляем hit radius из баланса (и выносим общий `PLAYER_HIT_RADIUS` в `balance/player.ts`, чтобы убрать его локальные копии в `FighterStrategy`/`EnemyShootingSystem`):
   ```ts
   const HIT_R = PLAYER_HITBOX_RADIUS + PLAYER_BULLET_HIT_OFFSET;
   ```
4. Заменяем `VP` на `PLAYER_MAX_SPEED`, `MIN_TIME`/`MAX_TIME` на `FIGHTER_FIRE_MIN_TIME`/`FIGHTER_FIRE_MAX_TIME`, `MIN_ANGULAR` на `FIGHTER_FIRE_MIN_ANGULAR`.
5. Для запуска TS из `.mjs` добавляем один явный раннер: `tsx` (рекомендуется) или `esbuild`-бандл. `vite-node` сейчас не установлен.
6. Убираем дубли констант игрока: `PLAYER_ACCEL` либо удаляем, либо делаем единственным источником, а `PLAYER_ACCELERATION` импортируем из `balance/player.ts`. `FRICTION_EXP` переносим в `balance/player.ts`.

**Плюсы:**
- минимальные изменения архитектуры;
- мгновенно устраняет расхождение формул и констант;
- быстро (0.5–2 дня);
- скрипты остаются однопоточными Node.js без DOM/WebGL.

**Минусы:**
- скрипты всё ещё переписывают AI и физику вручную — расхождения в поведении сохраняются;
- нет управления симуляциями;
- `PlayerMovement` и `FighterStrategy` остаются недоступными для скриптов;
- `aimAtTarget` всё ещё использует `Math.random`, поэтому даже импортированный код недетерминирован.

**Вердикт:** делать первым. Это дешёвая страховка от уже существующего дрейфа, но не решение задачи целиком.

---

### Вариант B: «Headless ECS» — симуляция через ECS-мир

> **Исходная формулировка.** Добавить headless-обёртку для ECS-мира и систем. Скрипт создаёт `EcsWorld`, расставляет врагов, запускает N тиков, читает состояние. Создать `src/game/core/headless.ts`, `PlayerMovement` перевести на DTO, `FighterStrategy` — на DTO/адаптер, headless-физику сделать простым интегрированием.

**Что неверно:**

- `EcsWorld` **не содержит** полный игровой кадр. В нём только ECS-движок, домены и часть систем (`PickupMovementSystem`, `PickupCollectionSystem`, `ParticleSystem`, `RingSystem`, `BeamSystem`, `BulletSystem`, системы `EnemyDomain`, `ZoneEnemyPullSystem`, `AsteroidBeltSystem`).
- Полный кадр собирается в `GameContext`: `PlayerSystem`, `AbilitySystem`, `WeaponManager`, `PhysicsSystem`, `CollisionSystem`, `SpawnSystem`, `WaveFlowSystem`, `ZoneSystem`, `LoadoutSystem`, `ScoringSystem`, `BonusManager`, `ShieldSystem`, `GrazeSystem`, `RiftField`, `AllyDroneSystem`.
- «Headless-физика простым интегрированием» создаст **ещё один** физический бэкенд и новое расхождение. Уже есть `CustomCurrentPhysics`, `PlanckPhysics` и `P2Physics`, все DOM-free.
- DTO-адаптеры для `FighterStrategy` не нужны: стратегия уже работает с `EnemyRef` и чистым `GameContext`; `EnemyRef` — это набор компонентов, а не DOM-объект. DTO-слой создал бы вторую копию формы компонентов и новый источник рассинхронизации. Если системе нужен меньший контракт — достаточно структурного интерфейса (`Pick`/`readonly`-поля), а не обёртки.

**Что делать вместо этого:**

1. Создать `GameWorld` — DOM-free сборку игрового мира (подробно в варианте E).
2. Использовать существующий `IPhysics`-бэкенд, а не новый.
3. Ввести узкие структурные интерфейсы там, где сейчас жёсткая зависимость:
   - `PlayerControls` — единый шов для оси движения, прицела, огня и способности;
   - `AudioPort` — для систем, которым нужен звук;
   - `FxPort` — для эффектов.
4. Оставить `EnemyRef` и `FighterStrategy` как есть, если они не тянут DOM. При необходимости добавить только недостающие поля в `EnemyRef`, а не слой DTO.

**Плюсы:**
- полное переиспользование игрового кода;
- один `AimSolver`, одна `FighterStrategy`, одна физика;
- можно запускать реальные сценарии: игрок кружит, файтер атакует, крейсер стреляет, работает зона и волны.

**Минусы:**
- значительный рефакторинг композиционного корня (1–2 недели);
- нужно разделить `GameContext` на мир и презентацию;
- нужно протащить управление игроком и RNG;
- `@trixt0r/ecs` остаётся зависимостью симуляции (это нормально, она Node-совместима).

**Вердикт:** направление верное, но исходная оценка сложности занижена. Это не «обёртка над `EcsWorld`», а выделение `GameWorld`.

---

### Вариант C: «Game Core Library» — выделение независимой библиотеки

> **Исходная формулировка.** Выделить математику, физику, баллистику и AI в отдельный пакет `rift-core`/`@rift/game-core`, который не зависит от ECS, рендера, аудио и DOM. Игра импортирует его, скрипты — тоже.

**Оценка:**

Идея правильная по направлению, но физическое выделение npm-пакета — преждевременный шаг. Сначала нужно навести порядок зависимостей внутри `src/game`:

- `math`, `balance`, `aiming` — уже почти независимы;
- `physics` — зависит только от `IPhysics` и бэкендов;
- `ai` — зависит от `EnemyRef` и `ai/GameContext`;
- `systems` — зависят от ECS, физики, событий, аудио;
- `render`, `presentation`, `audio`, `input` — презентационные.

Если сразу делать отдельный пакет, придётся решать:

- как собирать TS для Node и браузера;
- как избежать дублирования типов;
- как версионировать пакет;
- как не сломать Vite-алиасы.

Это не даёт выигрыша на этапе 1. Полезная часть — **граница зависимостей**: `game-core` не должен импортировать `render`, `presentation`, `audio`, `input`, `core/env`.

**Что делать позже:**

1. После `GameWorld` проверить граф импортов.
2. Вынести `math`/`balance`/`aiming`/`physics`/`ai` в `src/game-core/` **внутри репозитория**, без отдельного пакета.
3. Если появится внешний потребитель — оформить пакет.

**Плюсы:**
- чёткое разделение ответственности;
- полное переиспользование;
- возможность CI-прогонов и внешнего пакета.

**Минусы:**
- самый масштабный рефакторинг;
- риск преждевременной абстракции;
- отдельная сборка и версионирование;
- риск рассинхронизации при неаккуратном переносе.

**Вердикт:** не этап 1. Сначала `GameWorld` и стабильные границы, потом при необходимости пакет.

---

### Вариант D: «Simulation Harness» — модульный раннер поверх игры

> **Исходная формулировка.** Создать `src/game/simulation/` с `SimulationRunner`, `Scenario`, `Metrics`, headless-обёрткой `EcsWorld`, JSON-конфигами и CLI `scripts/sim.ts`. Утверждается, что это менее радикальный рефакторинг, чем B и C.

**Оценка:**

Продукт описан правильно: JSON-сценарий + N прогонов + агрегированная статистика — это то, что нужно. Но утверждение «менее радикальный рефакторинг» неверно, если раннер должен использовать **реальную** игру, а не копию. Ему нужны те же предпосылки, что и B:

- DOM-free `GameWorld`;
- управление игроком;
- фиксированный шаг;
- seeded RNG;
- порты для аудио/эффектов/хуков.

Если этого нет, `SimulationRunner` превратится в ещё один набор ручных копий — только с JSON-конфигом.

**Что оставить из идеи:**

- `src/game/simulation/SimulationRunner.ts` — принимает сценарий, создаёт `GameWorld`, крутит тики, собирает метрики;
- `Scenario.ts` — описание сценария;
- `Metrics.ts` — сбор и агрегация;
- `scripts/sim.ts` — CLI;
- JSON-конфиги;
- статистика по умолчанию: mean/median/stddev/percentiles.

**Что добавить:**

- `PlayerAgent` в сценарии;
- `seed` и `tickRate`;
- `modules` (какие подсистемы включены);
- `physics` backend;
- `upgrades`/`loadout`;
- `metrics` list;
- `snapshotHash` для регрессий.

**Вердикт:** делать после E. Это слой продукта, а не замена архитектуре.

---

### Вариант E (новый, основной): `GameWorld` + `PlayerAgent` + deterministic fixed tick

**Суть:** выделить из `GameContext` DOM-free игровой мир, который можно крутить из браузера и из Node одним и тем же кодом. Игрок управляется сменным агентом. Время фиксированное. Случайность — seeded.

#### E.1 Разделение `GameContext`

Предлагаемая структура:

```
src/game/core/
  GameWorld.ts        // DOM-free: ECS, системы, физика, FSM, игровые порты
  WorldPorts.ts       // AudioPort, FxPort, GameplayHooks, PlayerControls, Rng
  GameContext.ts      // презентационный хост: canvas, renderer, input, audio, menu, loop
```

`GameWorld` владеет:

- `EventBus`;
- `EcsWorld`;
- `SystemSchedule`;
- `PhysicsSystem`;
- `PlayerSystem`, `AbilitySystem`, `WeaponManager`, `CollisionSystem`, `SpawnSystem`, `WaveFlowSystem`, `ZoneSystem`, `ScoringSystem`, `BonusManager`, `ShieldSystem`, `GrazeSystem`, `RiftField`, `AllyDroneSystem`, `LoadoutSystem`, `PickupDropSystem`;
- `AsteroidField` (игровая часть пояса: спавн, урон, дроп), а не его отрисовка;
- `GameStateMachine` (или его игровую часть);
- `PlayerControls`;
- `Rng`-потоками;
- игровыми портами (`AudioPort`, `FxPort`, `GameplayHooks`, `PersistencePort`).

`GameContext` добавляет:

- `PicoGLRenderer`/`NullRenderer`;
- `InputSystem`/`InputManager`/`GamepadManager`;
- `AudioManager`;
- `MenuScene`, `GameRender`, `PresentationFrame`, `RendererSystem`, `Starfield`, визуальную часть `AsteroidField`;
- `GameLoop`, `resize`, `getViewport`/`getDpr`, hooks для React;
- `GameListeners` (UI-реакции на игровые события) и переходы меню.

`GameStart` придётся разделить: сброс забега/применение апгрейдов/создание `DeathSystem` — это мир; переход в меню и сброс `MenuScene` — это презентация. `GameUpgrades` — это прогрессия и применение апгрейдов, то есть ближе к миру, но хранилище и UI-хуки приходят через порты.

Предпочтительна композиция (`GameContext.world`), а не наследование: конструктор мира не должен зависеть от canvas и порядка инициализации рендера. Чтобы не переписывать весь презентационный код сразу, `GameContext` может временно делегировать `ecs`, `playerSystem`, `weaponManager` и т.д. в `world` через геттеры — это сохранение существующего API, а не слой адаптеров.

Важно: `GameWorld` не должен импортировать `render/`, `presentation/`, `audio/`, `input.ts`, `core/env.ts`. Это можно проверить ESLint-правилом `no-restricted-imports`.

`AsteroidField` и `RiftField` — пограничные: они спавнят игровые сущности, но также рисуются. Их игровую часть (спавн, урон, дроп) нужно держать в мире, а визуальную — в презентации. Как минимум, `GameWorld` должен получать их через порт или иметь «headless»-режим без отрисовки. Нельзя оставлять в мире прямые зависимости от `IRenderer`.

Отдельная проблема — `AsteroidField`: сейчас он обновляется не в `engine.run`, а в `PresentationFrame.update(dt, asteroidEnv())`, причём `AsteroidEnv` содержит `camX`, `camY`, `viewW`, `viewH`. То есть игровая логика пояса астероидов завязана на камеру и вьюпорт. Для headless-симуляции нужно либо передавать виртуальную камеру/вьюпорт (например, центр арены и её диаметр), либо перенести обновление пояса в `GameWorld` и сделать его зависимость от зоны, а не от экрана. Иначе сценарии с астероидами будут зависеть от размера окна. Это надо решить до того, как обещать «полную» симуляцию астероидного пояса.

`DeathSystem` тоже создаётся в `GameStart.startRun()` и использует `ctx.audio`, `ctx.fx`, `ctx.hooks`, `ctx.scoringSystem`. Для симуляции нужен либо noop-аудио/эффекты, либо отдельный «мгновенный» режим смерти без анимации, но с публикацией `game_over` и остановкой тика.

#### E.2 `PlayerControls` и `PlayerAgent`

Один стабильный шов вместо адаптеров под каждую систему:

```ts
export interface Vec2 {
  x: number;
  y: number;
}

export interface PlayerControls {
  /** Ось движения в [-1, 1]. */
  axis: Vec2;
  /** Ручной угол прицела; null — нет ручного прицела. */
  aimAngle: number | null;
  /** Игрок держит огонь (когда нет автоцели). */
  firing: boolean;
  /** Одноразовое нажатие способности. */
  consumeAbility(): boolean;
}
```

Потребители:

- `PlayerSystem` читает `controls.axis` вместо `InputManager.axis`;
- `AbilitySystem` читает `controls.consumeAbility()` вместо `InputManager.consumePress`;
- `GameWorld` каждый тик применяет `controls.aimAngle`/`controls.firing` к `WeaponManager` (или `WeaponManager` читает их напрямую);
- `HumanControls` реализует порт поверх `InputManager`/`InputSystem` — поведение игры не меняется;
- `AgentControls` реализует порт поверх `PlayerAgent`.

`PlayerAgent`:

```ts
export interface PlayerView {
  player: PlayerRef;
  enemies: readonly EnemyRef[];
  enemyBullets: readonly EnemyBulletRef[];
  zone: { x: number; y: number; radius: number; active: boolean };
  time: number;
}

export interface PlayerIntent {
  move: Vec2;
  aim: number | null;
  fire: boolean;
  ability: boolean;
}

export interface PlayerAgent {
  reset?(seed: number): void;
  update(view: PlayerView, dt: number): PlayerIntent;
}
```

`AgentControls` применяет `PlayerIntent` к `PlayerControls` и защёлкивает `ability` на один тик.

Ключевое ограничение: **агент не пишет в `position`/`velocity`**. Он выдаёт только намерение, как человек. Иначе симуляция перестаёт проверять движение, трение, cap скорости и коллизии.

Реализации:

- `HumanAgent` — мост к `InputManager` (для игры и записи реплеев);
- `OrbitAgent({ radius, direction, speed })` — PD-регулятор: желаемая скорость по касательной + радиальная коррекция, ось = нормированная разница между желаемой и текущей скоростью;
- `KiteAgent({ distance })` — держит дистанцию до ближайшего врага, уходит от сближения;
- `EvadeAgent` — уклоняется от ближайших снарядов, учитывает радиус хитбокса и зону;
- `RandomAgent({ seed })` — baseline;
- `ReplayAgent` — воспроизводит записанные интенты.

Нюанс: при наличии врага в радиусе `Targeting` стреляет автоматически, поэтому `fire` и `aim` важны в основном когда автоцели нет. Для баланса главное — движение и способности.

#### E.3 Фиксированный шаг

`SimulationClock`:

```ts
const FIXED_DT = 1 / 60;

export class SimulationClock {
  private acc = 0;
  constructor(private readonly maxCatchUp = 5) {}

  advance(realDt: number, tick: (dt: number) => void): number {
    this.acc += Math.min(realDt, 0.25);
    let steps = 0;
    while (this.acc >= FIXED_DT && steps < this.maxCatchUp) {
      tick(FIXED_DT);
      this.acc -= FIXED_DT;
      steps++;
    }
    return steps;
  }
}
```

Для чистой симуляции можно вообще не использовать `realDt`: `runner.runTicks(n)` вызывает `world.tick(FIXED_DT)` ровно `n` раз. `SimulationClock` нужен только если мир крутится в реальном времени (например, для отладки).

Почему `1/60`:

- `GameLoop` в браузере обычно близок к 60 FPS;
- `PHYSICS_MAX_TRANSLATION_PER_STEP = 12` рассчитан на шаг ~1/60;
- меньше риска разойтись с продакшен-поведением.

Если понадобится `1/120`, нужно пересчитать физические лимиты и проверить, что `updateMovement`/`PhysicsSystem` ведут себя эквивалентно.

#### E.4 Seeded RNG

Не заменять `Math.random` глобально. Ввести `Rng` и протащить его явно:

```ts
export interface Rng {
  next(): number;          // [0, 1)
  range(a: number, b: number): number;
  int(maxExclusive: number): number;
}

export function createRng(seed: number): Rng {
  const next = mulberry32(seed);
  return {
    next,
    range: (a, b) => a + next() * (b - a),
    int: (max) => Math.floor(next() * max),
  };
}
```

Потоки:

- `rngCombat` — разброс оружия, burst, AI-таймеры;
- `rngSpawn` — состав волн, позиции спавна, seed врагов;
- `rngDrops` — дроп пикапов, осколки астероидов;
- `rngFx` — частицы, тряска, визуальные seed'ы;
- `rngAgent` — решения `RandomAgent`; отдельный поток, чтобы поведение агента не сдвигало боевые броски.

Почему отдельные потоки: отключение эффектов или смена количества частиц не должно менять броски попадания/дропа. Это также упрощает запись/воспроизведение.

Что менять:

- `math.rand(a, b, rng)` или `rng.range`;
- `AimSolver.aimAtTarget(params, chance, radius, rng)` — добавить параметр;
- `EnemySystem`, `EnemyShootingSystem`, `CannonWeapon`, `CarrierStrategy`, `DroneSwarm`, `PickupDropSystem`, `AsteroidField`, `RiftField`;
- `pickKindFor` уже принимает `RandomSource` — использовать его.

`LaserWeapon`/`RiftField` визуальные seed'ы можно оставить на `rngFx`, если они не влияют на геймплей.

Детали деривации потоков, сброса состояния, snapshot-хэшей и сравнения прогонов — в §8.

#### E.5 Headless-порты

- `AudioPort` — узкий интерфейс с методами, которые реально вызывают игровые системы (`playEnemyShoot`, `playHeavyShoot`, `playShoot`, `playPickupSound`, `playExplosion`, `playPlayerHit`, `playDroneShot`, `playDroneHit`, `playRiftOpen`, `playRiftClose`, `playRiftSpawn`, `playComboUp`). `AudioManager` реализует его структурно; `NullAudio` — пустые методы.
- `FxPort` — `burst`, `ring`, `addShake`, `reset`. `Fx` реализует; `NullFx` — пустые методы или реальный `Fx` с `rngFx` (если нужны частицы для отладки).
- `GameplayHooks` — `onBanner`, `onToast`, `onCountdown`, `onGameOver`, `onStats`. В симуляции — noop или запись в лог.
- `PersistencePort` — in-memory реализация.
- `PlayerControls` — human/agent.

#### E.6 Запуск мира без меню

Для симуляции:

1. создать `GameWorld` с `startWave`, `seed`, `physics`;
2. `world.startRun()` (очистить пулы, применить апгрейды);
3. пропустить countdown: `world.fsm.fire("countdown_done")` или флаг `skipCountdown`;
4. крутить `world.tick(FIXED_DT)` до `duration` или `game_over`;
5. собрать метрики.

Порядок внутри тика важен: сначала агент обновляет `PlayerControls` по текущему `PlayerView`, затем `WorldContext` применяет `aimAngle`/`firing` к `WeaponManager`, затем `engine.run(FIXED_DT)` (там `PlayerSystem`, `AbilitySystem`, `WeaponManager.update` и остальные системы), затем метрики. Если применить управление после `engine.run`, оно попадёт в следующий тик и сдвинет задержки.

`GameStart.startRun()` сейчас завязан на `ctx.audio`, `ctx.hooks`, `ctx.storage`, `ctx.fx`, `ctx.physics`, `ctx.asteroidField.hardReset()` и создание `DeathSystem`. При разделении он должен работать через порты, а презентационные вызовы (`menuScene.reset`, `audio.setCombat`) уйти в `GameContext`.

Каждый прогон должен создавать новый `GameWorld` (или выполнять полный reset всех доменов и менеджеров). Переиспользование мира между seed'ами без reset протащит состояние предыдущего прогона в следующий и сломает статистику.

#### E.7 Плюсы и минусы

**Плюсы:**
- один источник правды для формул, физики, AI и оружия;
- воспроизводимые прогоны;
- можно симулировать игрока, а не только врагов;
- работает и в браузере, и в Node;
- становится основой для модулей, CI и авто-баланса.

**Минусы:**
- требует аккуратного разделения `GameContext`;
- нужно протащить RNG и control-порт через несколько систем;
- нужно проверить, что `GameWorld` не тянет DOM;
- стартовая сложность выше, чем у A, но ниже, чем у преждевременного C.

**Вердикт:** основной рекомендуемый вариант.

---

### Вариант F (новый): модульная игровая композиция

**Суть:** новые игровые возможности оформляются как модули, которые добавляют контент, системы и (опционально) сценарии симуляции.

Это отвечает на вопрос «можно ли сделать модульную систему, где новые модули добавляют геймплей». Да, но с оговорками.

#### F.1 Что уже модульно

- `WeaponRegistry` / `WeaponCatalog` — оружие;
- `AbilityRegistry` — способности;
- `BonusRegistry` / `BonusManager` — бонусы;
- `PickupCatalog` — пикапы;
- `IEnemyStrategy` + стратегии — поведение врагов;
- `IPhysics` — физические бэкенды;
- `SystemSchedule` + `Phase` — порядок систем;
- домены (`EnemyDomain`, `BulletDomain`, ...) — владение сущностями.

То есть фундамент уже есть. Не нужно изобретать «плагинную шину».

#### F.2 Предлагаемый контракт

```ts
export interface GameModule {
  id: string;
  /** Системы модуля; порядок внутри фазы сохраняется. */
  systems?: readonly PhasedSystem[];
  /** Регистрация контента: оружие, способности, бонусы, пикапы. */
  register?(registry: GameRegistries): void;
  /** Сценарии симуляции, которые имеет смысл запускать с модулем. */
  scenarios?: readonly ScenarioDef[];
}
```

`GameRegistries` — это агрегат уже существующих реестров (`WeaponRegistry`, `AbilityRegistry`, `BonusRegistry`, `PickupCatalog`), а не новый глобальный service locator.

`GameWorld` принимает список модулей:

```ts
const world = createGameWorld({
  modules: [coreModule, playerModule, weaponsModule, enemiesModule],
  seed: 123,
});
```

Что даёт:

- симуляция может включать только нужные подсистемы (например, без астероидов и разломов);
- новая механика = новый модуль, а не правка `GameContext`;
- сценарии могут требовать модуль и падать с понятной ошибкой, если его нет;
- проще тестировать изолированно.

#### F.3 Чего делать не надо

- динамическая загрузка кода/плагины из сети — не нужно для офлайн-игры;
- service locator / глобальный реестр всего — скрывает зависимости;
- модули, которые сами решают порядок систем в обход `SystemSchedule`;
- «модульность ради модульности» до того, как `GameWorld` выделен.

#### F.4 Как добавить новую механику

1. Создать системы модуля с явными `Phase`.
2. Зарегистрировать контент через существующие реестры.
3. Добавить модуль в манифест `createGameWorld({ modules })`.
4. Добавить сценарий симуляции, если механику надо проверять балансно.
5. Не менять `GameContext` и не добавлять импорты из `render/`/`audio/` в модуль.

#### F.5 Оценка

- **Польза:** высокая для симуляции и дальнейшего развития, но не обязательна для первого harness.
- **Стоимость:** средняя, 3–5 дней после `GameWorld`.
- **Риск:** преждевременная абстракция, циклические зависимости, неявный порядок систем.
- **Вердикт:** делать после E, постепенно. Начать с 4–6 модулей (`core`, `player`, `weapons`, `enemies`, `asteroids`, `rifts`), не переписывать всё сразу.

---

### Вариант G (новый): client/server и симулятор вместо клиента

**Суть исходной идеи:** разделить игру на клиент и сервер, а обычный клиент заменить симулятором, который крутит игру и собирает данные.

Нужно различать два разных смысла.

#### G.1 Логический split: мир vs презентация

Это то, что действительно нужно:

- `GameWorld` — симуляция;
- браузерный клиент — рендер, ввод, звук, меню;
- Node-симулятор — тот же `GameWorld` + JSON-сценарий + метрики.

Это не сеть. Это два **хоста** одного ядра. Именно такой split рекомендуется.

#### G.2 Сетевой split: сервер + клиент по сети

Полноценный client/server означает:

- авторитетный сервер с фиксированным тиком;
- клиент отправляет input-пакеты;
- сервер рассылает снапшоты;
- prediction/rollback или интерполяция;
- версионирование протокола;
- сериализация всех сущностей;
- обработка лагов, reconnection, читерства;
- хостинг и деплой.

Для офлайн-игры с одним игроком это добавляет много сложности и не даёт пользы. Симулятору сеть не нужна: он может запускать мир в том же процессе.

Когда сетевой split станет оправдан:

- появится multiplayer/PvP;
- понадобится серверная валидация результатов/античит;
- появятся удалённые балансные сервисы или общие забеги.

До этого делать протокол не нужно.

#### G.3 «Симулятор вместо клиента»

Правильная интерпретация: симулятор — **альтернативный хост**, а не замена игры. Браузерный клиент остаётся, потому что в него играют люди. Симулятор нужен для:

- балансных прогонов;
- регрессионных тестов;
- воспроизведения багов;
- авто-подбора параметров.

#### G.4 Оценка

- **Логический split:** обязателен, входит в E.
- **Сетевой split:** не рекомендуется сейчас; 4–8+ недель и постоянная поддержка.
- **Вердикт:** делать E; сеть оставить на будущее, но не проектировать под неё специально. Если позже понадобится, `PlayerControls`/`PlayerIntent` уже дадут естественную границу для input-пакетов.

---

## 5. Сравнительная оценка

| Критерий | A: импорт | B: headless ECS | C: core lib | D: harness | E: GameWorld + agent | F: модули | G: сеть |
|----------|-----------|-----------------|-------------|------------|----------------------|-----------|---------|
| Переиспользование кода | Частичное | Высокое | Высокое | Высокое (после E) | **Высокое** | Высокое | Высокое |
| Расхождение с игрой | Формулы ✓, AI/физика ✗ | Минимальное | Минимальное | Минимальное | **Минимальное** | Минимальное | Минимальное |
| Управление игроком | Нет | Нужно добавить | Нужно добавить | Нужно добавить | **Есть** | Наследует | Есть |
| Детерминизм | Нет | Только с RNG+fixed tick | С RNG | С RNG | **Да, by design** | Наследует | Сложнее |
| Управление сценариями | Нет | API | API | **JSON + CLI** | JSON + CLI | JSON + модули | Сеть |
| Модульность | Низкая | Средняя | Высокая | Средняя | Средняя | **Высокая** | Высокая |
| Сложность | Низкая | Высокая | Очень высокая | Высокая | **Средне-высокая** | Средняя | Очень высокая |
| Время | 0.5–2 дня | 1–2 недели | 3–5 недель | 2–4 недели | **1–2 недели** | +3–5 дней | 4–8+ недель |
| Зависимость от ECS | Нет | Да | Нет | Да | Да (в мире) | Да | Да |
| Зависимость от DOM/WebGL | Нет | Нет | Нет | Нет | **Нет** | Нет | Нет (клиент отдельно) |
| Риск | Низкий | Средний | Высокий | Средний | **Средний** | Средний | Высокий |
| Вердикт | Делать первым | Основа E | Позже | После E | **Рекомендуется** | После E | Не сейчас |

---

## 6. Рекомендация по этапам

### Этап 0 — быстрый импорт и порядок в константах (0.5–2 дня)

**Цель:** убрать уже существующий дрейф, не трогая архитектуру.

1. Добавить `tsx` (или другой явный TS-раннер) в devDependencies и скрипт `npm run sim`.
2. Переписать `scripts/fighter-circle-sim.mjs` и `scripts/fighter-engagement-sim.mjs` на импорт:
   - `AimSolver.ts`;
   - `math.ts`;
   - `balance/player.ts`, `balance/enemies.ts`, `balance/aiming.ts`.
3. Убрать локальные копии `linearIntercept`, `arcPoint`, `arcIntercept`, `clamp`, `ramp01`.
4. Заменить константы:
   - `VP` → `PLAYER_MAX_SPEED`;
   - `HIT_R` → `PLAYER_HITBOX_RADIUS + PLAYER_BULLET_HIT_OFFSET`;
   - `MIN_TIME`/`MAX_TIME` → `FIGHTER_FIRE_MIN_TIME`/`FIGHTER_FIRE_MAX_TIME`;
   - `MIN_ANGULAR` → `FIGHTER_FIRE_MIN_ANGULAR`.
5. Убрать дубли `PLAYER_ACCEL`/`PLAYER_ACCELERATION`, перенести `FRICTION_EXP` в `balance/player.ts` и экспортировать единый `PLAYER_HIT_RADIUS`.
6. Зафиксировать в README/скрипте, что константы и формулы импортируются, а не копируются.

**Результат:** скрипты считают ту же игру, что и код. Это ещё не harness, но уже полезно.

### Этап 1 — `GameWorld` + `PlayerAgent` + fixed tick + RNG (1–2 недели)

**Цель:** один DOM-free мир, который можно запустить в Node.

1. Выделить `GameWorld` из `GameContext`:
   - игровые системы и физику;
   - FSM;
   - порты (`AudioPort`, `FxPort`, `GameplayHooks`, `PersistencePort`, `PlayerControls`, `Rng`);
   - никаких импортов `render/`, `presentation/`, `audio/`, `input.ts`, `core/env.ts`.
2. `GameContext` оставить презентационным хостом:
   - canvas, renderer, menu, input, audio, loop, resize, React hooks.
3. Ввести `PlayerControls` и перевести на него `PlayerSystem`/`AbilitySystem`/`WeaponManager`.
4. Реализовать `HumanControls` (поведение игры не меняется) и `AgentControls`.
5. Реализовать агентов: `OrbitAgent`, `KiteAgent`, `EvadeAgent`, `RandomAgent`.
6. Ввести `SimulationClock` с `FIXED_DT = 1/60`.
7. Ввести `Rng` и убрать `Math.random` из геймплейных путей.
8. Использовать существующий `IPhysics` (`custom`, `planck` или `p2`), не писать новый бэкенд.
9. Добавить in-memory `PersistencePort` и noop-порты.
10. Проверить, что `GameWorld` импортируется в Node без `window`/`document`.

**Критерий готовности:**

- `createGameWorld({ seed, physics: "custom" })` запускается в Node;
- `world.tick(1 / 60)` крутит реальные системы;
- 10 прогонов с одним seed дают одинаковый `snapshotHash` на каждом контрольном тике;
- 100 разных seed дают разные хэши и устойчивые агрегаты;
- браузерная игра проходит smoke-тест и ведёт себя как раньше.

### Этап 2 — сценарии, метрики, CLI (3–5 дней)

**Цель:** удобный инструмент для баланса.

1. `Scenario` + JSON-схема:
   ```json
   {
     "name": "fighter-orbit-r300",
     "seed": { "master": 12345 },
     "tickRate": 60,
     "duration": 30,
     "physics": "custom",
     "startWave": 10,
     "modules": ["core", "player", "weapons", "enemies"],
     "player": { "agent": "orbit", "radius": 300, "direction": 1, "speed": 600 },
     "enemies": [{ "kind": "fighter", "count": 1, "distance": 520 }],
     "upgrades": { "speed": 0, "fireRate": 0 },
     "metrics": ["shots", "hits", "dps", "survivalTime", "graze"]
   }
   ```
2. `MetricsSink`:
   - подписка на `enemy_killed`, `player_damaged`, `bullet_grazed`, `game_over`;
   - счётчики выстрелов (через `WeaponManager`/`addBullet`);
   - счётчики попаданий и нанесённого урона (добавить событие `enemy_damaged` или централизованный `damageEnemy`-хук);
   - время выживания, kills, DPS, hit rate, graze, нарушения зоны.
3. Агрегация: mean, median, stddev, p50/p95, min/max.
4. CLI:
   ```bash
   # Баланс: разные seed, иначе 100 детерминированных прогонов дадут 1 выборку.
   npm run sim -- sweep scenarios/fighter-orbit-r300.json --seed-range 1..100 --out results/baseline.json

   # Детерминизм: один seed, много повторов, ожидаем одинаковый hash.
   npm run sim -- run scenarios/fighter-orbit-r300.json --seed 12345 --runs 10 --expect-identical
   ```
5. Сравнение с baseline: paired-разница по seed, CI и порог регрессии (§8.6).
6. Мигрировать существующие скрипты на сценарии (или оставить их как быстрые проверки, но с импортом из игры).

### Этап 3 — модули, регрессии, авто-баланс (по желанию)

1. Ввести `GameModule` и разбить `GameWorld` на 4–6 модулей.
2. CI: на PR запускать набор сценариев; сравнение с baseline по seed set; если DPS/hit rate изменился больше порога — предупреждение или ошибка.
3. Авто-баланс: подбор `FIGHTER_BOLT_SPEED`, `FIGHTER_STANDOFF_R` и т.п. под целевой hit rate.
4. При необходимости — `game-core` как отдельный пакет.
5. Сетевой сервер — только если появится multiplayer/удалённые сервисы.

---

## 7. Метрики и сценарии

### 7.1 Обязательные метрики

- выстрелы игрока (shots);
- попадания (hits);
- hit rate = hits / shots;
- нанесённый урон и DPS;
- полученный урон и damage taken/s;
- время выживания;
- kills и kills/s;
- graze count;
- нарушения зоны (время вне зоны, выходы);
- использование способностей;
- разбивка по типам врагов (fighter/cruiser/carrier/hunter/drone).

### 7.2 Дополнительные метрики

- средняя/максимальная скорость игрока;
- средняя дистанция до цели;
- время в автонаведении vs ручном прицеле;
- количество промахов подряд;
- распределение урона по источникам (болты/контакты/астероиды/зона);
- RNG-поток и seed для воспроизведения.

### 7.3 Агрегация

Для `N` прогонов:

- mean, median, stddev;
- p50, p90, p95, p99;
- min/max;
- число выживших/погибших;
- гистограмма hit rate/DPS.

### 7.4 Регрессионный хэш

Для каждого прогона считать хэш от:

- финального тика;
- позиций/скоростей/HP игрока и врагов;
- счётчиков RNG-потоков;
- количества сущностей.

Одинаковый seed + сценарий + версия кода + один runtime → одинаковый хэш. Это ловит случайные изменения в порядке систем и RNG. Детали snapshot-хэша и отчёта о первом расхождении — в §8.5.

Важно: **bit-exact между браузером и Node не гарантируется** из-за разных реализаций `Math.sin`/`Math.cos`/`Math.exp`. Для регрессий сравнивать прогоны в одном runtime (например, Node-в-Node). Для браузера достаточно поведенческих тестов/допусков.

---

## 8. Система сидов и воспроизводимость

Идея «запустить игру с сидом 10 раз и получить стабильный результат» здравая, но её нужно разделить на три разные проверки, иначе легко получить ложную уверенность.

### 8.1 Три режима, которые нельзя смешивать

| Режим | Вход | Что доказывает | Что **не** доказывает |
|-------|------|----------------|------------------------|
| **Determinism replay** | 1 seed × 10 повторов | harness детерминирован: метрики и хэши совпадают бит-в-бит | ничего о балансе; это 1 выборка, а не 10 |
| **Balance sample** | 30–100 **разных** seed × 1 прогон | распределение DPS/hit rate и его доверительный интервал | не ловит недетерминизм |
| **Formula diff** | один и тот же набор seed до и после изменения формул | направление и величину эффекта изменения | не заменяет проверку детерминизма |

Главная поправка к формулировке: **10 запусков с одним seed — это проверка детерминизма, а не измерение баланса.** Все 10 прогонов должны дать *один и тот же* результат, то есть `stddev = 0`. Если нужна статистика «как играет билд», нужны 10 разных seed. Если нужен и тот и другой вывод — сначала 10 повторов одного seed (проверка harness), затем 100 разных seed (оценка баланса).

Второй нюанс: после изменения формулы тот же seed **не обязан** повторять старую траекторию — это ожидаемо. Сравнение «до/после» делается не по совпадению траекторий, а по **paired-разнице метрик на одном и том же наборе seed**. Сид фиксирует случайность, а не поведение формул.

### 8.2 Архитектура сидов

Seed — часть сценария, а не глобальная переменная и не `Date.now()`. Один мастер-seed порождает независимые корни потоков:

```ts
export type RngStream = "combat" | "spawn" | "drops" | "fx" | "agent";

export interface SeedSet {
  master: number;
  streams: Record<RngStream, number>;
}

export interface RunConfig {
  seed: SeedSet;
  tickRate: 60;
  duration: number;
  scenarioId: string;
}
```

```ts
// Не master + 1: потоки не должны коррелировать между собой.
// Достаточно стабильного хэша от master и имени потока (FNV-1a/xxhash).
export function deriveSeed(master: number, stream: RngStream): number {
  return hash32(`${stream}:${master >>> 0}`);
}
```

Правила:

1. **Каждый поток создаётся один раз на прогон** и живёт внутри `GameWorld`, а не в модуле-синглтоне.
2. **`rngCombat`** — разброс оружия, burst, AI-таймеры; **`rngSpawn`** — волны, позиции, seed врагов; **`rngDrops`** — пикапы и осколки; **`rngFx`** — частицы, тряска, визуальные seed'ы.
3. **Броски привязываются к событиям, а не к кадрам.** Если система тянет `rng.next()` каждый тик «на всякий случай», любое изменение формулы сдвигает весь дальнейший поток и сравнение превращается в шум.
4. Для врагов/снарядов можно деривировать **подпоток на сущность** (`deriveSeed(rngSpawn.draw(), entityId)`), чтобы добавление одного врага не меняло поведение остальных. Это опционально, но полезно для стабильных сценариев.
5. Seed и версия потоков попадают в результат прогона и в snapshot-хэш.

### 8.3 Контракт сброса

Перед каждым прогоном должен сбрасываться **весь** мир, а не только RNG:

- позиции, скорости, HP, компоненты ECS;
- пулы снарядов/эффектов и счётчики `entityId`;
- таймеры, cooldown'ы, FSM, прогресс волны и зоны;
- физический мир (`IPhysics.reset()` или новый экземпляр);
- `WeaponManager`, `SpawnSystem`, `AsteroidField`, `RiftField`;
- все `Rng`-потоки.

Предпочтительный путь — **новый `GameWorld` на каждый прогон**. Переиспользование мира без полного reset протащит состояние предыдущего seed'а в следующий, и «одинаковый» результат окажется случайно похожим, а не воспроизводимым.

### 8.4 Источники недетерминизма, которые надо закрыть

Помимо `Math.random`:

| Источник | Почему ломает replay | Что делать |
|----------|----------------------|-------------|
| `Date.now()` / `performance.now()` в геймплее | время между тиками разное | передавать `tick`/`elapsed` из мира |
| `requestAnimationFrame` dt | разный шаг физики | только `FIXED_DT = 1/60` |
| Порядок обхода `Set`/`Map`/`Object.keys` | зависит от порядка вставки и engine | явная сортировка по `entityId` |
| Порядок систем | меняет результат при равном состоянии | фиксированный `SystemSchedule` |
| Асинхронность (`Promise`, worker, audio callbacks) | порядок завершения не гарантирован | не влиять на геймплей из async-колбэков |
| `Audio`/`Fx`, использующие общий RNG | отключение звука меняет броски | отдельный `rngFx` |
| Разные runtime (браузер vs Node) | `Math.sin/cos/exp` могут отличаться в младших битах | сравнивать только внутри одного runtime |
| Загрузка контента/JSON | порядок ключей и чисел | каноническая сериализация, фиксированный порядок |

### 8.5 Snapshot-хэш и поиск первого расхождения

Финального хэша недостаточно: он говорит «разошлось», но не говорит «где». Нужен хэш на фиксированных интервалах (например, каждые 60 тиков):

```ts
interface Snapshot {
  tick: number;
  entities: Array<{ id: number; kind: string; x: number; y: number; vx: number; vy: number; hp: number }>;
  rngDraws: Record<RngStream, number>;
  score: number;
  wave: number;
}

function snapshotHash(s: Snapshot): number; // канонический порядок + побитовый hash чисел
```

Требования:

- сущности сортируются по `id`;
- числа хэшируются как `Float64`-биты, а не через локализованный `toString()`;
- в отчёт пишется `firstDivergenceTick` и потоки, у которых разошлось число бросков;
- хэш не должен зависеть от форматирования JSON.

Такой отчёт сразу показывает, какая система или какой RNG-поток первыми потеряли детерминизм.

### 8.6 Baseline и сравнение формул

Рабочий процесс:

1. **Зафиксировать сценарий и набор seed.** Например, `seeds = 1..100`, `scenarioHash`, `tickRate`, `version` кода.
2. **Снять baseline** и сохранить его в git (или в артефакт CI):
   - per-seed метрики;
   - агрегаты (mean/median/stddev/p50/p95);
   - snapshot-хэши;
   - `gitSha`, версию Node, версию физики.
3. **Изменить формулу/константу.**
4. **Прогнать тот же набор seed.**
5. **Сравнить paired-разницы по каждому seed:**
   - `ΔDPS`, `ΔhitRate`, `ΔsurvivalTime`, `Δkills`;
   - среднюю разницу и 95% CI (bootstrap или t-test);
   - число seed'ов, где стало лучше/хуже;
   - относительное изменение в %.
6. **Порог значимости** задаётся в конфиге: например, «регрессия, если `|ΔDPS| > 2%` и CI не пересекает 0».

Почему paired, а не «среднее до vs среднее после»: один и тот же seed убирает большую часть дисперсии сценария, поэтому даже 30 seed'ов дают заметно более узкий интервал, чем два независимых набора по 30.

Важная оговорка: если изменение формулы меняет **количество** бросков RNG (например, добавили ещё один выстрел), траектории после этого места разойдутся. Paired-сравнение всё равно осмысленно (тот же вход, тот же поток), но это уже не «replay старой траектории». Поэтому в отчёте нужно явно писать, был ли `rngDraws` одинаковым; если нет — сравнивать в том числе независимые выборки.

### 8.7 CLI и формат результата

```bash
# Проверка детерминизма: 10 повторов одного seed должны дать одинаковый hash.
npm run sim -- run scenarios/fighter-orbit-r300.json --seed 12345 --runs 10 --expect-identical

# Оценка баланса: 100 разных seed.
npm run sim -- sweep scenarios/fighter-orbit-r300.json --seed-range 1..100 --out results/baseline.json

# Сравнение после изменения формул.
npm run sim -- compare results/baseline.json results/current.json --fail-on-regression
```

`--expect-identical` завершается с ненулевым кодом, если хэши или метрики разошлись. `--fail-on-regression` — если превышен порог из конфига.

Результат прогона обязан содержать:

```json
{
  "scenario": "fighter-orbit-r300",
  "scenarioHash": "…",
  "gitSha": "…",
  "runtime": "node 22.x",
  "seed": { "master": 12345, "streams": { "combat": 1, "spawn": 2, "drops": 3, "fx": 4, "agent": 5 } },
  "runs": 10,
  "identical": true,
  "metrics": {},
  "snapshotHashes": [],
  "firstDivergenceTick": null
}
```

### 8.8 Критерии приёмки

- [ ] 10 прогонов с одним seed дают одинаковые метрики и `snapshotHash` на каждом контрольном тике.
- [ ] 100 разных seed дают разные хэши и статистически устойчивое распределение.
- [ ] В геймплейных путях нет `Math.random`, `Date.now`, `performance.now`.
- [ ] Порядок обхода сущностей и систем явно зафиксирован.
- [ ] `GameWorld` полностью сбрасывается между прогонами (или создаётся заново).
- [ ] В каждом результате есть seed set, `scenarioHash`, `gitSha`, версия runtime.
- [ ] `compare` умеет paired-разницу, CI и порог регрессии.
- [ ] Отчёт указывает `firstDivergenceTick`, если детерминизм нарушен.

---

## 9. Риски

| Риск | Вероятность | Mitigation |
|------|-------------|------------|
| Headless-физика расходится с браузерной | Средняя | Использовать те же `IPhysics`-бэкенды, а не новый; сравнивать позиции на одном сценарии с допуском |
| `FighterStrategy` слишком привязана к ECS | Средняя | Не делать DTO; использовать `EnemyRef` и узкие структурные интерфейсы; менять только реальные блокеры |
| Node.js ESM vs TypeScript | Средняя | Явный раннер (`tsx`/`esbuild`), зафиксировать версию Node, добавить `npm run sim` |
| «Жирный» headless-мир с noop-зависимостями | Средняя | Явные порты + `Null*` реализации; ESLint-запрет импортов `render/`, `presentation/`, `audio/`, `input.ts` в `GameWorld` |
| `Math.random` остаётся в геймплее | Высокая | RNG-аудит, ESLint-правило, тест «10 повторов одного seed → одинаковый хэш» |
| Путаница «10 повторов одного seed» с оценкой баланса | Высокая | Явно разделять determinism replay и balance sample; для баланса — 30–100 разных seed |
| Изменение формулы сдвигает число RNG-бросков | Высокая | Сравнивать paired-разницу и отдельно проверять `rngDraws`; не ожидать повторения старой траектории |
| Baseline сравнивается между разными runtime | Средняя | Хранить `runtime` в результате; сравнивать только Node-в-Node или браузер-в-браузер |
| Переменный dt снова протекает в симуляцию | Средняя | `SimulationClock` только с `FIXED_DT`; не использовать `GameLoop` в симуляции |
| Порядок систем/сущностей нестабилен | Средняя | `SystemSchedule` + фиксированный порядок; тест повторяемости; не полагаться на `Set`/`Map` без явной сортировки |
| Модули создают циклические зависимости | Средняя | Контракт `GameModule`, зависимости только через core-интерфейсы, проверка графа импортов |
| Симуляция «слишком умная» и не отражает человека | Средняя | Несколько агентов, запись реальных реплеев, калибровка по человеческим забегам |
| Производительность 100 прогонов | Низкая | Начать последовательно; при необходимости worker threads/батчи |
| Сетевой split расползётся по коду | Низкая | Не делать сеть сейчас; `PlayerIntent` уже даёт будущую границу |

---

## 10. Что будет после реализации

1. **Баланс-анализ** — JSON-конфиг описывает сценарий, CLI запускает 100 разных seed, выдаёт таблицу DPS и попаданий.
2. **Регрессионные тесты** — на каждый PR запускается тот же seed set; если DPS файтера изменился больше порога (paired-разница, CI) — предупреждение или ошибка.
3. **Авто-баланс** — подбор `FIGHTER_BOLT_SPEED`, `FIGHTER_STANDOFF_R` и других параметров под целевой hit rate.
4. **Одна истина** — ни один скрипт не копирует формулу из игры; `import` — единственный источник.
5. **Реплеи** — запись `PlayerIntent` из реальных забегов и воспроизведение для отладки.
6. **Сценарии как тесты** — «игрок-орбита R=300, 1 файтер, волна 10» становится регрессионным тестом баланса.
7. **Модульные эксперименты** — новые механики подключаются модулем и сразу получают сценарии/метрики.

---

## Приложение A. Целевые интерфейсы (эскиз)

```ts
// src/game/core/WorldPorts.ts
export interface AudioPort {
  playShoot(): void;
  playEnemyShoot(): void;
  playHeavyShoot(): void;
  playPickupSound(kind: string): void;
  playExplosion(size?: number): void;
  playPlayerHit(): void;
  playDroneShot(): void;
  playDroneHit(): void;
  playRiftOpen(): void;
  playRiftClose(): void;
  playRiftSpawn(): void;
  playComboUp(mult: number): void;
}

export interface FxPort {
  burst(x: number, y: number, n: number, color: string, speed: number, life: number): void;
  ring(x: number, y: number, r: number, color: string, life: number): void;
  addShake(v: number): void;
  reset(): void;
}

export interface GameplayHooks {
  onBanner(data: unknown | null): void;
  onToast(data: unknown | null): void;
  onCountdown(data: unknown | null): void;
  onGameOver(): void;
  onStats(stats: unknown): void;
}

export interface PlayerControls {
  axis: { x: number; y: number };
  aimAngle: number | null;
  firing: boolean;
  consumeAbility(): boolean;
}

export type RngStream = "combat" | "spawn" | "drops" | "fx" | "agent";

export interface SeedSet {
  master: number;
  streams: Record<RngStream, number>;
}

export interface Rng {
  next(): number;
  range(a: number, b: number): number;
  int(maxExclusive: number): number;
}
```

```ts
// src/game/core/GameWorld.ts (эскиз)
export interface WorldPorts {
  audio: AudioPort;
  fx: FxPort;
  hooks: GameplayHooks;
  storage: PersistencePort;
  rng: {
    combat: Rng;
    spawn: Rng;
    drops: Rng;
    fx: Rng;
    agent: Rng;
  };
}

export interface GameWorldConfig {
  seed: SeedSet;
  startWave: number;
  physics: "custom" | "planck" | "p2";
  skipCountdown?: boolean;
  testMode?: boolean;
}

export class GameWorld {
  readonly eventBus: EventBus;
  readonly ecs: EcsWorld;
  readonly schedule: SystemSchedule;
  readonly playerSystem: PlayerSystem;
  readonly weaponManager: WeaponManager;
  readonly physics: PhysicsSystem;
  readonly fsm: GameStateMachine<GameFSMContext>;
  readonly controls: PlayerControls;

  constructor(config: GameWorldConfig, ports: WorldPorts) { /* ... */ }

  startRun(): void { /* без DOM/меню */ }
  tick(dt: number): void { /* engine.run(dt) */ }
}
```

```ts
// src/game/simulation/PlayerAgent.ts (эскиз)
export interface PlayerAgent {
  reset?(seed: number): void;
  update(view: PlayerView, dt: number): PlayerIntent;
}

// Пример: OrbitAgent
export class OrbitAgent implements PlayerAgent {
  constructor(private readonly opts: { radius: number; direction: 1 | -1; speed: number }) {}

  update(view: PlayerView, _dt: number): PlayerIntent {
    const { player, zone } = view;
    const cx = zone.active ? zone.x : 0;
    const cy = zone.active ? zone.y : 0;

    const dx = player.position.x - cx;
    const dy = player.position.y - cy;
    const dist = Math.hypot(dx, dy) || 1;
    const nx = dx / dist;
    const ny = dy / dist;

    const tangentX = -ny * this.opts.direction;
    const tangentY = nx * this.opts.direction;
    const radial = (this.opts.radius - dist) * 2;

    const desiredX = tangentX * this.opts.speed + nx * radial;
    const desiredY = tangentY * this.opts.speed + ny * radial;

    // Ось — намерение ускорения, а не скорость.
    // Делим на скорость, чтобы у цели оставалась аналоговая коррекция.
    const ax = clamp((desiredX - player.velocity.vx) / this.opts.speed, -1, 1);
    const ay = clamp((desiredY - player.velocity.vy) / this.opts.speed, -1, 1);
    const len = Math.hypot(ax, ay);
    const norm = len > 1 ? len : 1;

    return {
      move: { x: ax / norm, y: ay / norm },
      aim: null,
      fire: false,
      ability: false,
    };
  }
}
```

```ts
// src/game/simulation/Metrics.ts (эскиз)
export interface RunMetrics {
  seed: number;
  ticks: number;
  shots: number;
  hits: number;
  hitRate: number;
  damageDealt: number;
  damageTaken: number;
  dps: number;
  survivalTime: number;
  kills: number;
  graze: number;
  zoneViolations: number;
  hash: string;
}

export interface AggregateMetrics {
  runs: number;
  mean: RunMetrics;
  median: RunMetrics;
  stddev: RunMetrics;
  p50: RunMetrics;
  p95: RunMetrics;
}
```

---

## Приложение B. План миграции `Math.random`

1. Добавить `Rng`, `createRng(seed)`, `RngStream` и `deriveSeed(master, stream)` в `src/game/math.ts` (рядом с `mulberry32`).
2. Добавить `rng` в конструкторы/методы:
   - `AimSolver.aimAtTarget`;
   - `EnemySystem`;
   - `EnemyShootingSystem`;
   - `CannonWeapon`;
   - `CarrierStrategy`;
   - `DroneSwarm`;
   - `PickupDropSystem`;
   - `AsteroidField`;
   - `RiftField`.
3. Заменить `Math.random()` на `rng.next()` / `rng.range()`.
4. Для `math.rand` сделать `rand(a, b, rng = Math.random)` только на переходный период; в геймплейных вызовах передавать `rng` явно.
5. `Fx`/`LaserWeapon`/`audio` перевести на отдельный `rngFx` или оставить `Math.random`, если они не влияют на геймплей, но **не использовать общий поток**.
6. Добавить ESLint-правило: `Math.random`, `Date.now`, `performance.now` запрещены в `src/game/{systems,weapons,ai,aiming,ecs}` (кроме явно разрешённых презентационных мест).
7. Гарантировать сброс всех потоков и счётчиков при создании/reset `GameWorld`.
8. Тесты:
   - 10 прогонов с одним seed → одинаковые метрики и `snapshotHash` на каждом контрольном тике;
   - 100 разных seed → разные хэши и устойчивые агрегаты;
   - `firstDivergenceTick = null` для детерминированного прогона.

---

## Приложение C. Чек-лист готовности harness

- [ ] `GameWorld` импортируется в Node без `window`, `document`, `canvas`, `AudioContext`.
- [ ] `GameWorld` не импортирует `render/`, `presentation/`, `audio/`, `input.ts`, `core/env.ts`.
- [ ] `PlayerControls` используется `PlayerSystem` и `AbilitySystem`; `GameWorld` применяет `aimAngle`/`firing` к `WeaponManager`.
- [ ] `HumanControls` сохраняет текущее управление в браузере.
- [ ] `OrbitAgent`, `KiteAgent`, `EvadeAgent`, `RandomAgent` работают.
- [ ] Симуляция использует `FIXED_DT = 1/60` и не использует `GameLoop`.
- [ ] Все геймплейные `Math.random` заменены на seeded `Rng`; потоки независимы (`combat`, `spawn`, `drops`, `fx`, `agent`).
- [ ] `GameWorld` полностью сбрасывает состояние (пулы, `entityId`, таймеры, FSM, физику, RNG) между прогонами.
- [ ] 10 прогонов с одним seed дают одинаковые метрики и `snapshotHash` на каждом контрольном тике.
- [ ] 100 разных seed дают разные хэши и устойчивое распределение метрик.
- [ ] В результате прогона есть seed set, `scenarioHash`, `gitSha`, версия runtime.
- [ ] `compare` считает paired-разницу, CI и срабатывает на порог регрессии.
- [ ] Сценарий JSON валидируется и даёт понятную ошибку.
- [ ] Метрики: shots, hits, hitRate, DPS, damageTaken, survivalTime, kills, graze, zoneViolations.
- [ ] CLI поддерживает `--runs`, `--seed`, `--out`.
- [ ] `npm run typecheck` проходит.
- [ ] Браузерная игра не изменила поведение (smoke-тест).
- [ ] Старые скрипты либо импортируют игру, либо заменены сценариями.

---

## Приложение D. Карта исходного документа

| Исходный раздел | Куда перенесён / что изменилось |
|-----------------|----------------------------------|
| 1.1 Существующие тулзы | §1.1, добавлена колонка «Главная проблема» |
| 1.2 Что в игровом коде | §1.2, исправлены пути и имена констант |
| 1.3 Что скрипты делают сейчас | §1.3, добавлена таблица фактических значений |
| 2.1 Расхождение формул | §3.1, добавлены уже устаревшие константы и дубли `PLAYER_ACCEL`/`PLAYER_HIT_RADIUS` |
| 2.2 Упрощённая физика и AI | §3.2, без изменений по смыслу |
| 2.3 Нет управления симуляциями | §3.3 |
| 2.4 Нет headless-режима | §3.4, причина исправлена: блокер не ECS, а композиционный корень/DOM |
| 2.5 Масштабируемость | §3.5 |
| 3, варианты A–D | §4, исходные формулировки сохранены в блоках и дополнены аудитом |
| 4. Сравнительная оценка | §5, расширена вариантами E–G и критериями детерминизма/управления |
| 5. Рекомендация | §6, переработана в этапы 0–3 |
| 6. Риски | §9, добавлены RNG, fixed tick, порядок систем, модули, агенты |
| 7. Что будет после реализации | §10, добавлены реплеи и сценарии-тесты |
| — (новая тема: seed-воспроизводимость) | §8, добавлена полностью: три режима проверки, деривация потоков, snapshot-хэши, baseline и сравнение формул |
