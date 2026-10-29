# Этап 6 — Кадр и композиция (`GameFrame.step()` = `engine.run(dt)` + презентация)

> Цель: `GameFrame.step()` перестаёт вручную вызывать `ctx.*.update(dt)`. Весь игровой
> апдейт идёт через `engine.run(dt)` (все ECS-системы по приоритету), затем — презентация
> (рендер, камера, HUD, аудио, ввод). Adapter-слой между ECS и presentation исчезает.
>
> **Выполнены подшаги A–F.** `WeaponManager` (prio 5), `PhysicsSystem` (prio 6),
> `CollisionSystem` (prio 7), `SpawnSystem` (prio 8), `WaveFlowSystem` (prio 9),
> `ZoneSystem` (prio 10), `ZoneClampSystem` (prio 11), `LoadoutSystem` (prio 12) и
> `AbilitySystem` (prio −8) переведены на `extends System` и тикают внутри `engine.run(dt)`.
> Ручные `ctx.*.update` убраны из `GameFrame.step()`; `GameFrame.buildPhysicsEntities`
> удалён (физика сама собирает тела). `DeathSystem` осознанно оставлен FSM-утилитой в
> ветке `dying` (переход в `over`); `Fx` — презентационный слой после `engine.run`.

## Что должно остаться в `GameFrame.step()`

```
step(dt):
  1. handleDebugKeys (dev)
  2. if menu → menuScene.update/render; return
  3. if paused → renderScene; return
  4. ctx.ecs.update(dt)              // engine.run(dt) — ВСЕ игровые системы
  5. presentation (read-only):
        camera.update (по игроку)
        fx.update(dt)                // тряска экрана (dead, но презентация)
        renderer.render(scene)       // снапшот из компонентов
        updateHud()                  // снапшот для HUD
  return
```

Порядок внутри `engine.run(dt)` задаётся `priority` систем (у `@trixt0r/ecs` — порядок
добавления или поле приоритета) и зафиксирован комментарием. Управление событиями/представлениями
— через EventBus в системах.

## Задачи

| `enemies → drones → pickups → physics → collisions` и т.д. Далее — подшаги.

### 6.1 Порядок систем внутри `engine`
- [x] `WeaponManager` (priority 5) и `PhysicsSystem` (priority 6) зарегистрированы в
      `engine.systems` — оружие спавнит пули, физика их интегрирует и собирает контакты.
      Приоритеты объектов физики (0..4): player/enemies/drones/pickups — вне domains.
- [x] Системы сортируются по возрастанию `priority` (`engine._systems.sort`). Порядок:
      −20 scoring, −15 bonus, −12 shield, −10 countdown, −8 ability, −1 player,
      0..4 сущности, 5 weapons, 6 physics, 7 collisions, 8 spawn, 9 waveFlow,
      10 zone, 11 zoneClamp, 12 loadout.
      Проверено на smoke (волна 1–3, без ошибок).
- [x] Убедиться, что ни одна система не вызывает `engine.run` рекурсивно и не трогает
  `engine.entities` во время итерации (`@trixt0r/ecs` обрабатывает это аккуратно, но
  порядок добавления/удаления проверить). — *проверено на smoke: волна 3–5, без ошибок.*

### 6.2 Презентация — read-only снапшот
- [x] `RenderScene`/`WorldFrame`/HUD строятся **только из компонентов** через read-only
      снапшот-методы `EcsWorld` (`query(...)`/DTO на лету), без записи в legacy-объекты.
      Частицы/кольца (`particles()`/`rings()`) — DTO на лету; `bulletViews`/`particleViews`/
      `ringViews` удалены.
- [x] Убрать `EntityPoolSystem.enemyList/bulletList/...` из `GameRender.renderScene`/`updateHud`
      и `GameFrame.buildWorld` — `entityPool` удалён; читаются геттеры `EcsWorld`.
- [x] `RendererSystem` и рендереры принимают read-only DTO; никакие render-методы не пишут
      в игровое состояние.

### 6.3 Убрать ручные `ctx.*.update(dt)`
- [x] Удалены `weaponManager.update` и `physics.update` из `GameFrame.step` (перенесены
      в `engine.run` — подшаг A). `buildPhysicsEntities` удалён — физика сама собирает тела.
- [x] Удалён `collisionSystem.update` из `GameFrame.step` — коллизии `extends System`
      (priority 7) тикают внутри `engine.run` после физики (6). `buildWorld()` перенесён
      из `GameFrame` в `GameContext.buildWorld()` (единый источник для коллизий и кадра).
- [x] Удалены `waveFlowSystem.updateZoneAndWaves`, `zoneSystem.update` и
      `clampEnemiesToZone` из `GameFrame.step` — весь зонный конвейер теперь `extends System`
      внутри `engine.run(dt)`: `SpawnSystem` (priority 8), `WaveFlowSystem` (priority 9)
      обновляет `zoneState`, `ZoneSystem` (priority 10) клампит игрока/астероиды,
      `ZoneClampSystem` (priority 11) клампит врагов — всё после физики/коллизий (6/7).
      `clampEnemiesToZone()` оставлен как публичный метод `EcsWorld`, но больше не
      вызывается вручную из кадра.
- [x] Удалён `spawnSystem.update` из `GameFrame.step` — `SpawnSystem` теперь `extends System`
      (priority 8) тикает внутри `engine.run(dt)` через `getDeps()` (зона/волна/убитые/игрок).
- [x] Удалён `loadoutSystem.update` из `GameFrame.step` — `LoadoutSystem` теперь `extends System`
      (priority 12) пересобирает HUD-слоты внутри `engine.run(dt)`.
- [x] Удалён `abilitySystem.update` из `GameFrame.step` — `AbilitySystem` теперь `extends System`
      (priority −8, тикает до `playerSystem(-1)` и остальных игровых систем): кулдауны и
      активация способности (Space) идут внутри `engine.run(dt)`. `grant`/`reset`/`getSlots`
      остались публичными методами (выдаются из пикапов/сброса забега), но апдейт кадра —
      внутри `engine.run`.
- [x] Прямые вызовы `countdownSystem.update`, `scoringSystem.updateCombo`,
      `bonusManager.update`, `shieldSystem.update`, `playerSystem.update` уже удалены из
      `GameFrame.step` (этапы 4 и 3) — соответствующие системы переведены на `extends System`
      (−10/−20/−15/−12/−1). `fx.update(dt, dt)` остаётся в фазе презентации (см. 6.4).
- [x] Все эти системы (countdown/scoring/bonus/shield/ability/player) переведены на
      `extends System` (этапы 3–5) и тикают из `engine.run`.
- [ ] `ZoneClampSystem` регистрируется в `engine.systems` (порядок — после физики), а не
      вызывается вручную. Для этого позиции врагов должны интегрироваться в ECS-компоненты
      (этап 5), а не в legacy-мир.

### 6.4 `Countdown`/`Death`/`Menu`/`Debug`
- [x] `fx.update(dt, dt)` остаётся в фазе презентации ПОСЛЕ `engine.run` — `Fx` —
      презентационный слой (тряска экрана + отрисовка частиц/колец из ECS-компонентов);
      его `update` обновляет только shake и вызывается и в игровом кадре, и в меню
      (`updateMenu`), поэтому не является игровой ECS-системой. План, разд. 6.2.
- [x] `CountdownSystem` — ECS-система (`extends System`, priority −10) внутри `engine.run(dt)`;
      `DeathSystem` — осознанно оставлена **FSM-утилитой** в ветке `dying`: она возвращает
      `boolean`, которым `GameFrame` триггерит `death_anim_done` → `over`. Перенос её в
      `engine.run` сломал бы переход смерти, т.к. `engine.run` вызывается только при
      `!isDead` (`dying/over` — freezе комбата). `MenuScene`/`DebugSystem` — презентация/dev-слой.
- [ ] `handleDebugKeys` остаётся (dev-слой), но не входит в игровой апдейт.

### 6.5 `GameContext` (composition root)
- [x] `GameContext` — только регистрация систем в `engine` и передача зависимостей.
- [x] `ctx.ecs` — единственный публичный игровой API; `ctx.entityPool` удалён
      (все его методы/геттеры переехали в `EcsWorld` на этапах 1–5).
- [x] `rendererSystem.config` не держит legacy-полей с данными (`asteroidList` и т.п.) —
      пояса/частицы/кольца читаются из компонентов через `EcsWorld`; `config` содержит
      только презентационные зависимости для отрисовки (`fx`, `starfield`, `asteroidField`,
      `riftField`), каждая из которых рисует из компонентов.

## Gate этапа 6

- [x] `GameFrame.step()` не содержит ни одного `ctx.<legacySystem>.update(dt)`.
- [x] Весь игровой апдейт идёт через `engine.run(dt)`.
- [x] `ctx.entityPool` удалён; `RenderScene`/HUD строятся из read-only снапшота.
- [ ] `ZoneClampSystem` зарегистрирован и тикает из `engine.run` после физики.
- [ ] `typecheck`/`lint`/`build` зелёные; smoke-тест идентичен этапу 5.