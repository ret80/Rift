# Этап 4 — Домены на ECS (физика-зависимые системы, оружие, волна, коллизии, зона)

> Цель: перевести на `extends System` и `engine.run(dt)` те домены, которые сейчас
> вызываются вручную в `GameFrame.step()`. Остаются логика физики (этап 5) и чистка
> композиции кадра (этап 6). Это самый объёмный этап: выносим на компоненты игровые
> системы, которые на этапе 1 уже перестали читать plain-массивы.
>
> **Выполнена группа 1 (таймер/состояние-системы).** Countdown, Scoring (комбо),
> BonusManager и ShieldSystem переведены на `extends System` и тикают внутри
> `engine.run(dt)`; ручные `update()` из `GameFrame.step()` убраны. Остальные домены
> (оружие, коллизии, волна/зона/спавн) — см. «Не покрыто» ниже.

## Домены для перевода

Все эти системы сейчас вызываются напрямую из `GameFrame.step()` без `extends System`:
`CountdownSystem`, `ScoringSystem`, `BonusManager`, `ShieldSystem`, `AbilitySystem`,
`DeathSystem`, `CollisionSystem`, `SpawnSystem`, `WaveFlowSystem`, `ZoneSystem`,
`AsteroidField`, `WeaponManager`, `GrazeSystem`, `UpgradeSystem`, `PickupDropSystem`,
`ApplyPickupSystem`, `WaveOrchestrator`, `LoadoutSystem`.

## Подход к каждому домену

Каждый домен становится одной или несколькими `extends System`-системами, которые читают
компоненты (или вычислимые события) и пишут их. События EventBus, которые дублируют
появление/удаление сущностей, переводятся на прямые действия в Engine. EventBus остаётся
для презентации/FSM/звука/счёта.

## Группа 1 (готово) — таймер/состояние-системы → ECS

Переведены на `extends System` (без аспекта — чистые state/timer, получают `dt` в
`process(dt)`), зарегистрированы в `ecs.engine.systems.add(...)`:

| Система | Файл | Эквивалент |
|---|---|---|
| CountdownSystem | `src/game/systems/CountdownSystem.ts` | `update(dt)` → `process(dt)`; `priority = -10` (до игровых систем) |
| ScoringSystem (комбо) | `src/game/systems/ScoringSystem.ts` | `updateCombo(dt)` → `process(dt)`; `priority = -20` |
| BonusManager | `src/game/loadout/bonuses/BonusManager.ts` | `update(dt)` → `process(dt)`; `priority = -15` |
| ShieldSystem | `src/game/systems/ShieldSystem.ts` | `update(dt)` → `process(dt)`; `priority = -12` |

В `GameFrame.step()` убраны ручные `ctx.countdownSystem.update`, `ctx.scoringSystem.updateCombo`,
`ctx.bonusManager.update`, `ctx.shieldSystem.update` — теперь они тикают внутри
`ctx.ecs.update(dt)` (`engine.run(dt)`).

Проверка: `typecheck`/`build`/`lint` зелёные; smoke (волна 1, отсчёт «5», комбо ×6.0, счёт
растёт) без ошибок.

## Задачи

### 4.1 Коллизии (`CollisionSystem`)
- [ ] Разделить `CollisionSystem` на ECS-системы:
  - `BulletVsEnemySystem` — пуль игрока по врагам/астероидам;
  - `EnemyBulletVsPlayerSystem` — вражеских пуль по игроку (попадание + грэйз);
  - `EnemyBulletVsDroneSystem` — вражеских пуль по дронам;
  - `EntityCollisionSystem` — player-enemy, player-asteroid, enemy-asteroid (из физ. контактов).
- [ ] Урон/гибель — прямое изменение компонентов (`EnemyComponent.hp`, `PlayerComponent.state.hp`),
  а не публикация событий, порождающих/удаляющих сущности. Событие `enemy_killed` сохранить
  только как **презентационный** сигнал (дроп, счёт, звук, баннер) — не как источник спавна.
- [ ] `checkBulletCollisions`/`checkEnemyBulletVsPlayer`/`checkEnemyBulletVsDrones`/
  `softResolveCollision` — перевести на чтение компонентов (позиция/радиус/скорость из
  `Position/Velocity/Radius/Life`), а не на legacy `Enemy[]/Bullet[]`.

### 4.2 Оружие (`weapons/*` + `WeaponManager`)
- [ ] `WeaponManager` и `weapons/*` («cannon», «missile», «weaver», дроны) становятся
  `extends System` или системой, читающей `PlayerComponent`/`EnemyComponent`.
- [ ] Спавн пуль игрока/дронов — прямая запись в Engine (см. этап 2).
- [ ] Targeting/aiming читают компоненты, а не `entityPool.enemyList`.

### 4.3 Дроны (`AllyDroneSystem`)
- [ ] Уже ECS (`src/game/ecs/systems/AllyDroneSystem.ts`). Убедиться, что её зависимости
  (`getEnemies/addBullet/getPlayer`) берут компоненты, а не legacy-списки. `addBullet` —
  прямой спавн в Engine.

### 4.4 Волна/спавн/зона
- [ ] `SpawnSystem`, `WaveOrchestrator`, `WaveFlowSystem`, `CountdownSystem`, `ScoringSystem`,
  `UpgradeSystem`, `PickupDropSystem`, `ApplyPickupSystem` — описать целевые компоненты
  (`WaveComponent`, `ScoreComponent`) и перевести спавн врагов/пикапов на прямой Engine
  вызов. Числа/баланс не менять.
- [ ] `ZoneSystem` → `ZoneSystem extends System`, читает компоненты игрока/врагов.
- [ ] `DeathSystem`/`GrazeSystem` → ECS-системы по компонентам (сигналы о презентации — событие).

## Гейт этапа 4

- [ ] Все перечисленные домены зарегистрированы в `engine.systems` и больше не вызываются
      вручную в `GameFrame.step()` кроме физики (этап 5) и презентации (этап 6).
- [ ] Ни один домен не читает legacy `EntityPoolSystem`-списки для игровых решений.
- [ ] Урон/смерть/спавн идут через компоненты или прямой Engine-вызов, не через
      «мост-событие».
- [ ] `typecheck`/`lint`/`build` зелёные; smoke-тест идентичен этапу 3.