# Анализ декомпозиции — матрица использования полей

Фактический результат аудита (руками, по коду) для четырёх «жирных» компонентов.
Пути проверены: `src/game/ecs/components/*`.

## Поля компонентов

### EnemyComponent (src/game/ecs/components/EnemyComponent.ts) — РАЗОБРАН (этап 4 ✅)
Было: `ecsId, parentId, kind, x, y, vx, vy, angle, hp, maxHp, r, speed, contact,
score, boltDmg, fireCd, mode, modeT, strafeDir, seed, spawnCd, flash, hitCd, dead,
mass, dodgeWeight, dodgeDir, dodgeTimer, burstSpawned, burstActive, burstRestT,
burstCd, tCd1, tCd2, droneState, orbitAngle, orbitRadius, orbitTimer, waitTimer,
phaseDrones, carrierChildren`.
Стало (доменное): `ecsId, parentId, kind, angle, speed, contact, score, boltDmg,
fireCd, mode, modeT, strafeDir, seed, spawnCd, flash, hitCd, dead, mass, dodgeWeight,
dodgeDir, dodgeTimer, burst*, tCd1, tCd2, droneState, orbitAngle, orbitRadius,
orbitTimer, waitTimer, phaseDrones, carrierChildren`. Ориентация `angle` осталась
доменным полем (не входит в базовые).
Базовые (`Position/Velocity/Life/Radius`) вынесены в отдельные компоненты на той же сущности.

Потребители (переведены на `EnemyRef`/базовые компоненты):
- `EnemySystem` — `collectEnemyEntities()` → `EnemyRef`; движение/AI/спавн/avoidance
  читают `marker` + `position/velocity/radius`; `createEnemy` возвращает `Enemy` (плоский
  спавн-DTO), который `addEnemy` раскладывает по базовым+домену.
- `ai/strategies/*` (5 файлов) + `EnemyAI`/`IEnemyStrategy` — принимают `EnemyRef`,
  читают/пишут `marker` (вид/скорость/угол/AI-поля) + `position/velocity/radius`.
- `EnemyShootingSystem` — локальный `EnemyShot {entity, marker, position}`.
- `EcsWorld.physicsBodies()` — `EnemyRef`: `position/velocity/radius` + `marker` (dead/droneState/angle).
- `ZoneClampSystem` — `EnemyRef`/аспект: `position/velocity` + `marker`.
- `CollisionSystem`/`BulletCollision` — `world.enemies` = `EnemyRef[]`: `position/radius/life/marker`.
- `AllyDroneSystem`/`WaveFlowSystem` — `getEnemies()/getEnemyList()` = `EnemyRef[]`.
- Weapon/ability цепочки (`Weapon`/`WeaponManager`/`Targeting`/`CannonWeapon`/`LaserWeapon`/
  `MissileWeapon`/`Ability`/`AbilitySystem`/`QuantumSwapAbility`) — `EnemyRef` вместо `Enemy`.
- `buildWorld()` (GameContext)/`GameRender`/`WorldFrame`/`RenderScene` — `enemies: EnemyRef[]`.
- `EnemyRenderer.buildEnemyState` — мапит `EnemyRef` → `EnemyRenderState` (позиция/радиус/жизнь из базовых).

### AsteroidComponent (src/game/ecs/components/AsteroidComponent.ts) — РАЗОБРАН (этап 1 ✅)
Было: `key, kind, x, y, vx, vy, angle, spin, r, verts, hp, maxHp, dead, mass`.
Стало (доменное): `key, kind, angle, spin, verts, mass, dead`.
Базовые (`Position/Velocity/Life/Radius`) вынесены в отдельные компоненты на той же сущности.

Потребители (переведены на базовые компоненты):
- `asteroids.ts` — `AsteroidRef[]`: `marker.*` (домен) + `position/velocity/life/radius` (базовые);
  чанки-сиды — plain-seed-структуры, спавн через `spawnAsteroid`.
- `EcsWorld.physicsBodies()` — читает `position/velocity/radius` + `marker` (spin/angle).
- `ZoneSystem` — `getAsteroids()` → `AsteroidRef` (читает `position/velocity/radius`).
- `CollisionSystem` — `world.asteroids` → `AsteroidRef` (кэш identity): `marker.dead`,
  `position/velocity/radius`, `marker.mass`.
- `asteroidField.draw` — `position/radius/angle/verts` + `life` (hp/maxHp).

Дополнительно создано: `AsteroidRef` (связка живых компонентов), `AsteroidSpawn` (раскладка),
`clearAsteroids()`, `removeAsteroidByKey()`. `WorldFrame.asteroids` = `AsteroidRef[]`; `AsteroidWorld` удалён.

### AllyDroneComponent (src/game/ecs/components/AllyDroneComponent.ts) — РАЗОБРАН (этап 2 ✅)
Было: `entityId, x, y, r, angle, fireCd, phase, hp, maxHp, targetId, retargetT, flash,
permanent, kind, combat`.
Стало (доменное): `entityId, angle, fireCd, phase, targetId, retargetT, flash, permanent,
kind, combat`.
Базовые (`Position/Radius/Life`) вынесены в отдельные компоненты на той же сущности.
Дрон не имеет собственной скорости (орбита задаётся кинематически системой) — `Velocity` не входит.

Потребители (переведены на базовые компоненты):
- `AllyDroneSystem` — орбита/цель/стрельба/гибель через `DroneRef` (position/life + marker);
  урон-гибель читает `life.remaining`.
- `EcsWorld.addAllyDrone` — `AllyDroneSpawn` → Position/Radius/Life + узкий; `allyDrones()` → `DroneRef[]`;
  `damageAllyDrone` пишет в `LifeComponent.remaining`.
- `DroneWeapon` — `createUnit` → `AllyDroneSpawn`; `syncDrones` читает `marker.permanent`.
- `BulletCollision.checkEnemyBulletVsDrones` — hиттест по `position/radius`.
- `CollisionSystem` — drone avoidance (`position`), урон/смерть (`marker.entityId`), хит-событие (`position`).
- `DroneRenderer.buildDroneState` — `position/angle/life/marker`.

Дополнительно создано: `DroneRef` (связка живых компонентов), `AllyDroneSpawn` (раскладка).
`WorldFrame.allyDrones`/`RenderScene.allyDrones`/`WeaponContext.drones` = `DroneRef[]`; `AllyDrone` DTO удалён.

### PlayerComponent (src/game/ecs/components/PlayerComponent.ts) — РАЗОБРАН (этап 3 ✅)
Было: `state: PlayerState` — живая ссылка со всеми полями `x, y, vx, vy, angle, hp, maxHp,
invuln, thrusting, mass`.
Стало (доменное): `angle, invuln, thrusting, mass`.
Базовые (`Position/Velocity/Radius/Life`) вынесены в отдельные компоненты на Singleton-сущности.

Потребители (переведены на базовые компоненты):
- `PlayerSystem`/`PlayerMovement` — через `PlayerRef` (position/velocity/life + marker);
  урон/лечение читают `life.remaining/max`, инвuln — `marker.invuln`.
- `EcsWorld.registerPlayer` — строит позицию/скорость/радиус/жизнь + узкий;
  `playerRef()`/`playerState()` читают базовые.
- `physicsBodies()` — игрок строится из `position/velocity/radius` + `marker` (angle).
- `ZoneSystem` — `getPlayerRef` (position/velocity для клампа).
- `CollisionSystem` — `world.player` (PlayerRef): `position/radius/life/marker`.
- `GameContext` — ability/weapon/drone hooks через `playerRef`;
  `getPlayerSnapshot()` формирует строковый `PlayerSnapshot` для оружия.
- `PlayerRenderer`/`RendererSystem` — `position/velocity/life/marker`; `GameRender` — позиция камеры.

Дополнительно создано: `PlayerRef` (связка живых компонентов).
`WorldFrame.player`/`RenderScene.player` = `PlayerRef`; `PlayerWorld` DTO удалён.

## Ключевые выводы

1. **Тривиальная часть** — `x/y/vx/vy/r/hp/maxHp` копируются в `Position/Velocity/
   Life/Radius`. Для них ровно один источник → компонент, читатели меняются
   с `comp.x` на `components.get(PositionComponent).x`.

2. **Нетривиальная часть** — доменные поля:
   - враг: ~25 полей AI/боя/орбиты;
   - астероид: `verts` (форма), `spin`, `key`, `kind`, `mass`;
   - дрон: `targetId`, `retargetT`, `combat`, `permanent`, `phase`;
   - игрок: `angle`, `invuln`, `thrusting`, `mass`.
   Для них нужны новые узкие доменные компоненты.

3. **Самые центральные потребители** (трогают много полей и задерживают дальнейший
   переход):
   - `EnemySystem` + AI-стратегии (5 файлов в `ai/strategies/*`);
   - `CollisionSystem` (массивы `Enemy`/`Asteroid`);
   - `EcsWorld.physicsBodies()` (все 4 вида);
   - `buildWorld` (GameContext) + DTO-билдеры рендеров.

4. **Точки наибольшего сопротивления** — где сущность читается и как цельный
   `Enemy`/`Asteroid` (единый объект через `enemies()`/`asteroids()`), и как компонент:
   - `EnemySystem` (`context.enemies = enemyRefs` → `EnemyRef[]`);
   - `EnemyAI.updateAI(enemies, ...)` — стратегии принимают `EnemyRef`;
   - `CollisionSystem` (`world.enemies` = `EnemyRef[]`).
   Выбор сделан в пользу **полных компонентных запросов**: `EnemyRef` — живая связка
   компонентов (`{entity, marker, position, velocity, radius, life}`) с кэшем per-entity
   для стабильной identity, без read-only DTO-проекций. Все читатели переводятся на неё.

5. **Что уже чисто:** пикапы, пули, вражеские пули, лучи, частицы, кольца, разломы
   уже живут на базовых `Position/Velocity/Life/Radius` (+ маркер-компонент). Значит
   паттерн «маркер + базовые» работает и проверен — его достаточно перенести на
   врагов/астероиды/дроны/игрока.