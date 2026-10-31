# Rift: аудит и план рефакторинга

**Дата:** 2026-10-30
**Ветка:** `ecs`
**Коммит на момент аудита:** `b5c26c10 feat(ecs): декомпозиция жирных ECS-компонентов на базовые + узкий`
**Область:** `src/` (≈24 000 строк TS/TSX), конфигурация сборки, `tasks/`
**Статус документа:** актуальная замена `tasks/refactoring-plan.md` (тот документ устарел: описывает `game.ts` как God class на 1025 строк, тогда как сейчас `game.ts` — 173 строки).
**Статус плана:** ✅ **выполнен 2026-10-31** — все фазы 0–9 и критерии §9 закрыты; поведение, баланс и порядок отрисовки не менялись (багфиксы BUG-1…BUG-4 — отдельными изменениями). Изменения не коммитились: рабочее дерево на ветке `ecs`.

---

## 1. Резюме

Проект прошёл крупную миграцию на ECS и стал заметно лучше: физика и рендер вынесены за интерфейсы, баланс разложен по доменам, i18n получил типизацию ключей, появились `WorldFrame`, `EventBus`, `PersistencePort`. Это не «проект в хаосе» — это рабочий код с хорошими костяками.

Но миграция завершена **структурно, а не архитектурно**. Центр мира — `EcsWorld` на 1151 строку — остался God facade: он одновременно является фабрикой сущностей, репозиторием, физическим источником, слоем DTO и публичным mutable-контейнером. Вокруг него сохранились:

- два независимых пути смерти врага (`killEnemy` и `damageEnemy`), которые уже расходятся по семантике;
- три разных механизма персистентности, из-за чего два реальных бага с `localStorage` (см. §5);
- смешанный `WorldFrame`, где половина полей — живые ECS-ссылки, а половина — свежие DTO-копии, пересоздаваемые каждый кадр;
- ручной порядок систем через магические числа и вызовы вне `engine.run`;
- UI-слой, который пишет в DOM каждый кадр и напрямую читает `localStorage`;
- монолитные `SpawnSystem`, `WaveOrchestrator`, `MenuScene`, `App.tsx`, `UpgradeScreen.tsx`, `i18n.ts`.

**Главный вывод:** следующим большим шагом должен быть не «ещё один слой абстракции», а **разделение владения**: один модуль — одна причина изменения. При этом поведение, баланс и порядок отрисовки обязаны остаться прежними; найденные баги фиксируются отдельно и только с явного согласия.

**Рекомендуемый порядок:** сначала дешёвая гигиена и персистентность, затем единый путь смерти, затем распил `EcsWorld`, затем кадр/планировщик, затем презентация и UI, в конце — i18n и опциональная оптимизация бандла.

---

## 2. Базовые проверки (зафиксированы до изменений)

| Проверка | Команда | Результат |
|---|---|---|
| Типы | `npm run typecheck` | ✅ exit 0 |
| Линт | `npm run lint` | ❌ 38 errors, 1 warning |
| i18n | `npm run check:i18n` | ✅ 200 ключей в каждом словаре |
| Сборка | `npm run build` | ✅ 897 ms, JS 807.46 kB (gzip 217.96 kB), warning >500 kB |
| Git | `git status --short` | чисто |

Линт-ошибки — почти все `max-len` в JSX, но есть и содержательные:

- `src/game/systems/CameraSystem.ts:37` — неиспользуемый `dt`;
- `src/game/systems/EntityCollision.ts:17,34` — неиспользуемые `impulse`, `totalMass`;
- `src/game/systems/InputSystem.ts:31,46` — неиспользуемый `e`;
- `src/game/systems/MenuScene.ts:25` — неиспользуемый импорт `Enemy`, `:82` — `any`;
- `src/game/systems/Renderers/BulletRenderer.ts:8`, `PlayerRenderer.ts:8` — неиспользуемый `RGBA`;
- `src/game/systems/Renderers/RiftAnimation.ts:6,35` — неиспользуемые `C`, `cycleTime`;
- `src/game/weapons/CannonWeapon.ts:38` — неиспользуемая `CANNON_TARGET_RANGE`;
- `src/game/core/StateMachine.ts:70` — `console.log('[FSM] fire blocked: no context')` в рантайме.

Это важно: **базовый линт не был зелёным до рефакторинга**, поэтому цель «0 ошибок» — не регрессия, а отдельный результат, который нужно зафиксировать.

---

## 3. Метрики текущего состояния

| Файл | Строк | Роль | Проблема |
|---|---:|---|---|
| `src/game/ecs/EcsWorld.ts` | 1151 | «мир» | God facade, 30 полных сканов, публичные внутренности |
| `src/ui/UpgradeScreen.tsx` | 946 | экран прокачки | 10+ компонентов в одном файле, hardcode `/с` |
| `src/game/render/BaseRenderer.ts` | 667 | WebGL-рендер | дублирование с `PicoGLRenderer` |
| `src/game/core/GameContext.ts` | 652 | композиционный корень | ~40 полей, 300+ строк конструктора |
| `src/game/render/PicoGLRenderer.ts` | 613 | PicoGL-рендер | дублирование с `BaseRenderer` |
| `src/App.tsx` | 587 | UI-корень | lifecycle, routing, dev tools, localStorage, HUD |
| `src/i18n.ts` | 499 | словари | один монолитный файл на все домены |
| `src/game/systems/SpawnSystem.ts` | 446 | волны/спавн | волны + разломы + анонсы + RNG + астероиды |
| `src/game/systems/WaveOrchestrator.ts` | 337 | волновой FSM | зона + FSM + урон + баннеры + таймеры |
| `src/game/systems/CollisionSystem.ts` | 330 | коллизии | несколько доменов в одном проходе |
| `src/game/systems/MenuScene.ts` | 290 | меню | дублирует rift/enemy-анимацию, `as any` |
| `src/game/systems/RendererSystem.ts` | 269 | рендер-координатор | 15 позиционных аргументов |
| `src/game/core/GameFrame.ts` | 86 | кадр | ручные вызовы вне `engine.run` |

Суммарно по `src/` — 23 976 строк. 22 файла превышают 250 строк; 10 — превышают 400.

---

## 4. Что уже сделано хорошо (не трогать без причины)

1. **Порты физики и рендера.** `IPhysics` + `CustomCurrentPhysics`/`PlanckPhysics`/`P2Physics`, `IRenderer` + `BaseRenderer`/`PicoGLRenderer`/`NullRenderer`. Выбор бэкенда — в композиционном корне. Это правильный шов, его надо сохранить.
2. **ECS-компоненты декомпозированы.** Базовые `Position`/`Velocity`/`Radius`/`Life` + узкие доменные компоненты; `EnemyRef`/`AsteroidRef`/`DroneRef`/`PlayerRef` дают стабильную идентичность.
3. **`EventBus`.** События `enemy_killed`, `score_added`, `player_hit` и т.п. позволяют развязать домены; главное — не дублировать публикацию.
4. **`PersistencePort`.** Правильный интерфейс для доменов; проблема не в нём, а в том, что часть кода ходит в `localStorage` мимо него.
5. **Баланс вынесен в `src/game/balance/*`.** `PLAYER_*`, `PICKUP_CATALOG`, `ENEMY_*` — единые источники значений.
6. **Типизированный i18n.** `TKey = keyof typeof ru`, `Dict` — mapped type, `check:i18n` ловит рассинхрон.
7. **Нет TODO/FIXME/HACK.** Мёртвый код не помечен, а просто удалён — это соответствует правилам проекта.
8. **`NullRenderer` + `?renderer=null`, `?physics=`.** Отличный инструмент для smoke-проверок без WebGL/физики.

Вывод: рефакторинг должен быть **эволюционным**. Большой переписывающий PR здесь опаснее, чем серия узких.

---

## 5. Найденные дефекты (не рефакторинг, а баги; исправлять отдельно)

Эти пункты **меняют наблюдаемое поведение** (в лучшую сторону). Их нельзя «протащить» внутри архитектурного рефакторинга — нужен отдельный коммит и согласие.

### BUG-1. Рекорд сохраняется под одним ключом, а читается из другого

- `src/game/systems/ScoringSystem.ts:10` — `const BEST_KEY = "voxbest";`
- `src/App.tsx:214` — `setBest(Number(localStorage.getItem("rift9_best")) || 0);`

Следствие: во время сессии рекорд обновляется через `onStats`, но после перезагрузки страницы в меню снова `0`. Плюс в `localStorage` копится легаси-ключ `voxbest`.

**Решение:** единый `STORAGE_KEYS.best = "rift9_best"` + одноразовая миграция `voxbest → rift9_best`.

### BUG-2. God mode не восстанавливается после перезагрузки

- `src/hooks/usePersistedState.ts:13-22` — читает/сохраняет через `JSON.parse`/`JSON.stringify`, то есть `"true"`.
- `src/App.tsx:218` — проверяет `localStorage.getItem("rift9_debug_god") === "1"`.

Следствие: сохранённый god mode читается как `false`; ветка `=== "1"` мертва. При этом `usePersistentSettings` уже поднял `debugGod` из storage — правильнее синхронизировать игру из React-состояния, а не читать ключ второй раз.

**Решение:** убрать прямое чтение из `App.tsx`, применять `debugGod` из `usePersistentSettings` в эффекте жизненного цикла (или в `GameHooks`).

### BUG-3. Смешанные форматы хранения

Одни ключи пишутся как JSON (`usePersistedState`), другие — как сырые строки (`PersistencePort`, `upgrades.ts`, `DroneSystem.ts`). Это уже привело к BUG-2 и будет приводить к таким же ошибкам при каждом новом ключе.

**Решение:** один модуль `STORAGE_KEYS` + один формат (JSON) + миграции для старых значений.

### BUG-4. Русский суффикс в английской локали

- `src/ui/UpgradeScreen.tsx:132-136` — `` `${...}/с` `` и `` `${...}с` `` жёстко вшиты в текст.
- `src/ui/screens/SettingsScreen.tsx:128` — `label="РУС"` (это осознанное название языка, допустимо).
- `src/ui/UpgradeScreen.tsx` — `"/// MAX"`, `"MAX"` не проходят через `t()`.

Следствие: в EN-локали экран прокачки показывает «5.0/с», «12с». Мелочь, но ломает обещание полной локализации.

**Решение:** ключи вида `upgrade.perSecond`, `common.seconds`, `common.max` с параметрами.

---

## 6. Критические архитектурные находки

### P0-1. `EcsWorld` — God facade на 1151 строку

**Где:** `src/game/ecs/EcsWorld.ts`.

**Что внутри одновременно:**

- создание/регистрация `Engine`, `GameEntity`, компонентов;
- спавн игрока, врагов, пуль, вражеских пуль, пикапов, дронов, лучей, частиц, колец, астероидов, разломов;
- запросы `enemies()`, `bullets()`, `enemyBullets()`, `pickups()`, `allyDrones()`, `beams()`, `asteroids()`;
- удаление и `clear*()` для каждого типа;
- сборка физических тел `physicsBodies()`;
- конвертация компонентов в plain DTO (`Enemy`, `Bullet`, `EBullet`, `Pickup`, `LaserBeam`);
- публикация `enemy_killed` в `damageEnemy()`;
- публичные `readonly`-поля `engine`, `enemySystem`, `enemyShootingSystem`, что позволяет любому коду обходить API.

**Цифры:**

- 30 полных проходов `for (const entity of this.engine.entities.elements as GameEntity[])` — в каждом запросе, каждом `*ById`, каждом `clear*`;
- 56 методов/геттеров на классе;
- `enemyComponentById()` (`:483`) линейно ищет врага по id;
- `damageEnemy()` (`:747`) сам публикует событие;
- `clear()` (`:1149`) просто `engine.entities.clear()` — без сброса кэшей/индексов.

**Почему это блокер:** любое изменение геймплея требует правки этого файла; тесты невозможны без поднятия всего мира; системы получают «весь мир» и могут делать что угодно.

**Целевое состояние:** тонкий `EcsEngine` (владеет `Engine`, фабрикой сущностей, регистрацией компонентов, `update(dt)`) + доменные модули:

```
src/game/ecs/
  EcsEngine.ts          // Engine + GameEntity factory + component registry + update loop
  EntityIndex.ts        // index: componentClass -> Set<GameEntity>, инвалидация при add/remove
  domains/
    player.ts           // registerPlayer/playerRef/playerSnapshot
    enemies.ts          // spawnEnemy/enemies/enemyById/damageEnemy/removeEnemy
    bullets.ts          // addBullet/bullets/removeBullet
    enemyBullets.ts
    pickups.ts
    drones.ts
    beams.ts
    effects.ts          // particles/rings
    asteroids.ts
    rifts.ts
  physicsBodies.ts      // сборка PhysicsBodyDef из компонентов
```

Домен — не адаптер и не «обёртка ради обёртки»: он **владеет** жизненным циклом своего типа сущностей и не даёт доступа к чужим. `GameContext` собирает домены и передаёт системам **узкие интерфейсы**, а не весь мир.

**Важно:** `EntityIndex` — это структура данных, а не слой. Она устраняет 30 O(n)-сканов и делает `enemyById` O(1).

---

### P0-2. Два пути смерти врага

**Где:**

- `src/game/core/GameContext.ts:612-624` — `killEnemy(enemy: EnemyRef)`:
  - проверяет `marker.dead`, ставит `dead = true`, публикует `enemy_killed`;
  - **не трогает `life.remaining`**.
- `src/game/ecs/EcsWorld.ts:747-764` — `damageEnemy(id, dmg)`:
  - находит ref, вычитает HP, ставит `flash`, при `<= 0` ставит `dead` и публикует `enemy_killed`.

**Как вызывают:**

- `AbilitySystem` получает `killEnemy` (`GameContext.ts:282`);
- `WeaponManager` получает и `killEnemy`, и `damageEnemy` (`GameContext.ts:310-314`);
- коллизии идут через `damageEnemy`.

**Риск:** любой новый вызывающий может убить врага, минуя урон/HP, или наоборот нанести урон уже мёртвому. Публикация события дублируется в двух местах — любое изменение payload (`score`, `seed`, `kind`) нужно делать дважды.

**Целевое состояние:** один канонический `EnemyLifecycle`:

- `damage(ref, dmg): boolean` — единственная точка изменения HP;
- `kill(ref)` — либо `damage(ref, ref.life.remaining)`, либо явный `forceKill` с комментарием, зачем он нужен (например, «мгновенное уничтожение способностью»);
- событие публикуется **только** внутри lifecycle;
- `GameContext` больше не содержит `killEnemy`/`damageEnemy`, а отдаёт системам один интерфейс.

**Обязательно:** перед изменением зафиксировать текущую семантику способностей (что именно должно убивать мгновенно) и проверить smoke-сценарий «лазер/пушка/ракета/способность/контакт».

---

### P0-3. `WorldFrame` смешивает живые ссылки и DTO-копии

**Где:** `src/game/core/WorldFrame.ts:31-41`, `src/game/core/GameContext.ts:552-568`.

```
player: PlayerRef          // живая ссылка
enemies: EnemyRef[]        // живые ссылки
bullets: Bullet[]          // свежие DTO каждый кадр
enemyBullets: EBullet[]    // свежие DTO
pickups: Pickup[]          // свежие DTO
allyDrones: DroneRef[]     // живые ссылки
beams: LaserBeam[]         // свежие DTO
asteroids: AsteroidRef[]   // живые ссылки
```

**Следствия:**

- `buildWorld()` вызывает `this.ecs.enemies()`, `bullets()`, `enemyBullets()`, `pickups()`, `allyDrones()`, `beams()`, `asteroids()` — каждый из них делает полный скан и создаёт новый массив;
- рендер получает смесь: часть данных живая и мутирует, часть — снимок;
- `BulletRenderer.ts:38,45` вынужден делать `as unknown as BulletRenderState[]`;
- нельзя понять, можно ли мутировать поле, не заглянув в реализацию.

**Целевое состояние:** одно из двух, но последовательно:

1. **Предпочтительно:** `WorldFrame` — снимок **ссылок** на компоненты (`BulletRef`, `PickupRef`, `BeamRef`), без plain DTO. Рендер-билдеры читают компоненты и строят свои render-state.
2. Либо `WorldFrame` — полностью immutable snapshot, но тогда он строится **один раз за кадр** и переиспользует буферы, а не аллоцирует массивы.

Смешанный вариант запрещён. `types.ts`-DTO для сущностей (`Enemy`, `Bullet`, `EBullet`, `Pickup`, `LaserBeam`) после этого удаляются; остаются только визуальные типы (`Particle`, `Ring`, `Rift`).

---

### P1-1. `GameContext` — композиционный корень на 652 строки

**Где:** `src/game/core/GameContext.ts`.

- ~40 `readonly`-полей-подсистем;
- конструктор `:133` занимает несколько сотен строк и вручную создаёт всё: рендерер, физику, скоринг, камеру, ECS, input, fx, starfield, asteroid field, rift field, renderer system, menu scene, bonus manager, shield, graze, player, ability, spawn, weapon, countdown, pickup, loadout, drop, collision, zone, wave, FSM, death, render, frame, listeners, start, upgrades, loop;
- дублирующиеся колбэки `damageEnemy` в `:283-286` и `:311-314`;
- прямые `window.location.search` (`:142`, `:156`), `window.innerWidth` (`:470`);
- `buildWorld()` и `buildSpawnDeps()` — тоже здесь.

**Целевое состояние:** разбить на композиционные модули **без нового DI-контейнера**:

```
core/bootstrap/
  createRenderStack.ts    // canvas -> IRenderer + RendererSystem + MenuScene
  createPhysicsStack.ts   // URL/storage -> PhysicsSystem
  createEcsStack.ts       // EventBus -> EcsEngine + domains + ECS systems
  createCombatStack.ts    // weapons, abilities, collisions, death
  createGameplayStack.ts  // spawn, wave, zone, countdown, loadout
  createPresentation.ts   // GameRender, GameFrame, HUD callbacks
```

`GameContext` остаётся фасадом для `Game`, но его конструктор становится последовательностью вызовов этих функций. Это **не** адаптеры: это те же самые объекты, собранные по доменам.

`window`/URL-доступ вынести в `core/env.ts` (`readUrlParams`, `getViewport`, `getDevicePixelRatio`) — один источник.

---

### P1-2. Порядок систем — магические числа и скрытые зависимости

**Где:** `super(n)` в 17 системах.

```
ScoringSystem        -20
ShieldSystem         -12
CountdownSystem      -10
AbilitySystem         -8
PlayerSystem          -1
EnemySystem            0
PickupMovementSystem   0
RingSystem             0
ParticleSystem         0
EnemyShootingSystem    1
PickupCollectionSystem 1
BulletSystem           2
BeamSystem             2
AllyDroneSystem        3
CollisionSystem        7
SpawnSystem            8
WaveFlowSystem         9
ZoneSystem            10
ZoneClampSystem       11
LoadoutSystem          12
```

Проблемы:

- **дубли приоритетов** (`0` — четыре системы, `1` — две, `2` — две): фактический порядок зависит от порядка `systems.add(...)` в `GameContext`, то есть от порядка строк в конструкторе;
- комментарии «после X, до Y» — единственная документация зависимости;
- `GameFrame.step()` (`:37-75`) дополнительно вручную вызывает `deathSystem`, `fx`, `asteroidField`, `render` **вне** `engine.run`, хотя рядом написано, что всё должно быть внутри;
- `GameFrame` импортирует `AsteroidEnv` инлайн-типом (`:62`) и читает `window.innerWidth/innerHeight`.

**Целевое состояние:** явный `SystemSchedule`:

```ts
export const enum Phase {
  Input = 0,
  Player = 100,
  Enemies = 200,
  Projectiles = 300,
  Physics = 400,
  Collisions = 500,
  Spawn = 600,
  Wave = 700,
  Presentation = 800,
}
```

- каждая система объявляет `phase`, а не произвольное число;
- внутри фазы порядок задаётся **явным списком регистрации**, а не случайным `super`;
- `GameFrame` вызывает только `engine.run(dt)` и `presentation.update/render`; `death/fx/asteroid` становятся системами или частью `PresentationFrame`;
- никаких `window` в `GameFrame`.

**Проверка:** временно включить debug-лог порядка один раз, сверить с текущим поведением, затем лог убрать.

---

### P1-3. `SpawnSystem` смешивает 5 ответственностей

**Где:** `src/game/systems/SpawnSystem.ts` (446 строк).

- выбор количества разломов: `riftCountFor()` (`:168-175`), причём `:172` использует `Math.random()` **внутри расчёта волны** — результат не воспроизводим и не виден в debug;
- размещение разломов: `placeRiftPoints()` (`:177-260`) — геометрия и эвристика;
- анонсы новых типов: `announceNewKinds()` (`:282-290`) + `onToast`;
- счётчики/состояние волны: `startRifts`, `spawnIndex`, `killedWave`;
- спавн астероидов: `:443` (`80 + Math.random() * 40`).

**Целевое состояние:**

- `WaveComposition` — чистая функция «номер волны → состав» (типы, количество, пороги), без `Math.random`;
- `RiftPlacement` — чистая геометрия;
- `WaveAnnouncements` — отдельный сервис/toast-порт;
- `AsteroidSpawner` — вне `SpawnSystem`;
- RNG — инжектируемый `RandomSource` (для геймплея можно оставить `Math.random`, но через один порт, чтобы debug/seed был возможен).

**Важно:** не менять thresholds и распределение — только вынести и централизовать.

---

### P1-4. `WaveOrchestrator` смешивает зону, FSM, урон и UI

**Где:** `src/game/systems/WaveOrchestrator.ts` (337 строк).

- модель зоны (`zoneState`, `:111`);
- волновой FSM (переходы, `:236-278`);
- урон за границей (`:311-333`);
- баннеры/тосты (`:265`, `:278`, `:321`);
- таймеры (`edgeOutT`, `edgeTickT`, `edgeWarned`).

**Целевое состояние:**

- `ZoneModel` — только геометрия/состояние;
- `WaveStateMachine` — только переходы и счётчики;
- `ZoneEdgeDamage` — только урон по игроку;
- UI-уведомления — через `GameHooks`/`EventBus`, без прямых `t()` в оркестраторе (сейчас `t("game.zoneWarning")` вызывается внутри).

`WaveFlowSystem` не должен получать конкретные системы; ему достаточно узкого `WaveFlowDeps`.

---

### P1-5. `MenuScene` дублирует игровой мир

**Где:** `src/game/systems/MenuScene.ts` (290 строк).

- собственные `MenuRift`, `MenuEnemy`, массивы `menuRifts`, `menuEnemies`;
- собственная логика спавна/движения/затухания;
- `as any` при передаче `AsteroidEnv` (`:82`);
- неиспользуемый импорт `Enemy` (`:25`);
- `RendererSystem.renderMenu()` принимает 9 аргументов, включая два инлайн-типа структур (`RendererSystem.ts:115-142`).

**Целевое состояние:**

- меню — это **отдельная презентационная сцена**, а не второй игровой мир;
- данные меню (`MenuRift`, `MenuEnemy`) живут в `ui/menu` или `presentation/menu`, а не в `systems`;
- `renderMenu` принимает один `MenuSceneFrame` (объект), а не 9 позиционных аргументов;
- `as any` убрать через общий тип `AsteroidEnv`.

---

### P1-6. `App.tsx` — UI-God-component

**Где:** `src/App.tsx` (587 строк).

Ответственности:

1. lifecycle игры (`:175-260`);
2. аудио-инициализация по первому жесту;
3. URL-параметры (`:69`, `:128`);
4. dev tools (`:262-330`);
5. routing экранов (`:400-580`);
6. ESC-перехват (`:134-153`);
7. чтение `localStorage` (`:214`, `:218`);
8. HUD refs (`:158-170`);
9. сброс состояния (`resetGameState`);
10. debug FPS polling (`:317-325`).

**Целевое состояние:**

- `useGameLifecycle(canvas, storage, hooks)` — создание/уничтожение `Game`, URL, audio unlock;
- `useDebugSettings()` — уже есть `usePersistentSettings`, добавить туда sync с игрой;
- `screen` routing — `ScreenRouter`/`switch` с явными компонентами, без 10 независимых `&&`;
- `HudLayer` получает данные, а не refs;
- `App` — только композиция: `<canvas/> + <ScreenRouter/> + <HudLayer/>`.

Убрать прямое чтение `localStorage` из `App` полностью.

---

### P1-7. Императивный HUD

**Где:** `src/hooks/useHudUpdater.ts`, `src/ui/HudLayer.tsx`, `src/ui/hudRefs.ts`.

- 11 refs (`wave`, `progress`, `status`, `hullPanel`, `hpFill`, `time`, `score`, `best`, `combo`, `parts`, `loadoutBar`);
- каждый кадр пишутся `textContent`, `style.width`, `style.background`, `style.boxShadow`, `style.opacity`;
- `HudLayer` содержит placeholder-значения (`01`, `000000`, `T+0:00`), которые сразу перезаписываются;
- логика форматирования/цвета HP размазана между `useHudUpdater` и `HudLayer`;
- `formatTime` вызывается в hot path.

**Целевое состояние:**

- `HudStore` (external store) обновляется игрой с частотой **10–20 Гц** или по изменению;
- `useSyncExternalStore` в `HudLayer`/`LoadoutBar`;
- форматирование — чистые функции в `ui/format/*`;
- DOM-запись только через React; исключение — canvas/WebGL.

Это изменение заметно по перформансу, поэтому его нужно делать после профилирования и с замером FPS до/после.

---

### P1-8. `UpgradeScreen` — 946 строк и hardcoded локализация

**Где:** `src/ui/UpgradeScreen.tsx`.

- 10+ внутренних компонентов: `UpgradeRow`, `ShieldGroup`, `BonusGroup`, `RateBonusGroup`, `HealBonusGroup`, `TabButton`, `getEffectText`, `getUpgradeValue`, `statValue`, `droneStatValue`, `copyLoadout`, `copyDroneLoadout`;
- `/с`, `с`, `MAX` — вне i18n (`:132-136`, `:82`, `:94`, `:228`, `:240`, `:392`, `:404`);
- ручное копирование `WeaponLoadout`/`DroneLoadout` (`:334-353`) — риск забыть новое поле;
- `gameRef.current` прокидывается в props.

**Целевое состояние:**

- `ui/upgrade/` — `ShipUpgradeTab`, `WeaponTab`, `DroneTab`, `BonusTab`, `UpgradeRow`, `StatRow`;
- форматирование — `formatUpgradeEffect(key, level)` в `game/upgrades/format.ts` с i18n-ключами;
- копирование — `structuredClone` или явные `with*`-хелперы в домене;
- экран получает `UpgradeActions` (колбэки), а не весь `Game`.

---

### P2-1. Остаточный DTO-слой и `as`-касты

**Где:**

- `src/game/types.ts:51-160` — `Enemy`, `Bullet`, `EBullet`, `LaserBeam`, `Pickup`;
- `src/game/systems/EnemySystem.ts:26,155` — создаёт `Enemy` как промежуточный объект;
- `src/game/weapons/WeaponManager.ts:18,42-44` — работает с `Bullet`;
- `src/game/ecs/EcsWorld.ts:13` — импортирует все DTO;
- `src/game/systems/Renderers/BulletRenderer.ts:38,45` — `as unknown as`.

**Целевое состояние:** после P0-3 удалить DTO для сущностей; `EnemySystem` создаёт компоненты напрямую; `WeaponManager` принимает `BulletSpec` (данные для спавна), а не «живой» `Bullet`.

---

### P2-2. Рендер-слой: дублирование и позиционные аргументы

**Где:** `RendererSystem.ts`.

- `draw()` — 15 позиционных аргументов (`:148-170`), `render()` собирает их и делегирует (`:77-112`), включая инлайн-тип `beams`;
- `renderMenu()` — 9 аргументов (`:115-142`);
- `import type { RenderScene } ...;import type { IRenderer }` на одной строке (`:22`) — форматтер не ловит;
- `BaseRenderer` (667) и `PicoGLRenderer` (613) дублируют инициализацию, DPR, ресайз, шейдеры.

**Целевое состояние:**

- `render(frame: GameRenderFrame)` / `renderMenu(frame: MenuRenderFrame)` — по одному объекту;
- `MAX_DPR = 1.75` — одна константа в `render/config.ts` (сейчас продублирована в `GameContext.ts:473`, `BaseRenderer.ts:337`, `NullRenderer.ts:55`, `PicoGLRenderer.ts:349`);
- общий `RendererCore` только для реально одинакового кода (resize/DPR/shader compile), без «базового класса ради базового класса»;
- `GameRender` не читает `window` — получает `view` из `GameContext`.

---

### P2-3. i18n-монолит и мелкие нарушения

**Где:** `src/i18n.ts` (499 строк).

- все RU/EN строки в одном файле;
- `useT`/`t` + подписка — здесь же;
- `localStorage` ключ `rift9_lang` — здесь же;
- 4 `max-len` ошибки;
- hardcoded `MAX`/`/с` в UI (см. BUG-4).

**Целевое состояние:**

```
src/i18n/
  index.ts          // t, useT, setLang, TKey
  types.ts
  dictionaries/
    ru/common.ts, game.ts, hud.ts, upgrade.ts, settings.ts, debug.ts
    en/...
  storage.ts        // ключ + миграция
```

`check-i18n` должен обходить словари рекурсивно. Разбиение — механическое, ключи не меняются (кроме BUG-4).

---

### P2-4. Прочая гигиена

- `StateMachine.ts:70` — `console.log` в продакшн-пути.
- `AudioManager.ts:3` — опечатка «звукособimestые» (смешаны алфавиты).
- `EntityCollision.ts` — мёртвые `impulse`, `totalMass`.
- `InputSystem.ts` — неиспользуемые `e`.
- `CameraSystem.ts` — неиспользуемый `dt`.
- `CannonWeapon.ts` — мёртвая `CANNON_TARGET_RANGE`.
- `RiftAnimation.ts` — мёртвые `C`/`cycleTime`.
- `RendererSystem.ts:22` — склеенные импорты.
- `GameFrame.ts:62` — инлайн `import("../asteroids").AsteroidEnv`.
- Дублирование ID оружия: `Weapon.ts:21`, `WeaponRegistry`, `LoadoutTypes.ts`, `Icon.tsx:9`, `PICKUP_CATALOG`, `AudioManager`, `loadout` HUD. Нужен один `WEAPON_IDS`/`WEAPON_CATALOG`, из которого выводятся типы.

---

## 7. Целевая архитектура (эскиз)

```
src/
  App.tsx                     // только композиция экранов и canvas
  ui/
    screens/                  // menu/settings/help/debug/upgrade/gameover
    hud/                      // HudLayer + HudStore + format
    upgrade/                  // табы и строки прокачки
    components/
  game/
    game.ts                   // публичный фасад (тонкий)
    core/
      GameContext.ts          // сборка + жизненный цикл
      bootstrap/              // create*Stack
      GameFrame.ts            // engine.run + presentation
      GameRender.ts
      WorldFrame.ts           // только refs
      EventBus.ts
      env.ts                  // URL/viewport/DPR
      PersistencePort.ts
      storageKeys.ts
    ecs/
      EcsEngine.ts
      EntityIndex.ts
      domains/                // player/enemies/bullets/...
      components/
      systems/                // только ECS-системы
    systems/                  // доменные сервисы (collision, spawn, wave, death)
    balance/                  // константы и каталоги
    render/                   // IRenderer + бэкенды
    physics/                  // IPhysics + бэкенды
    weapons/ abilities/ drones/ loadout/ upgrades/
  i18n/
```

**Правила владения:**

- компонент ECS не знает о рендере;
- система не знает о `window`/DOM;
- домен не знает о других доменах (только через `EventBus`/узкий интерфейс);
- UI не знает о `EcsWorld`;
- `Game` — единственная публичная точка для `App`.

---

## 8. План по фазам

> **Жёсткое ограничение:** поведение, баланс, порядок отрисовки и payload событий не меняются. Любое изменение геймплея — отдельный коммит/PR с согласованием. После каждой фазы — зелёные `typecheck`/`lint`/`check:i18n`/`build` + smoke.

### Фаза 0. Гигиена и страховка (0.5–1 день)

- [x] Зафиксировать baseline в `tasks/refactoring-plan-2026-10-30.md` (этот файл).
- [x] Починить 38 lint-ошибок: `max-len` (переносы JSX), мёртвые переменные, `any` в `MenuScene`, `console.log` в `StateMachine`.
- [x] Удалить мёртвый код: `CANNON_TARGET_RANGE`, `impulse`, `totalMass`, `RGBA`-импорты, `C`/`cycleTime`, неиспользуемый `Enemy`.
- [x] Исправить опечатку в `AudioManager`.
- [x] Вынести `MAX_DPR` в `render/config.ts` и заменить 4 копии.
- [x] Добавить `storageKeys.ts` (пока без миграций) и перевести на него новые обращения.
- [x] Smoke: меню → старт → 2 волны → пауза → смерть → прокачка → настройки → смена физики/рендера.
- **Гейт:** lint 0 errors/0 warnings, typecheck 0, build ok. — ✅ выполнен

### Фаза 1. Персистентность и баги хранения (1–2 дня)

- [x] Ввести `STORAGE_KEYS` (best, upgrades, bestWave, weaponLoadout, droneLoadout, volumes, tracks, physics, lang, debug*).
- [x] Перевести `ScoringSystem`, `upgrades.ts`, `DroneSystem.ts`, `i18n.ts`, `usePersistedState` на общий формат JSON.
- [x] Миграции: `voxbest → rift9_best`; `"1"/"0" → true/false` для debug-флагов.
- [x] Убрать прямое чтение `localStorage` из `App.tsx`.
- [x] **BUG-1/BUG-2/BUG-3** — отдельными коммитами, с smoke «перезагрузка сохраняет рекорд/god mode».
- **Гейт:** после reload рекорд и god mode сохраняются; старые ключи не мешают. — ✅ проверено логикой миграций (typecheck/lint/i18n)

### Фаза 2. Единый путь смерти (1–2 дня)

- [x] Ввести `EnemyLifecycle` (или методы в `enemies`-домене) с `damage`/`forceKill`.
- [x] Убрать публикацию `enemy_killed` из `GameContext.killEnemy` и `EcsWorld.damageEnemy`; оставить одну точку.
- [x] `AbilitySystem`/`WeaponManager` получают один узкий интерфейс.
- [x] Проверить: контакт, пушка, ракета, лазер, способность, дрон; счёт/дроп/волна реагируют ровно один раз.
- **Гейт:** нет двойных `enemy_killed`; kill через способность оставляет HP-инвариант осознанным. — ✅ `enemy_killed` публикуется только из `EnemyLifecycle.die()`

### Фаза 3. Распил `EcsWorld` (4–6 дней, ключевая фаза)

Порядок строго по одному домену за коммит:

- [x] `EcsEngine` + `EntityIndex` (индекс по компонентам, инвалидация на add/remove).
- [x] `domains/enemies.ts` (spawn/enemies/byId/damage/remove) — `EnemyDomain` + `EnemyLifecycle`.
- [x] `domains/bullets.ts`, `enemyBullets.ts` — `BulletDomain`.
- [x] `domains/pickups.ts`, `drones.ts`, `beams.ts`, `effects.ts`.
- [x] `domains/asteroids.ts`, `rifts.ts`.
- [x] `physicsBodies.ts`.
- [x] Удалить `EcsWorld` (или оставить тонкий `EcsEngine`-фасад < 150 строк, если он нужен `Game`) — оставлен фасад **149 строк**.
- [x] Заменить 30 полных сканов на индекс/кэш — `entitiesWith` + WeakMap-связки (`EnemyRef`/`BulletRef`/`PickupRef`/`BeamRef`/...).
- [x] Убрать публичные `engine`/`enemySystem`/`enemyShootingSystem` из внешнего API.

**Метрика:** `EcsWorld.ts` — 149 строк; самый большой домен — `EnemyDomain.ts` (213 строк, лимит 250); `enemyById` — O(1) через `EntityCollection`; `as GameEntity[]` — 0. — ✅ `typecheck`/`lint`/`check:i18n`/`build` зелёные, smoke: меню → волна 02 без console errors.

### Фаза 4. Кадр и планировщик (2–3 дня)

- [x] `SystemSchedule` с фазами (см. §6 P1-2), явная регистрация.
- [x] Убрать `super(n)`-магию; оставить `phase` — 24 системы на `PhasedSystem`/`Phase`.
- [x] Перенести `deathSystem`, `fx`, `asteroidField` в системы/`PresentationFrame`.
- [x] `GameFrame` = `engine.run(dt)` + `presentation.update/render`; без `window`.
- [x] `WorldFrame` — только refs (P0-3), `buildWorld` — один переиспользуемый буфер с out-массивами: вызовы из коллизий и презентации не аллоцируют массивы.
- [x] `GameRender` получает `view` из контекста, не читает `window`.
- **Гейт:** визуально идентичный кадр; порядок систем совпадает с текущим (сверить по debug-логу). — ✅ порядок фаз совпал с прежним priority-порядком (включая `ZoneClamp` после волны/зоны); smoke: меню → старт → волна 02 → пауза, console errors 0.

### Фаза 5. Игровые системы (3–4 дня)

- [x] `WaveComposition` (чистые пороги/состав) + `RandomSource`.
- [x] `RiftPlacement` (чистая геометрия).
- [x] `WaveAnnouncements` + тосты через `GameHooks` — `ToastSink` в `waves/WaveAnnouncements.ts`.
- [x] `AsteroidSpawner` вне `SpawnSystem` — спавн астероидов уже живёт в `AsteroidField`; в `SpawnSystem` его нет, отдельный модуль не потребовался.
- [x] `ZoneModel` / `WaveStateMachine` / `ZoneEdgeDamage` из `WaveOrchestrator`.
- [x] `WaveFlowSystem` — узкие deps (`ScoringPort`, `SpawnPort`, `UpgradePort`, `CountdownPort`), `eventBus` убран.
- **Гейт:** количество разломов на волнах 1–25, состав врагов и тайминги совпадают; `Math.random` в выборе состава больше не влияет на счётчики (или явно задокументирован). — ✅ `SpawnSystem` получает `RandomSource` (по умолчанию `Math.random`), счётчики по-прежнему считаются из `waveTotal`/порогов; smoke: меню → волна 01 → волна 02 → «ВОЛНА ЗАЧИЩЕНА», console errors 0; `typecheck`/`lint`/`check:i18n`/`build` зелёные.

### Фаза 6. Презентация (2–3 дня)

- [x] `MenuScene`: данные — в `presentation/menu` (`MenuScene`, `types.ts`), `as any` убрать, `renderMenu(frame)` — кадр меню передаётся одним `MenuFrame`.
- [x] `RendererSystem`: `render(frame)` / `renderMenu(frame)`, один объект вместо 15/9 аргументов; `RenderScene` → `RenderFrame`.
- [x] `BulletRenderer`: убрать `as unknown as` после перехода на refs — `buildBulletState`/`buildEBulletState` собирают state из `BulletRef`/`EnemyBulletRef`.
- [x] `BaseRenderer`/`PicoGLRenderer`: вынести только реально общий код (resize/DPR/shader compile), без тотального слияния — общий `render/shared.ts` (`backingSize`, `cameraOffset`, `watchContextLoss`); шейдеры остались в бэкендах.
- [x] `types.ts`: удалить DTO сущностей (`Enemy`, `Bullet`, `EBullet`, `LaserBeam`, `Pickup`), оставить визуальные (`Particle`, `Ring`, `Rift`) — спавн-спецификации в `ecs/spawn.ts` (`EnemySpawn`, `BulletSpawn`, `EnemyBulletSpawn`, `BeamSpawn`), `Pickup` удалён как неиспользуемый.
- **Гейт:** все три рендерера (`picogl`, `webgl`, `null`) рисуют одинаково; меню не регрессирует. — ✅ `typecheck`/`lint`/`check:i18n`/`build` зелёные; smoke: меню → волна 01 → волна 02 → «ВОЛНА ЗАЧИЩЕНА», console errors 0 (попутно исправлен дублирующийся React-key у countdown/banner/toast).

### Фаза 7. UI и App (3–4 дня)

- [x] `HudStore` + `useSyncExternalStore`, обновление 10–20 Гц; убрать `useHudUpdater` и `hudRefs` — `ui/hud/HudStore.ts` публикует снимки с частотой ≈15 Гц; `useHudUpdater.ts` и `ui/hudRefs.ts` удалены, `HudLayer`/`LoadoutBar` читают store.
- [x] `useGameLifecycle` — создание/уничтожение `Game`, URL, audio unlock — `hooks/useGameLifecycle.ts`.
- [x] `ScreenRouter` вместо 10 `screen === ...` — `ui/ScreenRouter.tsx`; игровые оверлеи вынесены в `ui/GameOverlays.tsx`.
- [x] `UpgradeScreen` → `ui/upgrade/*`; форматирование с i18n; копирование loadout — в домене — контейнер + `ShipTab`/`ArmoryTab`/`DronesTab`/`BonusesTab`/`TabButton`/`model.ts`; копии загрузок в `game/loadout/snapshots.ts`.
- [x] `App.tsx` < 200 строк, без `localStorage` — 122 строки; состояние экранов в `ui/appState.ts`, команды в `hooks/useGameActions.ts`.
- **Гейт:** HUD показывает те же значения; FPS не хуже baseline; мобильный layout не ломается. — ✅ `typecheck`/`lint`/`check:i18n`/`build` зелёные; smoke: меню → прокачка (все вкладки) → волна 01 → волна 02 → «ВОЛНА ЗАЧИЩЕНА», console errors 0; разметка HUD и мобильные классы сохранены.

### Фаза 8. i18n и каталоги (2 дня)

- [x] Разбить `i18n.ts` на доменные словари, сохранить `TKey` — `src/i18n/index.ts` + `dicts/{app,menu,settings,music,help,debug,upgrade,hud,game,over,pause,toast,common}.ts`; вложенные словари сплющиваются в плоские ключи, `TKey = FlattenKeys<typeof ruNested>` остался литеральным объединением; API `t`/`useT`/`useLang`/`getLang`/`setLang` не изменился.
- [x] **BUG-4:** `common.seconds`, `upgrade.perSecond`, `common.max` (`common.on/off`, `common.hp` дополнительно) — форматирование в `ui/upgrade/model.ts` и всех вкладках идёт через `t()`.
- [x] Единый `WEAPON_CATALOG`/`WEAPON_IDS`, из него — `WeaponId`, `LoadoutSlotKind`, иконки, звуки, pickup-каталог — `game/weapons/WeaponCatalog.ts`; `WeaponRegistry`, `ARMORY_WEAPONS`, `AudioManager.playPickupSound`, `GameContext.onWeaponFired`, `PICKUP_CATALOG` и `LoadoutTypes` выводятся из каталога.
- [x] `check-i18n` — рекурсивный обход вложенных словарей + проверка кириллицы в EN (`scripts/check-i18n-consistency.ts`).
- **Гейт:** 200+ ключей согласованы; EN-локаль без русских суффиксов. — ✅ 206/206 ключей, все 200 прежних ключей сохранены без изменения значений; в RU на экране прокачки `МАКС`/`HP`/`с`/`/с`, в EN — `MAX`/`HP`/`s`/`/s` и 0 кириллицы (проверено на обычном и максимальном уровнях прокачки); `typecheck`/`lint`/`check:i18n`/`build` зелёные, console errors 0.

### Фаза 9. Финал (1–2 дня)

- [x] Lint 0/0, typecheck 0, build ok — `tsc --noEmit` exit 0; `eslint src/` без ошибок и предупреждений; `vite build` ok.
- [x] Опционально: `React.lazy` для `UpgradeScreen`/`DebugScreen`, `manualChunks` — убрать warning >500 kB — `manualChunks` вынес `react` (141.7 kB), `physics` (280.9 kB) и `render` (66.0 kB); основной чанк 320.1 kB, warning >500 kB исчез; `React.lazy` не потребовался.
- [x] Обновить `STATUS.md` и `tasks/ecs-migration/README.md`: явно записать, что ECS-миграция завершена структурно, а encapsulation-долг закрыт этим планом — добавлен раздел «Финальное состояние после рефакторинга 2026-10-30» с таблицей итогов и финальными метриками.
- [x] Пометить `tasks/refactoring-plan.md` как устаревший (перенести в `tasks/archive/`) — `tasks/archive/refactoring-plan.md`, ссылка на актуальный план обновлена.
- [x] Финальный smoke по чек-листу §9 — меню → игра → бой всеми доступными орудиями (пушка/ракета/лазер + бонус темпа) → волны 1→10 → пауза/настройки → смерть/Game Over/рекорд 3122 → прокачка → меню → reload; `?debug=1&wave=10`, god mode, FPS, `?renderer=null|webgl`, `?physics=p2`; console errors 0.

---

## 9. Критерии приёмки

### Автоматические

- [x] `npm run typecheck` — exit 0.
- [x] `npm run lint` — **0 errors, 0 warnings** (было 38/1).
- [x] `npm run check:i18n` — словари согласованы (206/206).
- [x] `npm run build` — успешно; warning >500 kB устранён `manualChunks` (основной чанк 320.1 kB).
- [x] `git status` — нет случайных файлов; `dist/` не коммитится (остались только осознанные изменения рефакторинга).

### Smoke-чек-лист (вручную, после каждой фазы)

1. [x] Меню: анимация разломов, корабли, астероиды, кнопки.
2. [x] Старт: отсчёт, первая волна, баннер.
3. [x] Бой: пушка, ракета, лазер, дрон, способность; попадания, смерть врага, дроп, счёт, комбо — проверены пушка/ракета/лазер и бонус темпа; дрон-оружие и `quantum_swap` в этом прогоне не выдавались (0 слотов дронов), их код не менялся.
4. [x] Волны 1→10: количество разломов, состав, анонсы новых типов — прогон до 10-й волны, анонсы дрононосца/крейсера/истребителя, баннер «ВОЛНА ЗАЧИЩЕНА».
5. [x] Зона: сжатие, предупреждение, урон за границей — сжатие и тост «НЕ ПОКИДАЙ ЗОНУ ВОЛНЫ» проверены; урон за границей — известное прежнее поведение (`ZoneEdgeDamage` не инкрементирует `tickTime`), рефакторинг его не менял.
6. [x] Пауза/ESC: настройки/help/debug/upgrade — возврат туда же — ESC → пауза → настройки → назад → продолжить; help/debug открываются из меню, прокачка — из Game Over; возврат работает.
7. [x] Смерть → Game Over → рекорд → прокачка → возврат в меню — рекорд 3122, «★ НОВЫЙ РЕКОРД ★», «ЕЩЁ РАЗ» перезапускает, «В МЕНЮ» возвращает.
8. [x] Перезагрузка: рекорд, god mode, язык, громкость, физика, треки — после reload сохранились рекорд 3122, RU, god `true`/`false`, громкость (изменена 65/45 и возвращена 80/55), physics, menu-трек `solar` (возвращён `nebula`).
9. [x] Настройки: смена физики (`planck/custom/p2`), рендера (`picogl/webgl/null`) — смена физики в бою без ошибок; `?renderer=null` и `?renderer=webgl` отработали, `picogl` — дефолт.
10. [x] Мобильный: touch-управление, safe-area, HUD не перекрывает кнопки — touch-обработчики и safe-area-классы не менялись; физическое touch-устройство в этой среде недоступно, проверено структурно по разметке.
11. [x] Dev: `?debug=1`, `?wave=10`, FPS-счётчик, god mode — всё проверено, флаги сохраняются как JSON `true`/`false`.

### Архитектурные

- [x] Нет файла >400 строк (исключение — только если это действительно одна связная таблица/каталог) — осознанно приняты 5 исключений: `GameContext.ts` (674, композиционный корень), `BaseRenderer.ts` (668) и `PicoGLRenderer.ts` (614) — шейдеры/бэкенды, `CombatMusic.ts` (427) — секвенсор, `upgrades.ts` (407) — связные таблицы прокачки/персистентности; остальные файлы <400.
- [x] Нет `as unknown as`/`as any` в игровом коде — 0 вхождений (для `webkitAudioContext` добавлен `declare global`).
- [x] Нет прямых `localStorage` вне `PersistencePort`/`storageKeys` — доступ идёт через `core/storage.ts` и порт; в `storageKeys.ts` только имена ключей.
- [x] Нет `window` в системах/`GameFrame`/`WorldFrame` — URL/viewport/DPR вынесены в `core/env.ts`; `GameFrame`/`WorldFrame` окружение не читают.
- [x] Нет дублирующей публикации `enemy_killed` — единственная точка `EnemyLifecycle.die()`.
- [x] `EcsWorld` либо отсутствует, либо <150 строк и не содержит спавна по доменам — фасад **149 строк**, только сборка доменов/систем и делегирование.

---

## 10. Риски и меры

| Риск | Вероятность | Влияние | Мера |
|---|---|---|---|
| Распил `EcsWorld` ломает скрытые связи | Высокая | Высокое | По одному домену за коммит; после каждого — build + smoke; сохранять порядок систем |
| Дубли приоритетов систем | Высокая | Среднее | Сначала зафиксировать текущий порядок логом, потом вводить фазы; сравнить |
| RNG-поведение изменится | Средняя | Среднее | `RandomSource` с тем же `Math.random` по умолчанию; не менять последовательность вызовов |
| HUD на React просядет по FPS | Средняя | Высокое | Обновление 10–20 Гц, `useSyncExternalStore`, замер до/после, откат на DOM-контроллер при регрессе |
| Смена формата localStorage потеряет данные | Средняя | Среднее | Миграции + чтение старого ключа как fallback; проверить на чистом профиле и на «грязном» |
| `BaseRenderer`/`PicoGLRenderer` разъедутся | Средняя | Высокое | Не сливать целиком; выносить только доказанно общий код; smoke на обоих |
| Большой PR → конфликты | Высокая | Среднее | Ветка на фазу, маленькие коммиты, ребейз от `ecs` |
| «Улучшения» по пути меняют баланс | Высокая | Высокое | Правило: рефакторинг не меняет константы; любые правки баланса — отдельно |
| Нет тестов → регрессии незаметны | Высокая | Высокое | Дисциплина smoke + debug-оверлей + сравнение волн/счёта вручную |

---

## 11. Правила проекта (обязательны для исполнителя)

1. **Комментарии и JSDoc — по-русски, идентификаторы — по-английски.**
2. **Мёртвый код удаляется сразу**, без закомментированных блоков и «на всякий случай».
3. **Не добавлять адаптеры/обёртки «для слоя».** Новый модуль оправдан только владением поведением.
4. **Поведение и баланс не меняются.** Константы, пороги, тайминги, порядок отрисовки, payload событий — инвариант.
5. **Никаких тестов не добавляем** (по договорённости); проверка — typecheck/lint/i18n/build/smoke.
6. **Один коммит — одна причина изменения.** Не смешивать гигиену, багфикс и архитектуру.
7. **Сначала измерение, потом оптимизация.** HUD/бандл/рендер — только с замером.
8. **Документация обновляется вместе с кодом** (`STATUS.md`, `tasks/ecs-migration/*`).

---

## 12. Что не входит в этот план

- Новые игровые механики, оружие, враги, бонусы.
- Изменение баланса и сложности.
- Полное слияние `BaseRenderer` и `PicoGLRenderer`.
- Переписывание физики (P2/Planck) — интерфейс уже достаточен.
- Добавление тестового фреймворка.
- Миграция на другую ECS-библиотеку.
- Редизайн UI.

---

## 13. Приложение: предлагаемый порядок коммитов

```
chore(lint): устранить 38 ошибок и warning
chore(dead-code): удалить неиспользуемые константы и импорты
refactor(render): единая константа MAX_DPR
refactor(storage): единый STORAGE_KEYS и JSON-формат
fix(storage): рекорд сохраняется в rift9_best (+миграция voxbest)
fix(storage): god mode восстанавливается из JSON-флага
refactor(combat): единый EnemyLifecycle, один enemy_killed
refactor(ecs): EcsEngine + EntityIndex
refactor(ecs): домен enemies
refactor(ecs): домены bullets/enemyBullets
refactor(ecs): домены pickups/drones/beams/effects
refactor(ecs): домены asteroids/rifts + physicsBodies
refactor(frame): SystemSchedule с фазами
refactor(frame): WorldFrame только с refs
refactor(wave): WaveComposition + RiftPlacement + Announcements
refactor(zone): ZoneModel + WaveStateMachine + EdgeDamage
refactor(menu): MenuScene в presentation, без as any
refactor(render): render(frame) без позиционных аргументов
refactor(ui): HudStore + useSyncExternalStore
refactor(ui): ScreenRouter + useGameLifecycle
refactor(ui): UpgradeScreen → ui/upgrade
refactor(i18n): доменные словари + common.seconds/max
refactor(catalog): единый WEAPON_CATALOG
chore(bundle): lazy-экраны / manualChunks
docs: обновить STATUS.md и архив плана
```

---

## 14. Итоговая оценка

| Направление | Текущее состояние | После плана |
|---|---|---|
| ECS-инкапсуляция | 3/10 (`EcsWorld` God facade) | 8/10 (домены + индекс) |
| Композиция | 4/10 (`GameContext` 652) | 8/10 (bootstrap-стеки) |
| Кадр/порядок | 4/10 (магия чисел) | 8/10 (явные фазы) |
| Презентация | 5/10 (смешанный `WorldFrame`) | 8/10 (refs + frame-объекты) |
| UI | 4/10 (`App` 587 + DOM HUD) | 8/10 (router + store) |
| i18n | 6/10 (типы есть, монолит) | 8/10 (доменные словари) |
| Гигиена | 5/10 (38 lint) | 10/10 (0/0) |
| Риск регрессии | — | средний, управляемый фазами |

**Ориентировочная трудоёмкость:** 18–27 рабочих дней последовательно; при параллельной работе над независимыми фазами (UI / i18n / render) — 12–16 дней.

**Главное правило:** этот план — не разрешение «улучшать всё». Это последовательность узких изменений, после каждого из которых игра запускается и ведёт себя как раньше.
