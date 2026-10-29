# Этап 8 — Астероиды на ECS (путь B, завершение этапа 5)

> Цель: устранить последний plain-мост `physics/entities.ts` (`asteroidEntity(Asteroid)`)
> и перевести астероиды на ECS-компоненты — `AsteroidComponent` на сущностях в `engine`.
> Поведение пояса (чанки-генерация, осколки, зона, коллизии, рендер, меню) не меняется.
>
> **Выполнено.** Астероиды стали ECS-сущностями; `asteroidEntity`/`physics/entities.ts`
> удалены; все внешние читатели (физика, коллизии, зона, рендер, `buildWorld`, `MenuScene`)
> работают с `AsteroidComponent`.

## Проблема (что было)

`src/game/physics/entities.ts` экспортировал `asteroidEntity(a)`, который читал plain-объект
`Asteroid` из `AsteroidField.asteroidList` до шага физики и писал результат после — «обратный
мост» №5. Астероиды жили в отдельном legacy-массиве (`asteroidList`) и не были ECS-сущностями,
поэтому `CollisionSystem` использовал `indexOf`/`includes` по этому plain-массиву, а физика
собирала астероидные тела вручную.

## Решение

Астероиды — ECS-сущности с `AsteroidComponent` (единственный источник правды: позиция,
скорость, радиус, здоровье, форма `verts`, угол/спин, масса). Пояс `AsteroidField` остаётся
симулятором (генерация чанков, зона, осколки, culling), но теперь спавнит/удаляет астероиды
через `EcsWorld` на уровне компонентов; сами данные читаются из `engine` через `query`.

### Компонент и API
- `src/game/ecs/components/AsteroidComponent.ts` — данные астероида. Поле `key` — строковая
  идентичность в поясе (как старый `Asteroid.id`); ECS-маркер `id`("Asteroid") занят базовым
  классом, поэтому не используется.
- `EcsWorld`:
  - `spawnAsteroid(state)` — создать ECS-сущность с `AsteroidComponent`;
  - `asteroids()` — `query(AsteroidComponent)` (производное чтение);
  - `asteroidByKey(key)` / `removeAsteroidByKey(key)` — поиск/удаление по идентичности пояса;
  - `clearAsteroids()` — мягкий сброс (очистить ECS-сущности).

### AsteroidField
- `asteroidList` стал **getter** `this.h.ecs.asteroids()` (не массив-поле) — все читатели
  (рендер, коллизии, зона, физика) видят те же компоненты.
- Генерация чанков и осколков строит `AsteroidComponent` и спавнит через `ecs.spawnAsteroid`.
- Culling и удаление — через `removeAsteroidByKey`. `reset()`/`hardReset()` → `clearAsteroids()`
  (+ сброс `chunks`/`gone`/`boundsKey`).
- Добавлен публичный `spawn(state)` для меню-сцены.

### Физика / коллизии
- `EcsWorld.physicsBodies()` строит астероидные тела напрямую из `AsteroidComponent`
  (kind `asteroid`), как уже делалось для игрока/врага/пикапа.
- `src/game/physics/entities.ts` **удалён**; из `physics/index.ts` убран экспорт `asteroidEntity`.
- `GameContext`: источник тел кадра стал `() => this.ecs.physicsBodies()` (без ручного
  прохода по `asteroidList`). `zoneSystem.getAsteroids` и `buildWorld().asteroids` читают
  `this.ecs.asteroids()`. В `AsteroidField`-хуки передан `ecs`.
- `CollisionSystem`/`BulletCollision` работают с `AsteroidComponent[]` (это и есть массив
  `world.asteroids`); `indexOf`/`includes` теперь по компонентам — не по legacy-массиву.

### Рендер / меню
- `RendererSystem.draw`/`renderMenu` по-прежнему зовут `asteroidField.draw(R, time)` — тот же
  пояс, но читает компоненты через геттер.
- `MenuScene.ensureMenuAsteroids` — вместо `asteroidList.push(plain)` использует
  `asteroidField.spawn({...})` (ECS-ущность с `AsteroidComponent`).

## Итог

- Устранён последний physics-adapter `asteroidEntity` и plain-массив `Asteroid[]` как источник
  правды. Астероиды — такие же ECS-сущности, как враги/пикапы.
- `physics/entities.ts` и `asteroidEntity` больше не существуют; `physics/index.ts` чист.

## Проверка

- `npm run typecheck` — зелёный (exit 0).
- `npm run build` — зелёный (exit 0).
- `npx eslint` по изменённым файлам — 0 новых ошибок (MenuScene: 3 pre-existing lint-ошибки
  не тронуты).
- Smoke (null-рендер): меню → ИГРАТЬ → волна 07 → бой (счёт 000548 ×3.0, 11 целей) →
  смерть → «СИГНАЛ ПОТЕРЯН» → «ЕЩЁ РАЗ» → перезапуск на отсчёте «5». Ошибок в консоли нет
  (только AudioContext + benign vite WS reconnect).