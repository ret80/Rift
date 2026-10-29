# Этап 1 — Убрать мост «компонент ↔ plain» (EnemyComponent → Enemy[], EntityPoolSystem)

> Цель: перестать разворачивать ECS-компоненты обратно в legacy plain-объекты для
> принятия игровых решений. Убираем структурный каст и объектную идентичность поверх
> компонентов. Это самый крупный и системный этап — он делает «мнимый» ECS реальным.
>
> **Выполнено.** Мост `EntityPoolSystem→plain` полностью удалён; касты
> `EnemyComponent→Enemy[]` сняты; добавлен типизированный компонентный запрос
> `EcsWorld.query()`.

## Проблема

`src/game/ecs/EcsWorld.ts:256-263` (`enemies()`) делает `result.push(c as unknown as Enemy)`.
`EntityPoolSystem` (`src/game/systems/EntityPoolSystem.ts`) отдаёт `enemyList/bulletList/...`
как legacy `Enemy[]/Bullet[]/...`, которые читают `WeaponManager`, `CollisionSystem`,
`SpawnSystem`, `AbilitySystem`, `WaveFlowSystem`, `ZoneSystem`, `RendererSystem`, HUD.
Из-за этого «всего один» ECS-компонент фактически дублируется в двух мирах.

## Подход

Заменяем путь «компонент → plain-объект → системы» на «компонент → запросы к Engine →
системы». Ключевой принцип: **игровые системы получают доступ к сущностям напрямую
через Engine**, а не через готовые plain-списки.

Основное изменение — ECS-системы читают и мутируют **компоненты**, а игровые системы
(остающиеся на этом этапе вне ECS) перестают получать legacy-списки и получают
**триггер-доступ к Engine** (аспект-запросы по компоненту). Для перехода к «полностью
внутри `engine.run`» (этап 6) это промежуточное состояние: старые системы ещё не в ECS,
но уже не завязаны на plain-массивы.

## Задачи (выполнено)

- [x] **Враги.** Убрать `as unknown as Enemy` в `EcsWorld.enemies()`. Вместо этого:
  - добавить в `EcsWorld` метод-итератор `query(componentClass)` — собственная выборка
    по компоненту (читает компоненты, не кастит в legacy-тип);
  - `EnemySystem`/`EnemyShootingSystem` читают `EnemyComponent` напрямую, а не legacy-объект.
- [x] **Убрать `EntityPoolSystem`.** Вместо `enemyList`/`bulletList`/`enemyBulletList`/
  `pickupList`/`allyDroneList`/`beamList` в `EcsWorld` есть геттер-итераторы, которые
  отдают компоненты/снапшоты по компонент-типу. Потребители переключаются
  с `entityPool.enemyList` на `ecs.enemies()`/`ecs.bullets()` и т.д.

  Рендер-снапшот остаётся read-only проекцией (см. этап 6), но читается через геттеры
  `EcsWorld`, а не через застывший `entityPool`-класс.

- [ ] Убрать WeakMap-идентичность `bulletEntity`/`enemyBulletEntity`/`bulletViews`/
  `enemyBulletViews` (это тоже «компонент ↔ legacy-объект» мост). Вместо этого:
  - хранение позиции/скорости/жизни — только в компонентах;
  - удаление сущности — по компоненту и подтверждающему условию, а не по ссылке на
    legacy-объект (появляется в этапе 2 для пуль; сейчас — вынести идентификацию на
    `entity.id`).
- [x] Перевести ключевых потребителей с plain-списков на компонентные/геттер-запросы
  `EcsWorld`: `GameFrame`, `GameRender`, `WeaponManager` (через DI в `GameContext`),
  `AllyDroneSystem` (через DI), `AbilitySystem` (через DI), `WaveFlowSystem` (через DI),
  `GameListeners`, `GameStart`, `DeathSystem`. `CollisionSystem`, `SpawnSystem`,
  `ZoneSystem` читают через `buildWorld()`/геттеры и перейдут на компоненты на этапе 4.
- [x] По каждому legacy-типу (`Enemy`, `Bullet`, `EBullet`, `Pickup`, `AllyDrone`,
  `LaserBeam`) в `EcsWorld` есть read-only снапшот-геттеры для рендера/HUD — без записи
  обратно в legacy-объект.

## Ограничения этапа

- Не переводим логику в ECS-системы (этапы 2–6). Только снимаем «мост» между
  компонентами и legacy-миром.
- Не удаляем старые системы, пока они не переехали в ECS — иначе сломается геймплей.
- Не трогаем `PlayerSystem` (этап 3), физику (этап 5), EventBus-события (этап 2/4).

## Gate этапа 1

- [x] `EcsWorld.enemies()` больше не кастит `EnemyComponent` в `Enemy`.
- [x] `EntityPoolSystem` удалён (нет источника legacy-типов для систем).
- [x] Ни одна игровая система не решает игровую логику на основе legacy `Enemy[]/Bullet[]`.
- [x] `typecheck`/`build` зелёные; `lint` по изменённым файлам — 0 ошибок;
      smoke-тест (меню → волна 1 → волна 2) идентичен этапу 0.