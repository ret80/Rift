# Этап 5 — Физика на компонентах (убрать `PhysicsEntity`-адаптеры)

> Цель: физический слой работает с ECS-компонентами, а не с plain-адаптерами
> `entities.ts` (`playerEntity/enemyEntity/asteroidEntity/pickupEntity`).
>
> **Выполнено (игрок/враг/пикап) + этап 8 (астероиды).** Эти kind'ы теперь собираются в
> `EcsWorld.physicsBodies()` напрямую из компонентов; их plain-адаптеры (`playerEntity`,
> `enemyEntity`, `pickupEntity`, `asteroidEntity`) удалены. «Не покрыто» астероидов
> закрыто на этапе 8.

## Проблема

`src/game/physics/entities.ts` создаёт live-мосты `playerEntity(state)`,
`enemyEntity(enemy)`, `asteroidEntity(a)`, `pickupEntity(p)`, которые читают plain-объект
до шага физики и пишут результат после. Физический бэкенд (`IPhysics`) не знает о
компонентах. Это «обратный мост» №5.

## Подход

Физический слой становится `PhysicsSystem extends System`, который читает сущности по
компонентам (`Position`, `Velocity`, `Radius`, `Angle`, `Mass`/`Life`), строит тела по
этим компонентам, шагает движок и пишет результат обратно в те же компоненты. Адаптеры
`entities.ts` удаляются.

## Задачи

### 5.1 Вспомогательные компоненты
- [ ] Убедиться, что для физики есть/добавлены компоненты: `AngleComponent` (если угол
      нужен физике), `MassComponent` (или брать из `Radius`/`Life`), `KinematicComponent`,
      `SensorComponent`. Враг/астероид/пикап/игрок должны нести эти данные в компонентах.
- [ ] Ввести компонент-маркер для «физического тела» (например, `PhysicsBodyComponent`)
      или использовать сочетание `Kind`+`Position`+`Velocity`+`Radius`, чтобы `PhysicsSystem`
      знала, какие сущности регистрировать.

### 5.2 Переписать `PhysicsSystem` на компоненты
- [x] Источник тел игрока/врага/пикапа переведён на компоненты: `EcsWorld.physicsBodies()`
      читает `PlayerComponent.state`, `EnemyComponent`, `PickupKindComponent` +
      `Position/Radius`. `GameFrame.buildPhysicsEntities()` → `ecs.physicsBodies()` + астероиды.
- [x] Перенести логику из `entities.ts` в `EcsWorld.physicsBodies()`.
      `playerEntity/enemyEntity/pickupEntity` удалены. — **остался `asteroidEntity` (вне ECS).**
- [ ] Учитывать `integratesPosition` у движка (Planck/p2 vs custom): позицию двигает либо
      `PhysicsSystem`, либо движок. `PlayerSystem` (этап 3) и `EnemySystem` должны знать
      это через компонент/флаг, а не через legacy-флаг `physics.integratesPositions`.
- [ ] Контакты физики (`PhysicsContact`) должны отдавать компонент-идентификаторы, чтобы
      `CollisionSystem` (этап 4) выбирала нужные сущности по компоненту.

### 5.3 Астероиды
- [x] `asteroidEntity(a)` удалена. `AsteroidField` / `Asteroid` стали компонентами
      (`AsteroidComponent`, данные в компоненте) — пояс спавнит астероиды как ECS-сущности.
      **Завершено на этапе 8.**
- [x] Точки чтения `asteroidField.asteroidList` в `GameFrame`/`RendererSystem`/`CollisionSystem`
      переведены на компоненты (`ecs.asteroids()` геттер). **Завершено на этапе 8.**

## Ограничения этапа

- Не трогаем рендер (этап 6) и композицию `GameFrame` (этап 6), хотя `buildPhysicsEntities`
  в `GameFrame` используется `PhysicsSystem` — на этом этапе `PhysicsSystem.update` принимает
  `engine`, а не `buildPhysicsEntities()`.
- Выбор движка (`setEngine`, `createPhysicsEngine`, PHYSICS_ENGINE_IDS) сохраняется.

## Gate этапа 5

- [x] `playerEntity/enemyEntity/asteroidEntity/pickupEntity` удалены. — **игрок/враг/пикап
      (этап 5), астероиды (этап 8).**
- [x] Источник тел для игрока/врага/пикапа/астероида — `EcsWorld.physicsBodies()` (из компонентов);
      `GameFrame.buildPhysicsEntities` использует его.
- [ ] `GameFrame.buildPhysicsEntities()` удалён (нет plain-мостов физики). — **ещё содержит
      `asteroidEntity` (вне ECS).**
- [x] `typecheck`/`build` зелёные; `lint` по изменённым файлам — 0 ошибок;
      smoke-тест (волна 1 → 2, «ВОЛНА ЗАЧИЩЕНА», зона) идентичен этапу 4.