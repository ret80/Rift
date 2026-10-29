# Статус миграции на чистый ECS

> Сводка фактически выполненного. План этапов — в `README.md` и файлах этапов.

## Этап 0 — Подготовка и карта ✅

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npm run lint` — exit 1: 38 pre-existing `max-len` в `src/ui/*` (TouchControls,
  GameButton, DebugScreen, screens). Не связано с ECS, вне scope.
- Карта зависимостей построена; legacy-типы, события EventBus и `as unknown as`-касты
  описаны в `README.md` (разд. 1–2).

## Этап 1 — Убрать мост «компонент ↔ plain» ✅

Цель достигнута: источники legacy plain-объектов для игровых систем устранены.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/ecs/EcsWorld.ts` | Добавлен типизированный `query<T>(componentClass)`; добавлен `spawnEnemyBullet(...)` (перенесён из `EntityPoolSystem`); `enemies()` больше не кастит `EnemyComponent` в `Enemy` — возвращает `query(EnemyComponent)` (структурно assignable). |
| `src/game/systems/EnemySystem.ts` | Убраны 3 каста `as unknown as Enemy[]` (`context.enemies`, `updateAI`, `findCarrierForDrone`, `applyAvoidance`) — `EnemyComponent[]` напрямую в AI/context. |
| `src/game/systems/DeathSystem.ts` | Зависимость `EntityPoolSystem` → `EcsWorld`; `clearEnemyBullets()/clearBullets()` через `ecs`. |
| `src/game/core/GameContext.ts` | Удалён поле `entityPool` и `EntityPoolSystem` импорт; все `this.entityPool.*` → `this.ecs.*` (spawnPickup, enemyList, bullets, allyDrones, beams, add*). |
| `src/game/core/GameFrame.ts` | `ctx.entityPool.enemyList/...` → `ctx.ecs.enemies()/...` в `buildWorld()` и `buildPhysicsEntities()`. |
| `src/game/core/GameRender.ts` | `ctx.entityPool.enemyList/...` → `ctx.ecs.enemies()/...` в `renderScene()`/`updateHud()`/`renderDebug()`. |
| `src/game/core/GameListeners.ts` | `entityPool.spawnEnemyBullet` → `ecs.spawnEnemyBullet`. |
| `src/game/core/GameStart.ts` | Очистка пулов и `DeathSystem` через `ecs` вместо `entityPool`. |
| `src/game/systems/EntityPoolSystem.ts` | **Удалён.** |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint <изменённые файлы>` — 0 ошибок.
- Smoke (null-рендер): меню → ИГРАТЬ → волна 1 → волна 2, счёт/комбо/таймер растут,
  HUD обновляется. В консоли только `AudioContext` (автоплей) и pre-existing React key
  warnings в `App.tsx:76` — не связаны с миграцией.

## Этап 2 — Чистый спавн снарядов ✅

Цель достигнута: события-«мосты» спавна пуль и WeakMap-«представления» пуль убраны.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/systems/EnemyShootingSystem.ts` | Убрана публикация `enemy_fired`. Введён `SpawnBoltSource` (`EnemyBoltShot`) — система спавнит болт напрямую через колбэк → `EcsWorld.spawnEnemyBullet`. Убран импорт `EventBus`. |
| `src/game/ecs/EcsWorld.ts` | `EnemyShootingSystem` теперь получает `spawnBolt`-колбэк. Удалены `bulletViews`/`enemyBulletViews`/`bulletEntity`/`enemyBulletEntity`. `bullets()`/`enemyBullets()` возвращают свежие снапшоты с `entityId`; `removeBullet`/`removeEnemyBullet` удаляют по `entity.id`; добавлен `markEnemyBulletGrazed`, пишущий `grazed` обратно в `BulletSweepComponent`. |
| `src/game/systems/CollisionSystem.ts` | При грэйзе отмечает снаряд через `ecs.markEnemyBulletGrazed(entityId)` — метка сохраняется между кадрами. |
| `src/game/core/GameListeners.ts` | Удалена подписка `enemy_fired` и импорт `EnemyFiredPayload`. |
| `src/game/core/EventBus.ts` | Удалены `EnemyFiredPayload` и `enemy_fired` из `GameEventMap`. |
| `src/game/types.ts` | `Bullet`/`EBullet` получили `entityId?: number \| string` для удаления по id. |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint <изменённые файлы>` — 0 ошибок.
- Smoke (null-рендер): волна 1 → волна 2, враги стреляют, пули летят, счёт/комбо/таймер
  растут. Консоль чистая (кроме `AudioContext` и pre-existing React key warnings).

Дополнение на аудите: убраны и `particleViews`/`ringViews` (частицы/кольца). `particles()`/
`rings()` отдают read-only снапшот (DTO на лету) из компонентов; `removeParticle`/`removeRing`
не использовались снаружи и удалены. `typecheck`/`build`/`eslint` по затронутым файлам — 0.

## Этап 3 — Игрок на ECS ✅

Цель достигнута: `PlayerSystem` — ECS-система, игрок управляется из `engine.run(dt)`.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/systems/PlayerSystem.ts` | Переписан в `extends System` (`process(dt)`), `priority = -1` (до врагов/пикапов, которые читают позицию). Добавлен `PlayerIntegrateSource` (`() => !physics.integratesPositions`), заменяющий аргумент `integratePosition`. Подписки `player_damaged`/`drone_push_player` сохранены. `onAddedToEngine` строит `Aspect.for(engine).all(PlayerComponent)`. Публичный API (`getPlayerRef/getPosition/getHp/getMaxHp/teleportTo/setMaxHp/resetHp/setSpeedMult/setShield/hit/heal`) сохранён. |
| `src/game/core/GameContext.ts` | `PlayerSystem` конструируется с колбэком `getIntegrate`; зарегистрирован в `ecs.engine.systems.add(...)`. |
| `src/game/core/GameFrame.ts` | Убран ручной `ctx.playerSystem.update(...)` — движение игрока теперь внутри `engine.run(dt)` в `ctx.ecs.update(dt)`. |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint <изменённые файлы>` — 0 ошибок.
- Smoke (null-рендер): меню → ИГРАТЬ → волны 1–3, счёт/комбо/таймер растут; движение игрока
  не ломает кадр. Консоль чистая (кроме `AudioContext` и pre-existing React key warnings).

## Этап 4 — Домены на ECS — группа 1 (таймер/состояние) ✅

Группа 1 этапа 4 выполнена: `Countdown`, `Scoring.combo`, `BonusManager`, `ShieldSystem`
переведены на `extends System` (без аспекта, получают `dt` в `process(dt)`) и
зарегистрированы в `ecs.engine.systems.add(...)`. Ручные `update()` из `GameFrame.step()`
убраны — теперь тикают внутри `engine.run(dt)`.

| Система | priority | Файл |
|---|---|---|
| CountdownSystem | -10 | `src/game/systems/CountdownSystem.ts` |
| ScoringSystem (комбо) | -20 | `src/game/systems/ScoringSystem.ts` |
| BonusManager | -15 | `src/game/loadout/bonuses/BonusManager.ts` |
| ShieldSystem | -12 | `src/game/systems/ShieldSystem.ts` |

В `GameFrame.step()` убраны `ctx.countdownSystem.update`, `ctx.scoringSystem.updateCombo`,
`ctx.bonusManager.update`, `ctx.shieldSystem.update`.

Проверка: `typecheck`/`build`/`lint` зелёные; smoke (волна 1: отсчёт «5», счёт 000260,
комбо ×6.0) — без ошибок.

## Этап 5 — Физика на компонентах — частично ✅

Перенесён источник тел для игрока/врага/пикапа на компоненты; plain-адаптеры удалены.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/ecs/EcsWorld.ts` | Добавлен `physicsBodies(): PhysicsEntity[]` — собирает тела игрока (`PlayerComponent.state`), врагов (`EnemyComponent`, орбитальные = кинематика) и пикапов (`PickupKind`/`Position`/`Radius` = сенсорные кинематические) напрямую из компонентов. Константы `BODY_DENSITY/RESTITUTION/FRICTION` и `commonBodyDef`. |
| `src/game/physics/entities.ts` | Удалены `playerEntity`/`enemyEntity`/`pickupEntity`. Остался только `asteroidEntity` (астероиды — вне ECS). |
| `src/game/physics/index.ts` | Экспортируется только `asteroidEntity`. |
| `src/game/core/GameFrame.ts` | `buildPhysicsEntities()` → `ctx.ecs.physicsBodies()` + `asteroidEntity(a)` для астероидов. |

Стало: игрок/враг/пикап — из компонентов. Остался: `asteroidEntity` (астероиды вне ECS) —
перевод в ECS закрыт в «Не покрыто» этапа 5.

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): волна 1 → 2, «ВОЛНА ЗАЧИЩЕНА», не покидай зону, счёт 000300 ×7.0;
  ошибок нет (только AudioContext).

## Этап 6 — Кадр и композиция — подшаг A (физика + оружие) ✅

`WeaponManager` и `PhysicsSystem` переведены на `extends System` и тикают в `engine.run(dt)`.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/weapons/WeaponManager.ts` | `update(dt)` → `process(dt)`; `extends System`; `priority = 5` (после движения/стрельбы/пуль 0..4, до физики 6). |
| `src/game/physics/PhysicsSystem.ts` | `extends System`; `priority = 6`; добавлен `entitySource: PhysicsEntitySource`. `process(dt)` вызывает `update(dt, source())`. Поле `engine` переименовано в `backend` (конфликт с `System.engine`). |
| `src/game/core/GameContext.ts` | `PhysicsSystem` создаётся с источником тел (из `ecs.physicsBodies()` + астероиды). Зарегистрированы `weaponManager` и `physics` в `engine.systems` (после создания `ecs`). |
| `src/game/core/GameFrame.ts` | Убраны `ctx.weaponManager.update` и `ctx.physics.update`; удалён `buildPhysicsEntities` (физика сама собирает тела). |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): волна 1 → 5, оружие стреляет, враги спавнятся/гибнут, физика
  интегрирует, счёт 001814, комбо ×8.0. Ошибок нет (только AudioContext).

## Этап 6 — Кадр и композиция — подшаг B (коллизии) ✅

`CollisionSystem` переведён на `extends System` и тикает внутри `engine.run(dt)`.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/systems/CollisionSystem.ts` | `extends System`; `priority = 7` (после физики 6, до zone/spawn). Добавлены `WorldSource`/`WaveSource` (колбэки `getWorld`/`getWave`). `process(dt)` вызывает `update(dt, getWorld(), getWave())`. |
| `src/game/core/GameContext.ts` | Добавлен публичный `buildWorld(): WorldFrame` (единое сечение из `ecs.*` + `asteroidField` + zone). `CollisionSystem` конструируется с `() => this.buildWorld()` и `() => this.waveOrchestrator.wave`; зарегистрирован в `engine.systems`. |
| `src/game/core/GameFrame.ts` | Убран `ctx.collisionSystem.update`; `buildWorld()` делегирует в `ctx.buildWorld()`. Убран неиспользуемый импорт `AsteroidWorld`. |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): волна 1 → 3, враги гибнут от пуль (СЧЁТ 000647, «ВОЛНА ЗАЧИЩЕНА»),
  комбо ×7.0. Ошибок нет (только AudioContext + benign vite WS reconnect).

## Этап 6 — Кадр и композиция — подшаг C (зона/кламп) ✅

Весь зонный конвейер переведён на `extends System` внутри `engine.run(dt)`.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/systems/ZoneSystem.ts` | `extends System`; `process(dt)` → `update(dt)`; `priority = 9` (после waveFlow 8). |
| `src/game/systems/WaveFlowSystem.ts` | `extends System`; `process(dt)` → `updateZoneAndWaves(dt)`; `priority = 8` (после коллизий 7). |
| `src/game/ecs/systems/ZoneClampSystem.ts` | `priority` изменён с 4 на `10` (после zoneSystem 9). |
| `src/game/ecs/EcsWorld.ts` | `ZoneClampSystem` зарегистрирован в `engine.systems` (priority 10); комментарий обновлён (физика/коллизии теперь внутри engine.run). `clampEnemiesToZone()` оставлен как публичный метод, но не вызывается из кадра. |
| `src/game/core/GameContext.ts` | `waveFlowSystem` и `zoneSystem` зарегистрированы в `engine.systems`. |
| `src/game/core/GameFrame.ts` | Убраны `updateZoneAndWaves`, `zoneSystem.update`, `clampEnemiesToZone` из `step()`. |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): волна 1 → 2, «ВОЛНА ЗАЧИЩЕНА», «НЕ ПОКИДАЙ ЗОНУ ВОЛНЫ» (зона и
  предупреждение активны), счёт 000300 ×7.0. Ошибок нет (только AudioContext + benign vite WS reconnect).

## Этап 6 — Кадр и композиция — подшаг D (спавн) ✅

`SpawnSystem` переведён на `extends System` и тикает внутри `engine.run(dt)`.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/systems/SpawnSystem.ts` | `extends System`; `process(dt)` → `update(dt, getDeps())`; `priority = 8`; добавлен `SpawnDepsSource` (`getDeps`). |
| `src/game/systems/WaveFlowSystem.ts` | `priority` сдвинут на `9` (спавн 8 идёт раньше). |
| `src/game/systems/ZoneSystem.ts` | `priority` сдвинут на `10` (после waveFlow 9). |
| `src/game/ecs/systems/ZoneClampSystem.ts` | `priority` сдвинут на `11` (финальный кламп). |
| `src/game/core/GameContext.ts` | `SpawnSystem` конструируется с `getDeps: () => this.buildSpawnDeps()`; зарегистрирован в `engine.systems`. Добавлен `buildSpawnDeps()`. |
| `src/game/core/GameFrame.ts` | Убран `ctx.spawnSystem.update` и неиспользуемый `world`. |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): волна 1 → 3, враги спавнятся/зачищаются («ВОЛНА ЗАЧИЩЕНА»),
  счёт 000887 ×4.0, зона активна. Ошибок нет (только AudioContext + benign vite WS reconnect).

## Этап 6 — Кадр и композиция — подшаг E (loadout) ✅

`LoadoutSystem` переведён на `extends System` и тикает внутри `engine.run(dt)`.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/loadout/LoadoutSystem.ts` | `extends System`; `process(dt)` → `update(dt)`; `priority = 12` (после всех игровых систем 0..11). |
| `src/game/core/GameContext.ts` | `loadoutSystem` зарегистрирован в `engine.systems` (priority 12). |
| `src/game/core/GameFrame.ts` | Убран `ctx.loadoutSystem.update` — HUD-слоты пересобираются внутри `engine.run(dt)`. |

`Fx` остаётся презентационным слоем (`fx.update(dt, dt)` в фазе презентации после
`engine.run`): обновляет только тряску экрана и вызывается и в игровом кадре, и в меню
(`updateMenu`), поэтому не является игровой ECS-системой (план, разд. 6.2).

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): волна 5, HUD «ОРУДИЯ 1 · ДРОНЫ 0/8» (loadout-слоты строятся),
  счёт 000000 → 001493, комбо ×8.0. Ошибок нет (только AudioContext + benign vite WS reconnect).

## Этап 6 — Кадр и композиция — подшаг F (способности + смерть) ✅

`AbilitySystem` переведён на `extends System` и тикает внутри `engine.run(dt)`.
`DeathSystem` осознанно остаётся FSM-утилитой в ветке `dying` (переход в `over`).

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/abilities/AbilitySystem.ts` | `extends System`; `update(dt)` → `process(dt)`; `priority = -8` (до `playerSystem(-1)` и остальных игровых систем; кулдауны/активация по Space — до стрельбы/движения). Публичный API (`grant`/`reset`/`getSlots`) сохранён — вызывается из пикапов/сброса забега и HUD. |
| `src/game/core/GameContext.ts` | `abilitySystem` конструируется с `AbilityWorld` (позиции из `playerSystem.getPlayerRef`, живые враги из `ecs.enemies()`, `killEnemy`/`damageEnemy` через `ecs`); зарегистрирован в `engine.systems` (priority -8). |
| `src/game/core/GameFrame.ts` | Убран `ctx.abilitySystem.update` из `step()`. `deathSystem.update(dt)` оставлен в ветке `dying` — возвращает `boolean`, которым `GameFrame` триггерит `death_anim_done` → `over`. `engine.run(dt)` вызывается только при `!isDead`, поэтому комбат заморожен после смерти. |

`DeathSystem` не перенесён в `engine.run` сознательно: он должен выполниться именно в
состоянии `dying` (когда `engine.run` уже не вызывается), а его возвращаемое значение —
признак завершения анимации смерти. Перенос в `engine.run` сломал бы переход `dying→over`.

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 ошибок.
- Smoke (null-рендер): меню → ИГРАТЬ → отсчёт «5» → волна 06, активация способности (Space)
  не роняет кадр, счёт растёт (001604 ×8.0), HUD «ОРУДИЯ 1 · ДРОНЫ 0/8». Ошибок в консоли нет
  (только AudioContext + benign vite WS reconnect).

## Этап 7 — Чистка и приёмка — выполнено (с зафиксированными исключениями) ✅

Убраны последние обратные касты; греп-проверки «чистого ECS» пройдены.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/systems/Renderers/EnemyRenderer.ts` | Убран каст `as unknown as EnemyRenderState[]`; `buildEnemyState(enemies: EnemyRenderState[]): EnemyRenderState[]` — read-only проекция компонентов без моста. |
| `src/game/systems/Renderers/PickupRenderer.ts` | Убран каст `as unknown as PickupRenderState[]` — сигнатура `buildPickupState(pickups: PickupRenderState[])`. |
| `src/game/systems/RendererSystem.ts` | `buildPickupState(pickups)` без тройного каста `as never[] as ...`. |
| `src/game/systems/EnemyShootingSystem.ts` | Поправлен устаревший комментарий про `enemy_fired` (события-«моста» нет). |
| `src/game/core/GameFrame.ts` | Обновлены комментарии: полный порядок приоритетов `engine.run(dt)`; уточнено, что spawn/zone/loadout/fx — презентация после апдейта. |

### Греп-проверки (7.2)

- `as unknown as Enemy` → **пусто**.
- `entityPool` → **пусто**.
- `enemy_fired` → только комментарии (поправлены); события-«моста» нет.
- `PlayerSystem` → только ECS-`extends System` (императивного дубликата нет).
- `GameFrame.step()` `.update(dt` → только `ecs.update(dt)`, `deathSystem.update(dt)` (dying),
  `fx.update` (презентация), `asteroidField.update` (путь B). Ручных `ctx.<чистая-система>.update` нет.

### Осознанно оставлено

- `src/game/types.ts` — `Enemy`/`Bullet`/`EBullet`/`Pickup`/`AllyDrone`/`LaserBeam` остаются
  как **read-only структурные проекции** компонентов (единственный источник правды — компоненты).
- `getPlayerRef` — read-only query-аксессор позиции игрока из `PlayerComponent` (не legacy-мост).

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npm run lint` — exit 1: 39 **предсуществующих** ошибок (max-len/no-unused-vars/any) в файлах
  вне scope этапа 7 (`CameraSystem`, `MenuScene`, `i18n`, `src/ui/*` и др.); мои правки новых
  не добавили (единственный hit `RendererSystem.ts:27` — 145 симв., в HEAD идентичен).
- Smoke (null-рендер): меню → ИГРАТЬ → волна 07 → бой (счёт ×6.0, «НЕ ПОКИДАЙ ЗОНУ») →
  смерть → «СИГНАЛ ПОТЕРЯН» (СЧЁТ 1245, 27 целей) → «ЕЩЁ РАЗ» → рестарт на отсчёте «5».
  Ошибок в консоли нет (только AudioContext + benign vite WS reconnect на порту 3000).

## Этап 8 — Астероиды на ECS (путь B) ✅

Устранён последний plain-мост `physics/entities.ts` (`asteroidEntity`); астероиды переведены
на ECS-компоненты. Поведение пояса не изменилось.

### Изменённые файлы

| Файл | Что сделано |
|---|---|
| `src/game/ecs/components/AsteroidComponent.ts` | Новый компонент данных астероида (позиция/скорость/радиус/форма `verts`/угол/спин/здоровье/масса). Поле `key` — идентичность в поясе. |
| `src/game/ecs/EcsWorld.ts` | Добавлены `spawnAsteroid()`/`asteroids()`/`asteroidByKey()`/`removeAsteroidByKey()`/`clearAsteroids()`. `physicsBodies()` строит астероидные тела напрямую из `AsteroidComponent`. |
| `src/game/asteroids.ts` | `asteroidList` стал getter `ecs.asteroids()`; генерация чанков/осколков через `ecs.spawnAsteroid`; culling/удаление через `removeAsteroidByKey`; `reset()`/`hardReset()` → `clearAsteroids()`; добавлен `spawn(state)` для меню. |
| `src/game/physics/entities.ts` | **Удалён.** |
| `src/game/physics/index.ts` | Убран экспорт `asteroidEntity`. |
| `src/game/core/GameContext.ts` | Источник тел кадра → `() => this.ecs.physicsBodies()`; `zoneSystem.getAsteroids`/`buildWorld().asteroids` читают `ecs.asteroids()`; в `AsteroidField`-хуки передан `ecs`. |
| `src/game/core/GameStart.ts` | Убрано ручное очищение `asteroidList.length = 0` (getter) — пояс чистится в `hardReset()`. |
| `src/game/systems/MenuScene.ts` | `ensureMenuAsteroids` → `asteroidField.spawn({...})` вместо `asteroidList.push(plain)`. |
| `src/game/systems/CollisionSystem.ts` / `BulletCollision.ts` | Работают с `AsteroidComponent[]` (массив `world.asteroids`). |

### Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 новых ошибок (MenuScene: 3 pre-existing lint-ошибки
  не тронуты: `Enemy` unused, `as any`, max-len — в HEAD идентичны).
- Smoke (null-рендер): меню → ИГРАТЬ → волна 07 → бой (счёт 000548 ×3.0, 11 целей) →
  смерть → «СИГНАЛ ПОТЕРЯН» → «ЕЩЁ РАЗ» → перезапуск на отсчёте «5». Ошибок в консоли нет
  (только AudioContext + benign vite WS reconnect на порту 3000).

## Осталось вне ECS-миграции

- `npm run check:i18n` и перепроверка обоих физических движков/рендеров — финальная приёмка.
- 39 pre-existing lint-ошибок (max-len/no-unused-vars/any) — вне scope ECS-миграции.

## Ещё не покрыто (в рамках этапа 1)

- Обратный каст в презентации `EnemyRenderer.buildEnemyState`
  (`as unknown as EnemyRenderState`) — **устранён на этапе 7** (снапшот из компонентов).
- `EcsWorld.query()` пока используется как вспомогательный запрос; полноценный переход
  `CollisionSystem`/`SpawnSystem`/`ZoneSystem` на компонентные запросы — часть доменной модели.