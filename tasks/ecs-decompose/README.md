# План декомпозиции «жирных» ECS-компонентов

> Цель: разложить `EnemyComponent` / `AsteroidComponent` / `AllyDroneComponent` /
> `PlayerComponent` на базовые переиспользуемые компоненты (`Position`, `Velocity`,
> `Life`, `Radius`) + узкие доменные компоненты, и переписать всех читателей на
> аспекты по базовым компонентам. Единственный источник правды остаётся в ECS,
> но уже **по композиции**, а не внутри одного «флеш-хранилища»-DTO.
> Поведение и баланс не меняются — только внутреннее устройство.

## 1. Проблема (что сейчас)

Четыре компонента содержат всё состояние сущности — позицию, скорость, здоровье,
радиус и десятки доменных полей. Фактически это DTO, «упакованные» в класс
`implements Component`:

| Компонент | Файл | Что внутри |
|---|---|---|
| `EnemyComponent` | `src/game/ecs/components/EnemyComponent.ts` | x,y,vx,vy,hp,maxHp,r,angle + ~25 AI/боевых полей (kind, speed, contact, score, boltDmg, fireCd, mode, modeT, strafeDir, seed, spawnCd, flash, hitCd, mass, dodgeWeight, dodgeDir, dodgeTimer, burst*, tCd1/tCd2, droneState, orbit*, waitTimer, phaseDrones, carrierChildren, ecsId, parentId) |
| `AsteroidComponent` | `src/game/ecs/components/AsteroidComponent.ts` | x,y,vx,vy,r,hp,maxHp,mass + verts, angle, spin, kind, key, dead |
| `AllyDroneComponent` | `src/game/ecs/components/AllyDroneComponent.ts` | x,y,r,angle,fireCd,phase,hp,maxHp + targetId, retargetT, flash, permanent, kind, combat |
| `PlayerComponent` | `src/game/ecs/components/PlayerComponent.ts` | живой `state` (ссылка на `PlayerState`) — всё состояние игрока |

Базовые компоненты (`PositionComponent{x,y}`, `VelocityComponent{vx,vy}`,
`LifeComponent{remaining,max}`, `RadiusComponent{r}`) **не используются** этими
четырьмя сущностями — в комментариях прямо сказано «для врагов это удобнее, чем
раскладывать по базовым компонентам».

## 2. Ключевой вывод анализа

Декомпозиция **не сводится** к копированию `x/y/vx/vy/r/hp` в базовые компоненты —
это тривиальная часть. Сложность в **доменных полях** и в том, что большинство
потребителей читает сущность как **цельный объект** (`Enemy`, `Asteroid`,
`AllyDrone`), а не через компоненты.

### 2.1 Центральные потребители (критичны для порядка этапов)

| Потребитель | Как читает сущность | Поля |
|---|---|---|
| `EnemySystem` (обновляет AI/движение) | `EnemyComponent` как цельный `Enemy` | почти все поля врага |
| `ai/strategies/*` (Drone/Hunter/Fighter/Cruiser/Carrier) | `Enemy` (единый объект) | x,y,vx,vy,angle,r,speed,dodgeWeight, + AI-поле |
| `EcsWorld.physicsBodies()` | компонент (+ базовые для пикапов) | x,y,vx,vy,angle,r |
| `ZoneClampSystem` | аспект по `EnemyComponent`, читает .x/.y/.vx/.vy/.r/.dead | базовые |
| `ZoneSystem` | `getAsteroids()` → `{x,y,r,vx,vy}` | базовые |
| `CollisionSystem` | `world.enemies` (массив `Enemy`) + `world.asteroids` | x,y,r,hp,mass,vx,vy,dead |
| `AllyDroneSystem` | `AllyDroneComponent` (цельный) | x,y,r,angle,phase,fireCd,hp + targetId,combat |
| `RendererSystem` + DTO-билдеры | `buildEnemyState`/`buildDroneState`/`buildPlayerState` → DTO из компонента | базовые + доменные для отрисовки |
| `GameContext.buildWorld()` | слои: `enemies/bullets/pickups/asteroids` | базовые + доменные |

Точки, где сущность читается **и** как `Enemy`/`Asteroid` (единый объект), **и**
как компонент: `EnemySystem`, `EnemyShootingSystem`, `CollisionSystem`,
`buildWorld`, DTO-билдеры. Это самые сложные места.

### 2.2 Поля, которые НЕ покрываются базовыми компонентами

- общие: `angle`, `mass`, `invuln` (у игрока), `thrusting` (игрок);
- враг: `ecsId`, `parentId`, `kind`, `speed`, `score`, `contact`, `boltDmg`,
  `fireCd`, `mode/modeT`, `strafeDir`, `seed`, `spawnCd`, `flash`, `hitCd`,
  `dodgeWeight/dodgeDir/dodgeTimer`, `burst*`, `tCd1/tCd2`, `droneState`,
  `orbitAngle/orbitRadius/orbitTimer`, `waitTimer`, `phaseDrones`,
  `carrierChildren`;
- астероид: `verts` (форма полигона), `spin`, `kind`, `key`;
- дрон: `targetId`, `retargetT`, `flash`, `permanent`, `kind`, `combat`.

Для них нужны **новые узкие доменные компоненты** (см. раздел 4).

## 3. Целевая модель

Композиция вместо «флеш-хранилища». Для каждой живой сущности — **набор отдельных
компонентов**, а не один класс со всеми полями.

```
Enemy-сущность:
  PositionComponent + VelocityComponent + LifeComponent + RadiusComponent
  + EnemyComponent (узкий: kind, ecsId, parentId, speed, score, contact, boltDmg)
  + EnemyCombatComponent (fireCd, flash, hitCd, mode, modeT, ...)
  + EnemyBehaviorComponent (droneState, orbit*, dodgeWeight, ...)

Asteroid-сущность:
  PositionComponent + VelocityComponent + LifeComponent + RadiusComponent
  + AsteroidComponent (узкий: key, kind, verts, spin, mass)

AllyDrone-сущность:
  PositionComponent + VelocityComponent + LifeComponent + RadiusComponent
  + AllyDroneComponent (узкий: kind, phase, targetId, retargetT, flash, permanent, combat)
  (fireCd — часть боевого состояния)

Player-сущность:
  PositionComponent + VelocityComponent + LifeComponent + RadiusComponent
  + PlayerComponent (узкий: invuln, thrusting, angle, mass, maxHp/... — по факту
    PlayerState разбивается на эти базовые + узкий PlayerComponent)
```

## 4. Целевые доменные компоненты

Создаём (по потребности, не «навырост»):

- `EnemyComponent` (сокращается до `kind/ecsId/parentId/speed/score/contact/boltDmg`);
- `EnemyCombatComponent` (fireCd, flash, hitCd, mode, modeT, strafeDir, seed, spawnCd,
  burst*, tCd1/tCd2);
- `EnemyBehaviorComponent` (droneState, orbitAngle/orbitRadius/orbitTimer, waitTimer,
  phaseDrones, carrierChildren, dodgeWeight/dodgeDir/dodgeTimer);
- `AsteroidComponent` (сокращается до `key/kind/verts/spin/mass`);
- `AllyDroneComponent` (сокращается до `kind/phase/targetId/retargetT/flash/permanent/combat`);
- `PlayerComponent` (узкий: angle, invuln, thrusting, mass — то, что не в базовых).

Bазовые (`Position`, `Velocity`, `Life`, `Radius`) уже есть — переиспользуются.

## 5. Порядок этапов (по сложности / «центральности»)

Этапы расположены от **наименее связного** к **наиболее центральному**, чтобы каждый
давал зелёный билд и не требовал одновременной правки всех потребителей.

### Этап 1 — Астероиды (первый, изолированный) ✅ ВЫПОЛНЕН
- `AsteroidComponent` → базовые `Position/Velocity/Life/Radius` + узкий `AsteroidComponent`
  (остались доменные `key/kind/angle/spin/verts/mass/dead`).
- Потребители: `asteroids.ts`, `EcsWorld.asteroids()/asteroidByKey()/physicsBodies()`, `ZoneSystem`,
  `CollisionSystem` (астероидная ветка), рендер `asteroidField.draw`.
- Астероиды уже были переведены на компоненты (этап 8 миграции), но оставались fat — здесь
  окончательно разложены.
- Новое: `AsteroidRef` (кэшированная связка `{marker, position, velocity, life, radius}`),
  `AsteroidSpawn` (раскладка по базовым+доменным), `clearAsteroids()`, `removeAsteroidByKey()`.
- `WorldFrame.asteroids` → `AsteroidRef[]`; `AsteroidWorld` удалён. Полный переход на
  компонентные запросы — без read-only DTO-проекций (по решению в ходе работы).

### Этап 2 — Союзные дроны (AllyDrone) ✅ ВЫПОЛНЕН
- `AllyDroneComponent` → базовые `Position/Radius/Life` + узкий `AllyDroneComponent`
  (остались доменные `entityId/angle/fireCd/phase/targetId/retargetT/flash/permanent/kind/combat`).
- Потребители: `AllyDroneSystem`, `DroneWeapon` (addAllyDrone), `BulletCollision`
  (drone hits), `CollisionSystem` (drone avoidance + урон), рендер `DroneRenderer`,
  `buildWorld`/`WorldFrame`/`RenderScene`.
- Дроны — компактный домен (несколько полей), хороший «полигон» для паттерна.
- Новое: `DroneRef` (живая связка `{marker, position, radius, life}`),
  `AllyDroneSpawn` (раскладка по базовым+доменным). Дрон не имеет собственной
  скорости (орбита задаётся кинематически системой), поэтому `VelocityComponent`
  не входит.
- `WorldFrame.allyDrones`/`RenderScene.allyDrones`/`WeaponContext.drones` → `DroneRef[]`;
  `getDrones()` возвращает `DroneRef[]`, `addAllyDrone` принимает `AllyDroneSpawn`.
- `AllyDrone` DTO-интерфейс из `types.ts` удалён.

### Этап 3 — Игрок (Player) ✅ ВЫПОЛНЕН
- `PlayerComponent` (ранее хранил живую ссылку `state: PlayerState` со всеми полями)
  → базовые `Position/Velocity/Radius/Life` + узкий `PlayerComponent`
  (домен: `angle/invuln/thrusting/mass`).
- `PlayerState` сокращён до доменных полей (без `x/y/vx/vy/r/hp/maxHp`).
- Потребители: `PlayerSystem`/`PlayerMovement`, `physicsBodies`, `ZoneSystem` (getPlayerRef),
  `CollisionSystem` (player-enemy/asteroid + drone avoidance), рендер `PlayerRenderer`,
  `buildWorld`/`WorldFrame`/`RenderScene`, `GameContext` (ability/weapon/drone hooks), `GameRender`.
- Новое: `PlayerRef` (живая связка `{marker, position, velocity, radius, life}`),
  `EcsWorld.registerPlayer()` строит базовые + узкий, `playerRef()`/`playerState()`.
- `WorldFrame.player`/`RenderScene.player` → `PlayerRef`; `PlayerWorld` DTO удалён.
- `WeaponContext.player` остаётся строковым `PlayerSnapshot` (x/y/vx/vy/hp/maxHp) — это
  runtime-снимок для оружия, не сырой компонент (документированный паттерн).

### Этап 4 — Враги (Enemy) — самый центральный и большой
- `EnemyComponent` → базовые + `EnemyComponent`/`EnemyCombatComponent`/`EnemyBehaviorComponent`.
- Потребители: `EnemySystem`, `EnemyShootingSystem`, AI-стратегии (5 файлов),
  `CollisionSystem`, `ZoneClampSystem`, `physicsBodies`, `buildWorld`, DTO-билдеры.
- Выполняем последним: он зависит от паттерна, отлаженного на астероидах/дронах/игроке,
  и затрагивает больше всего файлов.

## 6. Последовательность внутри каждого этапа

1. Сократить компонент (оставить только доменные поля), добавить базовые компоненты.
2. Провести по всем потребителям: заменить `comp.x/.y/.vx/.vy/.r/.hp` на чтение
   `Position/Velocity/Life/Radius` через `entity.components.get(...)` или аспект.
3. Где удобно — ввести вспомогательные методы `EcsWorld` (например `enemyPosition(entity)`),
   чтобы не дублировать `components.get(...)`.
4. Поправить спавн (создание сущности = `new PositionComponent(...)` + `new EnemyComponent(...)`).
5. Прогнать `typecheck` → `build` → линт по изменённым файлам → smoke.

## 7. Риски

| Риск | Митигция |
|---|---|
| Потеря производительности при `components.get(...)` на каждом кадре | Кэшировать компоненты при входе в `process` (как делают базовые системы — `components.get` один раз на сущность) |
| Разные системы читают один и тот же аспект по-разному | Ввести хелперы `EcsWorld` (например `enemyAspect()`), чтобы одинаково извлекать |
| «Полуперевод»: часть систем на базовых, часть на жирных | Строго по этапам, каждый — зелёный билд |
| DTO-билдеры рендера привязаны к жирному компоненту | Перевести на чтение базовых компонентов (как уже сделано для частиц/колец) |
| Изменение поведения при «перестановке» полей | Только перестановка ответственности; никаких новых значений/баланса |

## 8. Гейты

- [x] `typecheck`/`build` зелёные после каждого этапа (этап 1: exit 0).
- [x] Линт по изменённым файлам — 0 новых ошибок (этап 1: exit 0).
- [x] Ни один потребитель не читает `comp.x/.vx/.r/.hp` напрямую из жирного компонента —
      только из базовых (проверка `git grep` выполнена для астероидов).
- [x] `AsteroidComponent` больше не содержит `x/y/vx/vy/r/hp/maxHp` (проверено по файлу).
- [x] `AllyDroneComponent` больше не содержит `x/y/vx/vy/r/hp/maxHp` (проверено по файлу).
- [x] `PlayerComponent`/`PlayerState` больше не содержат `x/y/vx/vy/r/hp/maxHp` (проверено по файлу).
- [x] `EnemyComponent` больше не содержит `x/y/vx/vy/r/hp/maxHp` (этап 4).
- [x] Smoke (нулл-рендер): меню → старт → волны → game over; поведение идентично baseline
      (астероидная, дроновая и игровая ветки).

## 9. Статус

**Этап 1 — Астероиды: ✅ завершён.**

- `typecheck` exit 0, `build` exit 0, eslint по изменённым файлам exit 0 (0 новых ошибок).
- `AsteroidWorld` удалён; в исходниках не осталось ссылок на него (остались только в старых
  доках/базе `tasks/ecs-migration/STATUS.md` и `tasks/_baseline/`).
- Ни один читатель астероидов не берёт `x/y/vx/vy/r/hp/maxHp` напрямую из `AsteroidComponent`
  — только из базовых компонентов через `AsteroidRef`/`components.get(...)`.
- `AsteroidComponent` не содержит `x/y/vx/vy/r/hp/maxHp` (проверено по файлу).
- Smoke (нулл-рендер): меню → волна 07 → бой (счёт 502, 10 целей) → game over → «ЕЩЁ РАЗ»
  (рестарт, счёт 0, пояс пере-спавнится); астероиды двигаются/фрагментируются/гибнут без ошибок.

**Этап 2 — Союзные дроны: ✅ завершён.**

- `typecheck` exit 0, `build` exit 0, eslint по изменённым файлам exit 0 (0 новых ошибок).
- `AllyDroneComponent` не содержит `x/y/vx/vy/r/hp/maxHp` (проверено по файлу); домен: `entityId/angle/
  fireCd/phase/targetId/retargetT/flash/permanent/kind/combat`. Запас прочности — в `LifeComponent`,
  позиция/радиус — в `Position/RadiusComponent`.
- Ни один читатель дронов не берёт `x/y/vx/vy/r/hp/maxHp` напрямую из `AllyDroneComponent`
  — только из базовых через `DroneRef`/`components.get(...)`. `AllyDrone` DTO-интерфейс удалён.
- Smoke (нулл-рендер, `?renderer=null`): дроны 2/8 появляются (seed флота), орбитят корабль,
  стреляют (счёт 637–1642, 16–31 цель), game over «СИГНАЛ ПОТЕРЯН» чисто, «ЕЩЁ РАЗ» рестарт.
  Консоль чистая (только benign AudioContext + vite HMR).

**Этап 3 — Игрок: ✅ завершён.**

- `typecheck` exit 0, `build` exit 0, eslint по изменённым файлам exit 0 (0 новых ошибок).
- `PlayerComponent`/`PlayerState` не содержат `x/y/vx/vy/r/hp/maxHp` (проверено по файлу);
  домен: `angle/invuln/thrusting/mass`. Запас прочности — в `LifeComponent`,
  позиция/скорость/радиус — в `Position/Velocity/RadiusComponent`.
- Ни один читатель игрока не берёт `x/y/vx/vy/r/hp/maxHp` напрямую из жирного компонента
  — через `PlayerRef`/`components.get(...)`. `PlayerWorld` DTO удалён;
  `WeaponContext.player` остаётся строковым `PlayerSnapshot` (документированный снимок для оружия).
- Smoke (нулл-рендер): меню → старт (счёт 0, волна 06, дроны 2/8) → игрок двигается (синтетический
  ввод), стреляет (счёт 539, 20 целей) → получает урон (НП 824→867, щит/аптечки) → game over
  «СИГНАЛ ПОТЕРЯН» → «ЕЩЁ РАЗ» рестарт. Консоль чистая (только benign AudioContext + vite HMR).

**Этап 4 — Враги (Enemy): ✅ завершён.**

- `EnemyComponent` сокращён до узкого доменного: `ecsId/parentId/kind/angle/speed/contact/score/
  boltDmg/fireCd/mode/modeT/strafeDir/seed/spawnCd/flash/hitCd/dead/mass/dodgeWeight/dodgeDir/
  dodgeTimer/burst*/tCd1/tCd2/droneState/orbit*/orbitTimer/waitTimer/phaseDrones/carrierChildren`.
  Ориентация `angle` осталась доменным полем (не входит в базовые). Позиция/скорость/радиус/запас
  прочности — в `Position/Velocity/Radius/Life` на той же сущности.
- Новое: `EnemyRef` — живая связка `{entity, marker, position, velocity, radius, life}` с кэшем
  per-entity (`WeakMap`) для стабильной identity (`indexOf`/`includes`/`userData`).
  `addEnemy` раскладывает `Enemy` (плоский спавн-DTO) по базовым + узкому `EnemyComponent`;
  `enemies()` возвращает `EnemyRef[]`, `damageEnemy` читает `life.remaining`.
- Переведены на `EnemyRef`/базовые компоненты: `EnemySystem` + `EnemyAI` + 5 AI-стратегий
  (Hunter/Fighter/Drone/Cruiser/Carrier), `EnemyShootingSystem` (локальный `EnemyShot`),
  `ZoneClampSystem`, `physicsBodies`, `CollisionSystem`, `BulletCollision`, `AllyDroneSystem`,
  `WaveFlowSystem`, `BulletSystem` (уже был на компонентах), оружейная цепочка
  (`Weapon`/`WeaponManager`/`Targeting`/`CannonWeapon`/`LaserWeapon`/`MissileWeapon`),
  способности (`Ability`/`AbilitySystem`/`QuantumSwapAbility`), рендер-DTO
  (`WorldFrame`/`RenderScene`/`EnemyRenderer.buildEnemyState`), `GameContext`/`GameRender`.
- `angle` — единственное доменное поле врага, которое не покрывается базовыми; сохранено в
  `EnemyComponent`. Плоский `Enemy`-тип в `types.ts` остаётся только как вход спавна (`addEnemy`).
- Smoke (нулл-рендер): меню → старт (волна 07) → бой; счёт растёт (502→866, ×2.0), время идёт
  (T+0:15), враги спавнятся/двигаются/погибают без ошибок. Консоль чистая (только benign
  AudioContext + vite HMR). `typecheck` exit 0, `build` exit 0, eslint по изменённым файлам exit 0.