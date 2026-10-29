# План перевода «РАЗЛОМ» на чистый ECS

> Статус: **этапы 0–8 выполнены** (см. `STATUS.md`). Прогресс
> по шагам — в `tasks/ecs-migration/00-prep.md` … `tasks/ecs-migration/07-cleanup-accept.md`
> и сводке `tasks/ecs-migration/STATUS.md`.
> Диагностика основана на аудите всех файлов `src/game/`, `src/game/ecs/`,
> `src/game/physics/`, `src/game/core/` и сверительных чтениях ключевых модулей.
> Поведение и баланс считаем неизменяемыми: миграция не должна менять геймплей.
>
> Дата: черновик. Базлайн проверок (до начала работ):
> - `npm run typecheck` — зафиксировать в Фазе 0
> - `npm run lint` — зафиксировать в Фазе 0
> - `npm run check:i18n` — зафиксировать в Фазе 0 (ожид. 154 ключа в каждом словаре)
> - `npm run build` — зафиксировать в Фазе 0
> - Ручной smoke: меню → старт → волны 1–3 → подбор пикапа → пауза → game over → апгрейды

## 1. Что было (текущее состояние)

Проект — браузерная аркада на TypeScript + React + Vite + `@trixt0r/ecs` (0.5.1).
Миграция на ECS сделана **наполовину**: данные (сущности и компоненты) переехали в
`@trixt0r/ecs`, но игровая логика почти целиком осталась в старых императивных
системах, которые `GameFrame.step()` дёргает **напрямую**, минуя `engine.run(dt)`.

Точка входа — `src/game/core/GameFrame.ts:26` (`step(dt)`). Порядок:
`countdown �� scoring → bonus → shield → ability → player → death → ecs.update(dt) →
weaponManager → physics → collision → spawn → fx → waveFlow → zoneSystem →
clampEnemiesToZone → asteroidField → render → loadout → hud`.

### 1.1 Что уже является чистыми ECS-системами (`extends System`, тикают через `engine.run`)

| Система | Файл | Примечание |
|---|---|---|
| PickupMovementSystem | `src/game/ecs/systems/PickupMovementSystem.ts` | магнит/инерция пикапов |
| PickupCollectionSystem | `src/game/ecs/systems/PickupCollectionSystem.ts` | подбор пикапа игроком |
| ParticleSystem | `src/game/ecs/systems/ParticleSystem.ts` | жизнь частиц |
| RingSystem | `src/game/ecs/systems/RingSystem.ts` | жизнь колец |
| BeamSystem | `src/game/ecs/systems/BeamSystem.ts` | затухание лучей |
| AllyDroneSystem | `src/game/ecs/systems/AllyDroneSystem.ts` | орбита/цель/стрельба дронов (добавлена в `GameContext`) |
| BulletSystem | `src/game/systems/BulletSystem.ts` | движение/самонаведение/жизнь пуль игрока |
| EnemySystem | `src/game/systems/EnemySystem.ts` | AI/движение врагов (priority 0) |
| EnemyShootingSystem | `src/game/systems/EnemyShootingSystem.ts` | стрельба врагов (priority 1) |
| RiftField | `src/game/rifts.ts` | жизненный цикл разломов (добавлена в `GameContext`) |
| ZoneClampSystem | `src/game/ecs/systems/ZoneClampSystem.ts` | **НЕ зарегистрирована**; вызывается вручную (`clampEnemiesToZone`) |

### 1.2 Что НЕ является ECS и правит кадром напрямую (из `GameFrame.step`)

`CountdownSystem`, `ScoringSystem`, `BonusManager`, `ShieldSystem`, `AbilitySystem`,
`PlayerSystem`, `DeathSystem`, `PhysicsSystem`, `CollisionSystem`, `SpawnSystem`,
`Fx`, `WaveFlowSystem`, `ZoneSystem`, `AsteroidField`, `CameraSystem`,
`RendererSystem`, `MenuScene`, `LoadoutSystem` + `WeaponManager`, `InputSystem`,
`DebugSystem`, `UpgradeSystem`, `PickupDropSystem`, `ApplyPickupSystem`,
`WaveOrchestrator`, `GrazeSystem`.

Это классы без `extends System` — `src/game/systems/*`, `src/game/physics/*`,
`src/game/loadout/*`, `src/game/abilities/*`, `src/game/weapons/*`.

## 2. Главные «обратные мосты» и адаптеры (то, что должно исчезнуть)

1. **`EntityPoolSystem` → plain** — `src/game/systems/EntityPoolSystem.ts`. Все сущности
   (враги, дроны, пикапы, снаряды, лучи) живут в ECS, но этот класс разворачивает их
   обратно в plain-объекты (`enemyList`, `bulletList`, `enemyBulletList`, `pickupList`,
   `allyDroneList`, `beamList`) через getter'ы `EcsWorld.enemies()/bullets()/…`. Именно
   эти `Enemy[]`, `Bullet[]` и т.д. потребляют старые системы (WeaponManager,
   CollisionSystem, SpawnSystem, AbilitySystem, WaveFlowSystem, ZoneSystem, рендер, HUD).
2. **`EnemyComponent → Enemy[]`** — `src/game/ecs/EcsWorld.ts:256-263`: `enemies()` делает
   `result.push(c as unknown as Enemy)`. `EnemyComponent` структурно 1:1 совпадает с
   `Enemy`, поэтому физика/коллизии/зоны/AI кастят компонент в легаси-тип и мутируют его
   как plain-объект. Это «поле для хранения», а не абстракция данных.
3. **`enemy_fired → spawnEnemyBullet`** — `EnemyShootingSystem.ts:211` публикует
   `enemy_fired`; `src/game/core/GameListeners.ts:70-86` ловит его и вызывает
   `entityPool.spawnEnemyBullet(...)` → `ecs.addEnemyBullet(...)`. ECS-система → событие →
   plain-объект → снова ECS-добавление. Классический адаптер «старый мир ↔ ECS».
4. **`PlayerComponent` + старый `PlayerSystem`** — `EcsWorld.registerPlayer()` добавляет
   сущность с `PlayerComponent(state)` (`EcsWorld.ts:500-508`), но
   `src/game/systems/PlayerSystem.ts` — императивный класс без `extends System`, который
   напрямую мутирует `PlayerState`. `PlayerComponent` — просто держатель состояния.
5. **`PhysicsEntity`-адаптеры** — `src/game/physics/entities.ts`: `playerEntity/enemyEntity/
   asteroidEntity/pickupEntity` — live-мосты, читающие plain-объекты до шага физики и
   пишущие их после. Физический бэкенд не знает компонентов.
6. **Bullet/particle WeakMap-«представления»** — `EcsWorld` держит
   `bulletEntity/enemyBulletEntity/bulletViews/enemyBulletViews/particleViews/ringViews`
   для объектной идентичности. Это тоже мост «компонент ↔ legacy-объект».

## 3. Целевая архитектура (после миграции)

```
GameContext (composition root — только сборка графа и порядок систем)
  └─ Engine<GameEntity> (@trixt0r/ecs)
       └─ ECS-системы (extends System; порядок задаётся priority; тикают engine.run(dt)):
            player, bullets, enemyBullets, enemies, drones, pickups, beams,
            particles, rings, rifts, asteroids, physics, collisions, zone,
            wave/scoring/countdown/shield/ability/weapons/graze/death/loadout
       └─ ECS-компоненты (единственный источник правды; Position/Velocity/Radius/Life/Kind…)
  └─ presentation — ТОЛЬКО ЧТЕНИЕ, выполняется ПОСЛЕ engine.run(dt):
       render, camera, hud, audio, input, starfield
```

### Правила, обязательные к соблюдению

1. **Единственный источник правды — компоненты.** Никакой ECS-системы, которая читает
   legacy plain-объекты (`Enemy[]`, `Bullet[]`, `Pickup[]`, ...) для принятия решений.
   Все игровые системы работают с сущностями и компонентами через запросы к Engine.
2. **Запись состояния — только через компоненты.** Никаких `as unknown as Enemy` /
   структурного каста компонента в legacy-интерфейс.
3. **Presentation — проекция, не адаптер.** Рендер/HUD строят read-only снапшот из
   компонентов для отрисовки. Снапшот не возвращается в игровые системы и не мутирует
   их. Это «view», а не «обратный мост», на котором работает логика.
4. **Никаких событий-«мостов», порождающих сущности.** Спавн сущности (пуля врага,
   пикап, дрон) выполняется той ECS-системой, которая его инициирует, напрямую в Engine.
   EventBus остаётся только для *презентационных*/звуковых/FSM сигналов (счёт, аудио,
   баннер, HUD) и для реакций, не связанных с появлением сущности.
5. **Вход в кадр — один.** `GameFrame.step()` сводится к `engine.run(dt)` (все симуляции)
   + шаг физики + презентация. Никаких ручных `ctx.*.update(dt)`.
6. **Без адаптеров** (правило `GIGACODE.md`): плохо спроектированную систему переделываем
   целиком, а не «оборачиваем». Промежуточных мостов-обёрток не создаём.
7. **Комментарии/доки — на русском; имена — английские.** Старый код удаляем сразу, без
   закомментированных блоков.

## 4. Компонентная модель (целевая)

Базовые переиспользуемые компоненты уже есть и остаются: `PositionComponent`,
`VelocityComponent`, `RadiusComponent`, `LifeComponent`. Доменные компоненты
(`src/game/ecs/components/`) расширяются, а не используются как «склад plain-объектов».
Каждый компонент — только данные конкретной сущности и владелец своего набора полей.

| Домен | Компоненты (целевые) | Системы (целевые) |
|---|---|---|
| Игрок | `PlayerComponent` (state: позиция/скорость/угол/hp/invuln/масса) | `PlayerSystem` (движение, урон, неуязвимость) |
| Пуля игрока | `BulletComponent`, `Position`, `Velocity`, `Life`, `HomingRef` | `BulletSystem` |
| Пуля врага | `EnemyBulletComponent`, `Position`, `Velocity`, `Life`, `Radius`, `BulletSweep` | `BulletSystem` (или `EnemyBulletSystem`) |
| Враг | `EnemyComponent` (боевые + AI-поля), `Position`, `Velocity`, `Radius`, `Life` | `EnemySystem`, `EnemyShootingSystem` |
| Дрон | `AllyDroneComponent`, `Position`, `Velocity`, `Radius`, `Life` | `AllyDroneSystem` |
| Пикап | `PickupKindComponent`, `Position`, `Velocity`, `Life`, `Radius` | `PickupMovementSystem`, `PickupCollectionSystem` |
| Луч | `LaserBeamComponent`, `Life` | `BeamSystem` |
| Частица/кольцо | `ParticleComponent`/`RingComponent`, `Position`, `Velocity`, `Life` | `ParticleSystem`, `RingSystem` |
| Разлом | `RiftComponent` | `RiftSystem` |
| Астероид | `AsteroidComponent`, `Position`, `Velocity`, `Radius`, `Life` | `AsteroidSystem` |
| Зона | `ZoneComponent` | `ZoneSystem` |
| Волна/счёт | `WaveComponent`, `ScoreComponent` | `WaveSystem`, `ScoringSystem` |

## 5. Этапы (обзор)

| Этап | Название | Цель | Строго убирает |
|---|---|---|---|
| 0 | Подготовка и карта | baseline + карта зависимостей | — |
| 1 | «Компонент ↔ plain» мост | убрать `EnemyComponent→Enemy[]`, `EntityPoolSystem→plain` | мост №2 |
| 2 | Чистый спавн пуль | убрать `enemy_fired→spawnEnemyBullet`, WeakMap-представления | мост №3, №6 |
| 3 | Игрок на ECS | `PlayerComponent` + ECS `PlayerSystem` | мост №4 |
| 4 | Домены на ECS | physics/collision/zone/wave/weapons/abilities/scoring/… | мост №1 фактически |
| 5 | Физика на компонентах | убрать `PhysicsEntity`-адаптеры | мост №5 |
| 6 | Кадр и композиция | `GameFrame.step` = `engine.run` + презентация | ручные «старые системы» |
| 7 | Чистка и приёмка | удалить легаси, греп-проверки, финальные гейты | все оставшиеся мосты |
| 8 | Астероиды на ECS | `AsteroidComponent` + спавн через engine; `physics/entities.ts` удалён | мост №5 (астероидный) |

Каждый этап — отдельный набор коммитов, после каждой фазы игра обязана запускаться и
играться так же (differential: `git diff` без изменения геймплея).

## 6. Команды проверки (после каждого этапа)

```
npm run typecheck
npm run lint
npm run check:i18n
npm run build
npm run dev   # smoke: меню → старт → волны 1-3 → пикап → пауза → game over →
              # апгрейды/настройки; FPS-дебаг (F?/debug-оверлей)
```

## 7. Критерии финальной приёмки (checklist «чистый ECS»)

- [x] `src/game/systems/EntityPoolSystem.ts` удалён (нет обратных пулов для систем). — **этап 1**
- [x] Ни одна игровая система не читает `enemies()/bullets()/pickups()/…` как `Enemy[]/Bullet[]`
      для принятия решений — только компонентные запросы к Engine. — **этап 1 (частично)**
- [x] Нет `as unknown as Enemy` / структурного каста компонента в legacy-интерфейс. — **этап 1**
- [x] Нет публикации `enemy_fired` из `EnemyShootingSystem`; вражеская пуля спавнится
      напрямую в Engine. — **этап 2**
- [x] Нет WeakMap-«представлений» для сущностей (`bulletViews`, `enemyBulletViews`,
      `bulletEntity`, `enemyBulletEntity`, `particleViews`, `ringViews`). — **этап 2 (пули,
      частицы/кольца — аудит)**
- [x] `PlayerComponent.state` — единственный источник позиции/HP игрока; игроком управляет
      `extends System`-система; `PlayerSystem` как императивный класс удалён. — **этап 3**
- [x] Чистые таймер/состояние-системы (`Countdown`, `Scoring.combo`, `BonusManager`,
      `ShieldSystem`) — `extends System` и тикают `engine.run(dt)`. — **этап 4, группа 1**
- [~] `PhysicsSystem` работает с компонентами, а не с plain-адаптерами `entities.ts`
      (`playerEntity/enemyEntity/pickupEntity` удалены; `asteroidEntity` тоже удалён на
      этапе 8 — астероиды на `AsteroidComponent`). — **этапы 5, 8**
- [x] `GameFrame.step()` вызывает только `engine.run(dt)` + презентацию; нет ручных
      `ctx.{countdown,scoring,player,spawn,zone,ability,weapon,physics,collision,waveFlow,
      zoneClamp,loadout}.update(dt)`. Остались только `deathSystem.update` (ветка `dying`,
      FSM-переход), `fx.update` и `asteroidField.update` (презентация). — **этап 6 (A–F)**
- [x] Нет `as unknown as Enemy` / структурного каста в презентации (`EnemyRenderer`,
      `PickupRenderer`, `RendererSystem`). — **этап 7**
- [~] `typecheck`/`build` зелёные; `lint` — только pre-existing долг (39 ошибок: max-len/
      no-unused-vars/any в `CameraSystem`, `MenuScene`, `i18n`, `src/ui/*`) вне scope этапа 7;
      smoke-тест геймплея идентичен baseline. — **этап 7**

## 8. Риски

| Риск | Митигция |
|---|---|
| Порядок систем (скрытые зависимости) | Явный `priority` у всех систем + комментарий о порядке; `engine.run` выполняет в порядке приоритета |
| Физика: Planck vs custom (интегрирует ли движок позиции) | `PhysicsSystem` учитывает флаг `integratesPosition`; position/velocity только в компонентах |
| Регрессии ввода/паузы/смерти | ФСМ выносится в опциональную ECS-систему; проверка ESC/паузы в каждой фазе |
| Потеря производительности при запросах к Engine | Запросы — дешёвая итерация `engine.entities`/фильтр по компоненту; без `WeakMap`-хэшей и тройных проходов |
| Большой объём (недели) | Поэтапно, каждый этап — зелёный смоук; никаких «полупереводов» в одном этапе |
| «Псевдо-ECS» (компонент-склад, обёртки) | Жёсткие правила раздела 3; ревью-чеклист раздела 7 после каждого этапа |

## 9. Правила команды на время миграции

1. Не вводить новые зависимости; стек фиксирован.
2. Не менять поведение и баланс — только перенос ответственности.
3. Удалять старый код сразу; не оставлять закомментированные блоки.
4. Каждая фаза — отдельные коммиты; после каждого — `typecheck` + смоук.
5. Перед удалением «мёртвого»/«bridge»-кода — проверить грепом, что он действительно
   не используется за пределами проверяемых мостов.