# План SOLID-рефакторинга проекта «РАЗЛОМ»

> ⚠️ **Документ устарел (2026-10-22).** Описанное ниже состояние (`game.ts` — God class на
> 1025 строк, 154 ключа i18n) больше не соответствует коду. Актуальный аудит и план:
> [`tasks/refactoring-plan-2026-10-30.md`](../refactoring-plan-2026-10-30.md). Оставлен как история.

> Статус: черновик предложен для обсуждения. Диагностика (раздел 2) основана на аудите всех
> модулей `src/` и сверительных чтениях ключевых файлов. Поведение и баланс в рамках
> рефакторинга считаем неизменяемыми: рефакторинг не должен менять геймплей.
>
> Дата: 2026-10-22. Базлайн проверок (до рефакторинга):
> - `npm run typecheck` — OK
> - `npm run check:i18n` — OK, 154 ключа в каждом словаре
> - `npm run lint` — 51 ошибка, 2 предупреждения (baseline; цель — 0)
> - `npm run build` — не запускался в рамках аудита (проверить в начале Фазы 0)

## 1. Что было

Проект — браузерная аркада на TypeScript + React + Vite, ~13 800 строк `src/`.
Архитектура уже прошла путь систематизации: есть `EventBus`, FSM, реестры оружия/бонусов,
системы, отдельные рендереры, `balance/*`, `ai/strategies`. Однако границы реализованы
«наполовину»: типизация есть в сигнатурах и обходится в телах (`as any`, `as unknown as`,
`Parameters<...>[n]`), а композиция осталась в одном God-классе `Game` (1025 строк).

Сводка главных дефектов:

| # | Проблема | Где | Серьёзность |
|---|---|---|---|
| 1 | `Game` — God-класс: 30 полей зависимостей, конструктор ~280 строк, ручной порядок 20 систем, 17 позиционных аргументов рендера | `src/game/game.ts` | высокая |
| 2 | God-системы: `CollisionSystem` (8+ подсистем в одном `update`), `SpawnSystem`, `WaveOrchestrator`, `EnemySystem`, `MenuScene` | `src/game/systems/*` | высокая |
| 3 | «Каталог» фич размазан: id оружия/врагов/пикапов дублируются в 5–7 файлах; добавление фичи = N правок | `weapons`, `ApplyPickupSystem`, `AudioManager`, `PickupRenderer`, `Icon.tsx`, `game.ts` | высокая |
| 4 | `Enemy` — монолит из 45 полей для всех видов врагов (ISP/OCP) | `src/game/types.ts` | высокая |
| 5 | Прямые зависимости низкоуровневых модулей от presentation-слоя и от «корня» `balance.ts` (DIP) | `types.ts`, `math.ts` ← `render.ts`; `asteroids/rifts/starfield` ← `balance` | высокая |
| 6 | Три копии машины разломов (`rifts.ts`, `RiftAnimation`, `MenuScene`) и расхождения в них | `src/game/rifts.ts`, `Renderers/RiftAnimation.ts`, `systems/MenuScene.ts` | высокая |
| 7 | Несколько путей гибели врага (drop, счёт, событие) — правило «смерть врага» в двух-трёх местах | `CollisionSystem`, `game.ts:985-999`, `ScoringSystem` | высокая |
| 8 | UI-слой: `App.tsx` — God-компонент (~10 ответственностей), императивный HUD-мост на 60 FPS, утечка `setTimeout` | `src/App.tsx`, `ui/hudRefs.ts`, `hooks/useHudUpdater.ts` | высокая |
| 9 | Мёртвый код и «пустые» точки расширения: `onPopup` не вызывается, `wave_cleared` не публикуется, `timeScale`/`countdownClearTimer` мертвы, `ScreenShell` не используется, мёртвые события EventBus | по всему проекту | средняя |
| 10 | Магические числа и скрытый баланс: параметры фич разбросаны между `balance/*`, `weapons/*`, `systems/*`, `strategies/*` | по всему проекту | средняя |
| 11 | Двойная персистентность громкости, `localStorage` в горячем пути (`UpgradeSystem.addParts`) | `audio/VolumePersist.ts`, `App.tsx`, `upgrades.ts` | средняя |
| 12 | Устаревшие задачи/доки: `tasks/arsenal_summary.md` не совпадает с кодом (154 vs 152 ключа, baseline линта) | `tasks/` | низкая |

## 2. Диагностика по принципам SOLID

### S — Single Responsibility

| Файл:строки | Наблюдение |
|---|---|
| `game.ts:94-1025` | Один класс: контейнер DI + игровой цикл + координация волн (`setupEventListeners`, 484-542) + ручной `step()` (544-686) + сборка кадра (`render`, 688-745) + UI-мост + смерть врага (`killEnemy`, 985-999). |
| `game.ts:189-473` | Конструктор ~280 строк: инициализация всех систем, подписки, DI-замыкания, RAF. |
| `game.ts:695-744` | `rendererSystem.render(...)` с **17 позиционными аргументами**; `game.ts:609-629` — `collisionSystem.update(...)` с **9 аргументами** и кастами `Parameters<...>[n]`. |
| `systems/CollisionSystem.ts:55-365` | Один `update()` обрабатывает: пули→враги, перехваты, вражеские пули→игрок/дроны, entity-entity, нити, avoidance дронов, сбор пикапов, урон астероидам. Мутирует чужие массивы (`splice`) и чужие сущности. |
| `systems/SpawnSystem.ts:23-430` | Состав волны + выбор классов + геометрия расстановки разломов + жизненный цикл волны + анонсы тостами + прямые записи в `RiftField` (`:374-376, :398-399, :413-414, :428`). |
| `systems/WaveOrchestrator.ts:61-335` | Владелец зоны + счётчик волн + FSM волны + расширение зоны + урон у края + баннеры/тосты/таймеры. Хуки (`:30-36`) смешивают UI-каналы и геймплей-каналы. |
| `systems/MenuScene.ts:74-288` | Обновляет starfield/астероиды, спавнит астероиды меню напрямую в чужой массив (`ensureMenuAsteroids`, `:229-288`, дублирует `asteroids.ts:61-90`), ведёт FSM разломов, двигает врагов. Свои `MenuRift`/`MenuEnemy` (`:29-50`). |
| `systems/EnemySystem.ts:41-207` | Фабрика монолитного врага из ~40 полей + обход ИИ + замедление нитей + спавн дронов Carrier + avoidance (ещё одна копия в `CarrierStrategy`). |
| `weapons/WeaponManager.ts:46-163` | Хранение экземпляров + тик + ручное/авто наведение + раздача апгрейдов + слоты HUD + счётчики + множители бонусов. |
| `weapons/Weapon.ts:113-146` | Контракт оружия = метаданные + инвентарь + симуляция + откаты + апгрейды + сброс; каждая реализация тянет все роли (no-op'ы в `WeaverWeapon.ts:92-94`). |
| `render.ts:116-466` | WebGL-контекст + компиляция шейдеров + FBO + батчинг линий + постобработка (blur/composite) в одном классе. |
| `App.tsx:108-566` | ~10 ответственностей: роутинг экранов, состояние игры, HUD-подписки, 7 персистентных настроек, жизненный цикл движка, dev-инструменты, оверлеи, перехват клавиш, сброс прогресса. |
| `ui/hudRefs.ts:8-22`, `HudLayer.tsx` | 13 внешних `MutableRefObject` передаются в компонент, который должен владеть ими сам; форма HUD зашита в 3 местах (тип, JSX, `useHudUpdater`). |
| `systems/RendererSystem.ts:59-126` | `render()` — 18 позиционных параметров raw-данных + меню-логика (`:129-279`) внутри «координатора» рендера. |

### O — Open/Closed

| Файл:строки | Наблюдение |
|---|---|
| `weapons/Weapon.ts:19`, `LoadoutTypes.ts:31-45`, `Icon.tsx:188-227`, `ApplyPickupSystem.ts:51-61`, `AudioManager.ts:60-64`, `game.ts:1016-1023` | Список оружия (id, иконка, звук, эффект, слот) продублирован в 5–7 файлах. Новое оружие = правки во всех. |
| `systems/ApplyPickupSystem.ts`, `AudioManager.ts`, `PickupRenderer.ts` | 6+ `switch`/`if` по `PickupKind` — добавление вида пикапа требует изменения всех мест. |
| `WeaponManager.ts:95-97` | `if (weapon.countUpgrade === "guns") ... else if ("drones")` — ветвление по id в менеджере. |
| `Weapon.ts:82-89, 111` | Политика апгрейдов — флаги `usesDamageUpgrade`/`usesSolidUpgrade`/`countUpgrade` + union `WeaponCountUpgrade`: решение принимает `WeaponManager`, а не оружие. |
| `weapons/CannonWeapon.ts:24-38, 95` + `upgrades.ts:263-264` | `CANNON_MAX_BARRELS` применяется в двух местах; `upgrades.ts:9` зависит от конкретного оружия. |
| `weapons/CannonWeapon.ts:34` + `Renderers/PlayerRenderer.ts:10,160` | `CANNON_BARREL_OFFSETS` дублируется между оружием и рендером. |
| `systems/SpawnSystem.ts:151-157` | `riftCountFor` и правила волн в системе, а не в `balance/`. |
| `systems/ZoneSystem.ts:65-174` | Три копии «клэмпа» (`clampPlayer`, `clampEnemies`, `applyZoneConstraints`) с разными эвристиками. |
| `types.ts:50-90` | `Enemy` — 45 полей для всех видов; правка AI-типа затрагивает весь пул. |

### L — Liskov Substitution

| Файл:строки | Наблюдение |
|---|---|
| `weapons/Weapon.ts:127-145` | Контракт требует `reset(ctx)`/`isAvailable(ctx)`/`applyModifiers(mods, ctx)`, а реализации игнорируют аргументы (`CannonWeapon.ts:61`, `MissileWeapon.ts:58,66`). Поверхностная замена: контекст «принимается», но не используется. |
| `weapons/WeaverWeapon.ts:92-94` | `applyModifiers` — no-op: оружие обязано реализовать не свою роль. |
| `ai/strategies/*` | Стратегии не полностью взаимозаменяемы: дроны-орбитали обслуживаются отдельным каналом (`EnemySystem` спавнит их и пропускает обычный путь ИИ); `IEnemyStrategy.draw` объявлен и не используется. |
| `systems/Renderers/*` | Базовый паттерн рендереров разошёлся: часть берёт `buildState` отдельно, часть кастует (`RendererSystem.ts:102` `pickups as any`). |

### I — Interface Segregation

| Файл:строки | Наблюдение |
|---|---|
| `weapons/Weapon.ts:47-64` | `WeaponContext` — мега-контекст «весь мир»: игрок, бонусы, прицел, враги, пули, дроны, нити, `onFired`. Ракете нужны `bullets/player`, дрону — `drones/enemies`, ткачу — `weaves`. |
| `types.ts:50-90` | Один интерфейс `Enemy` для всех видов + `types.ts:8-44` — несвязанные домены в одном файле. |
| `core/EventBus.ts:8-15` | `EnemyKilledPayload`: `scoreValue?` и `score?`, `enemy?: unknown` — два «источника правды» и небезопасное поле. |
| `game.ts:619-628`, `RendererSystem.ts:59-88` | Позиционные сигнатуры: потребитель обязан знать порядок 9–18 аргументов. |
| `systems/WaveOrchestrator.ts:30-36` | Хуки смешивают UI (banner/toast) и геймплей (hitPlayer, shakeScreen, onWaveAdvanced). |

### D — Dependency Inversion

| Файл:строки | Наблюдение |
|---|---|
| `types.ts:4`, `math.ts:3` → `render.ts:104` | Чистые типы/вычисления импортируют `RGBA` из WebGL-рендерера — низкий уровень зависит от presentation-слоя. |
| `asteroids.ts`, `rifts.ts`, `starfield.ts`, `types.ts` → `balance.ts` | Импорт всего барреля вместо собственного контракта/констант. |
| `systems/MenuScene.ts:229-288` | Прямая запись в `asteroidField.asteroidList` вместо API `AsteroidField.makeAst`. |
| `weapons/WeaponManager.ts:17,60` | Импорт `CANNON_TARGET_RANGE` из конкретного `CannonWeapon` и `new Targeting(...)` внутри менеджера. |
| `game.ts:94-180` | `Game` сам создаёт все зависимости (`new AudioManager`, `new Renderer`, `new ...System`) — composition root внутри класса. |
| `audio/VolumePersist.ts` + `App.tsx:117-132` | Громкость хранится в двух местах (`rift9_volumes` и внутренний persist аудио) — расхождение после перезагрузки. |
| `upgrades.ts`, `systems/UpgradeSystem.ts` | Персистентность (`localStorage`) в горячем пути и в «чистых» апгрейдах. |

### Смежные проблемы (не SOLID, но критичные для рефакторинга)

1. **Мёртвый код** (подтверждено чтение/грепом):
   - `game.ts:166,86` + `App.tsx:206-211` — `onPopup`/`ADD_POPUP`: попапы не создаются.
   - `core/EventBus.ts:110` — `wave_cleared` объявлен и подписан, никто не публикует.
   - `game.ts:104,546` — `timeScale` всегда 1; `game.ts:168,672-680` — `countdownClearTimer` никогда не увеличивается.
   - `EventBus.ts` — `player_healed`/`spawn_pickup`/`zone_state_change` с мёртвыми подписчиками/публикациями.
   - `ui/components/ScreenShell.tsx` — нигде не импортируется (мёртвый).
   - `ui/components/ScreenDimmer.tsx` — используется (`App.tsx:523`), НЕ удалять.
   - `ui/Screens.tsx` — реэкспорт-баррель, используется; вопрос — нужен ли баррель.
   - `systems/Renderers/EnemyRenderer.ts:54-56` — `console.log` на каждый ~1% кадров.
   - `ai/strategies/*` — `IEnemyStrategy.draw` не используется; `bonusDuration`, `AbilitySystem.grantForPickup` — не используются.
2. **Порядок систем** зашит в `game.ts:544-686`; скрытые зависимости порядка подписок/апдейтов.
3. **Производительность**: `updateHud()` каждый кадр → ~60 записей в DOM в секунду (`useHudUpdater.ts:23-71`).
4. **Магические числа**: `game.ts:466` (`0.05`), `game.ts:532-534` (`14`, `0.6`), `render.ts:106-107` (`60000`), `render.ts:41-50,247-259` (блюр/DPR), `game.ts:186` (`1.75`), `ZoneSystem`, `EnemySystem:168-207` и т.д.
5. **Типовая эрозия**: `as any`/`as unknown as`/`Parameters<...>[n]` в `game.ts`, `RendererSystem.ts`, рендерерах.
6. **Задачи**: `tasks/arsenal_summary.md` устарел (154 vs 152 ключа, старый baseline линта); `tasks/test_write.md` — заглушка.

## 3. Целевая архитектура

Слои (сверху вниз), зависимости направлены только вниз:

```
ui/         React-экраны, подписки на GameBridge (никаких DOM-манипуляций в обход React)
app/        Composition root: Game (только граф зависимостей + игровой цикл + FSM)
domain/     Чистые типы и правила: entities, weapons, abilities, upgrades, balance, каталоги
systems/    Игровые системы: update(dt, world, events) — зависят от domain и EventBus,
            не знают друг о друге напрямую
infra/      presentation: render, camera, audio, input; persistence
```

Ключевые проектные решения:

1. **`WorldState`/`SceneSnapshot`** — единая явная структура «мир кадра»: `player`, `enemies`,
   `bullets`, `enemyBullets`, `pickups`, `drones`, `weaves`, `asteroids`, `rifts`, `zone`, `camera`,
   `fx`. Системы получают её как параметр, а не 9–18 аргументов.
2. **Каталоги (data-driven)** — один `FeatureCatalog` на домен: id + фабрика + метаданные +
   звук + иконка + политика апгрейдов. Оружие, враги, пикапы, бонусы, способности, разломы.
   Добавление фичи = новый файл + регистрация в одном реестре.
3. **Разделённые контракты** — `Enemy` разбивается по ролям (движение/ИИ/боевые/орбитальные
   данные) с полиморфным диспетчером; `WeaponContext` делится на минимальные порты
   (`WeaponAmmo`, `WeaponTargeting`, `WeaponWorld`).
4. **EventBus** — строго типизированные каналы: `gameplay` и `ui`; один источник правды в payload;
   мёртвые события удаляются. UI получает уведомления через подписку, не через колбэки 60 Гц.
5. **Системы-координаторы** минимизируются: порядок обновлений — явный список зависимостей
   в `Game` (или маленький `SystemPipeline`), а не внутри систем.
6. **Рендер** — `RenderState` (DTO) вместо raw-параметров; `RendererSystem` только собирает DTO,
   `Renderers/*` рисуют.
7. **UI** — `useGameController`, `usePersistentSettings`, `ScreenRouter`; HUD через
   `useSyncExternalStore` по изменению данных, `hudRefs` удаляются.
8. **Персистентность** — один `PersistencePort`, внедрённый в `App`/`Game`; никакого прямого
   `localStorage` в системах.

## 4. Фазы рефакторинга

Порядок выбран «от стабильного контракта к потребителям»: сначала убираем мёртвое и
фиксируем контракты, затем переводим домены на каталоги, затем границы систем, затем ядро и UI.
Каждая фаза — отдельный набор коммитов, после которой игра обязана запускаться и играться так же.

### Фаза 0. Подготовка и безопасная чистка (полдня–1 день)

- [ ] Зафиксировать baseline (typecheck/lint/i18n/build) и создать ветку `refactor/solid`.
- [ ] Составить карту импортов и зависимостей (путь-скрипт или `tsc --noEmit --traceResolution` +
      grep по `new <Class>` и прямым доступам к чужим полям).
- [ ] Инвентарь дублирования: собрать все места, где фигурируют id оружия/врагов/пикапов
      (перечень выше, раздел OCP).
- [ ] Удалить подтверждённый мёртвый код:
      `timeScale`, `countdownClearTimer`, `onPopup`-цепочку (или починить, если попапы нужны —
      в UI-слое они заявлены), `wave_cleared` (или добавить публикацию, если волновой FSM
      должен знать о зачистке), мёртвые события EventBus, `ScreenShell`, `console.log` в
      `EnemyRenderer`, неиспользуемые хук-поля `WaveOrchestrator`, `IEnemyStrategy.draw`,
      неиспользуемые параметры конструктора `SpawnSystem`.
- [ ] Вынести константы, встречающиеся в 2+ местах, в `balance/*` (DPR `1.75`, `MAX_VERTS`,
      смещения стволов и т.п.) — **без изменения значений**.
- [ ] Критерии готовности: `typecheck` OK, `lint` не хуже baseline, `check:i18n` OK,
      smoke-тест: меню → старт → волна → подбор пикапа → пауза → game over.

### Фаза 1. Контракты ядра (2–4 дня)

Цель: убрать позиционные сигнатуры и мега-параметры, не меняя поведение.

- [ ] Ввести `WorldState` (или `SceneState`) — единая структура мира; передавать её в системы
      вместо списков аргументов.
- [ ] Ввести `RenderState` (DTO) — `RendererSystem.render(R, world, camera, view)`; убрать
      `Parameters<...>[n]`, `as any`, `as unknown as` в рендере.
- [ ] `CollisionSystem.update(dt, world)` — те же правила, но через `WorldState` + события.
- [ ] Разделить EventBus на каналы `gameplay`/`ui` (или явные namespace'ы), унифицировать
      payload (`EnemyKilledPayload`: один `score`, `enemy` типизированный); удалить мёртвые события.
- [ ] `PersistencePort` (get/set) внедрить в `upgrades`, `audio`, `App`; убрать прямые
      `localStorage` из горячего пути `UpgradeSystem.addParts`.
- [ ] Критерии: typecheck OK; в `game.ts` не осталось `Parameters<...>[n]`; smoke-тест прежний.

### Фаза 2. Домен: каталоги и data-driven (4–7 дней)

- [ ] **Оружие**: `WeaponDefinition` (id, метаданные, фабрика, звук, иконка, политика апгрейдов)
      в одном `WeaponRegistry`; `LoadoutTypes`/`Icon`/`AudioManager`/`game.ts` читают каталог,
      а не дублируют списки.
- [ ] **Пикапы**: `PickupKind` → единый `PickupDefinition` (эффект, звук, иконка, цвет);
      удалить 6+ switch'ей.
- [ ] **Враги**: разбить `Enemy` на базовый тип + роли (движение/ИИ/боевые/орбитальные),
      ввести `EnemyDefinition` (статы, стратегия, фабрика, звук); `EnemySystem.createEnemy`
      собирает из каталога, а не из 40 полей.
- [ ] **Бонусы/способности**: единый контракт эффекта (например, `BonusEffect` с методами
      `apply`/`expire`), `BonusManager` применяет через контракт; где эффект уже приложен
      (темп/стволы/рывок) — один владелец, остальные читают результат, а не пересчитывают.
- [ ] **Баланс**: все числовые параметры фич — в `balance/*`; из `weapons/`, `systems/`,
      `strategies/` остаются только ссылки на каталог.
- [ ] Критерии: добавление нового вида (оружие/пикап/враг) = 1 новый файл + 1 строка регистрации;
      в коде не осталось `switch (kind)` с жёсткими ветками для каталогизируемых вещей;
      typecheck OK; smoke-тест.

### Фаза 3. Системы: границы и зависимости (5–8 дней)

- [ ] `CollisionSystem` → 4–6 отдельных систем (`BulletCollision`, `EnemyBulletsVsPlayer`,
      `EntityCollision`, `PickupCollection`, `WeaveCollision`), каждая `update(dt, world)` +
      публикует события; убрать «callback на смерть врага» — заменить событием.
- [ ] `SpawnSystem` → `WaveComposer` (состав волны) + `SpawnPlacement` (геометрия разломов,
      через API `RiftField`, без прямой записи) + `WaveController` (счётчики, анонсы).
- [ ] `WaveOrchestrator` → `WaveFsm` (жизненный цикл волны) + `ZoneModel` (зона) +
      `ZoneEdgeDamage` (урон у края); UI-каналы — только через события/`GameBridge`.
- [ ] `EnemySystem` → `EnemyFactory` + `EnemyUpdate` + `CarrierSpawner` + `AvoidanceService`
      (одна реализация avoidance, а не три).
- [ ] `MenuScene` — переиспользовать `AsteroidField.makeAst` и `RiftField`/`RiftAnimation`;
      удалить `MenuRift`/`MenuEnemy`, два потока рендера свести к одному.
- [ ] Унифицировать путь гибели врага: один `enemy_died` (идентификатор, позиция, причина,
      капли/счёт), `ScoringSystem`, `PickupDropSystem`, `DeathSystem` подписаны на него.
- [ ] Устранить три источника номера волны (`WaveOrchestrator._wave`, `EnemySystem.wave`,
      `EnemyShootingSystem.wave`) — один канал + подписка.
- [ ] Критерии: системы не обращаются к чужим полям/массивам напрямую (только через мир и
      события), нет «мёртвых» веток событий, typecheck OK, smoke-тест.

### Фаза 4. Ядро: композиция и FSM (3–5 дней)

- [ ] `Game`: конструктор — только сборка графа; удалить `setupEventListeners` как слой
      координации (оставить только композицию); `step()` — явная малая форма:
      события системы → `world.update` по порядку → рендер → HUD-события по изменению.
- [ ] FSM: `paused`, countdown, death — состояния в `GameFSM`; удалить флаги-дубли и пустые
      коллбэки `GameFSMContext` (`onWaveStart/onWaveComplete/onWaveAdvanced`);
      `setWave`/`countdownDone` — один источник.
- [ ] `killEnemy` в `Game` удалить (путь смерти — только в системах).
- [ ] `Game` сократить до ~300 строк: только жизненный цикл, цикл кадров, публичный API для UI.
- [ ] Критерии: `game.ts` без прямых изменений чужих массивов/полей, без магических чисел в
      цикле, typecheck OK, smoke-тест + производительность не хуже baseline.

### Фаза 5. UI/React (3–5 дней)

- [ ] `App.tsx` разбить: `ScreenRouter`, `useGameController` (жизненный цикл `Game`, состояние
      HUD/баннеров/тостов/попапов), `usePersistentSettings` (все настройки одним контрактом),
      `GameScreen`.
- [ ] HUD: заменить `hudRefs`/прямые записи DOM на подписку с рендером по изменению данных
      (`useSyncExternalStore`/`GameBridge`); `HudLayer` владеет своими refs и разметкой.
- [ ] Починить попапы: либо канал `onPopup` с позицией от камеры, либо удалить цепочку,
      если функциональность не нужна.
- [ ] i18n: сделать ключи реально строгими — сейчас `TKey` фактически равен `string`
      (`i18n.ts:10-12`: `Dict` с index-сигнатурой → `keyof Dict = string`), поэтому опечатки
      ключей не ловятся; перевести словари на литеральный вывод (`as const`/вывод типа) и
      убрать не поддерживаемый `defaultValue` (`i18n.ts:377-385`). Добавить недостающие ключи
      (`hud.partsLabel` — сейчас сырой ключ на экране, `HudLayer.tsx:54`; `t` не имеет
      `defaultValue`, вместо него должно быть `upgrade.partsLabel`).
- [ ] Устранить дубли: `formatTime` в `useHudUpdater` → импорт из `ui/utils/formatTime`;
      формулы прогресса HP/комбо — один источник в `balance`/`types`.
- [ ] `ErrorBoundary`, `ScreenDimmer`, `ScreenShell` — оставить только используемое.
- [ ] Критерии: в React-слое нет прямых `textContent`/`style` из игровых колбэков; утечка
      `setTimeout` устранена; `check:i18n` OK; экраны меню/настройки/паузы работают.

### Фаза 6. Качество и приёмка (1–2 дня)

- [ ] `npm run lint` → 0 ошибок/предупреждений (политика проекта, см. `eslint.config.cjs`).
- [ ] Убрать оставшиеся `any`/`unknown` касты в горячих путях.
- [ ] Обновить `tasks/*` (сводку: ключи, baseline) или удалить устаревшие.
- [ ] `npm run build` + `npm run preview` smoke на минимум 2 устройствах/разрешениях.
- [ ] Финальный отчёт: достигнутые границы, оставшиеся технические долги.

## 5. Быстрые победы (можно делать параллельно, низкий риск)

- `console.log` в `EnemyRenderer.ts:54-56`.
- Сырой ключ `hud.partsLabel` (`HudLayer.tsx:54`): `t` не поддерживает `defaultValue`
  (`i18n.ts:377-385`); заменить на существующий `upgrade.partsLabel`.
- Незакрытый `setTimeout` в `App.tsx:206-211`.
- Дубликат `formatTime` в `useHudUpdater.ts:77-81`.
- `ScreenShell` — удалить (нигде не импортируется).
- Мёртвые события EventBus и не публикуемый `wave_cleared` (подписан в `game.ts:501`).
- `IEnemyStrategy.draw` — удалить или вынести в рендерер.

## 6. Ограничения и правила на время рефакторинга

1. **Без адаптеров** (правило из `GIGACODE.md`): плохо спроектированную систему переделываем
   целиком, а не «оборачиваем»; промежуточных мостов-обёрток не создаём.
2. **Без тестов** (правило из `GIGACODE.md`); проверка — typecheck, линт, i18n-скрипт,
   ручной smoke-тест геймплея.
3. Комментарии и JSDoc — на русском; имена — английские (правило проекта).
4. Удалять старый код сразу, не оставлять закомментированные блоки (правило проекта).
5. Каждая фаза — отдельные коммиты; поведение и баланс не меняются.
6. Перед удалением «мёртвого» кода — проверить грепом, что он действительно не используется
   (не только по импортам).
7. Не вводить новые зависимости; TypeScript/React/этот стек фиксированы.

## 7. Проверки (после каждой фазы)

```
npm run typecheck
npm run lint        # baseline: 51 errors / 2 warnings; цель фазы 6 — 0
npm run check:i18n  # 154 ключа, без сырых ключей на экранах
npm run build
npm run dev         # smoke: меню → старт → волна 1-3 → пикап → пауза → game over →
                    # настройки/помощь/улучшения, смена языка, FPS-дебаг
```

Ручная проверка по фазам:
- Фаза 2: добавить/удалить временный вид пикапа — должно требоваться минимум правок,
  затем вернуть.
- Фаза 3: включить режим отладки и отключить отдельный вид врага — поведение системы,
  отсутствие падений.
- Фаза 4: пауза/деградация/перезапуск 3 раза подряд без утечек и «лишних» врагов.
- Фаза 5: обновление HUD не вызывает лишних рендеров; проверка на мобильном тач-вводе.

## 8. Риски

| Риск | Митигция |
|---|---|
| Поведенческие изменения при переписывании систем | Каждая фаза с DTO/каталогом — smoke-тест; сравнение строк baseline |
| Порядок систем (скрытые зависимости) | Явный порядок в `Game`/`SystemPipeline`, комментарий о зависимостях |
| Регрессии ввода/паузы | FSM-шаги отдельно, проверка ESC/паузы в каждой фазе |
| Потеря локализации | `check:i18n` + поиск сырых ключей на экранах |
| Производительность при введении DTO | Копировать не списки, а ссылки; замер FPS до/после (dev-профиль) |
| Несогласованность с задачами `tasks/` | Обновить сводку в конце фаз 3-5 |