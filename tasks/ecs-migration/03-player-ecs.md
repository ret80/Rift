# Этап 3 — Игрок на ECS (`PlayerComponent` + ECS-система, вместо императивного `PlayerSystem`)

> Цель: игрок становится полноценной сущностью, управляемой `extends System`-системой.
> `PlayerComponent.state` — единственный источник правды; императивный `PlayerSystem`
> удаляется.
>
> **Выполнено.** `PlayerSystem` переписан как `extends System`, зарегистрирован в
> `engine.systems` и тикает внутри `engine.run(dt)`; ручной вызов из `GameFrame.step()`
> убран. Состояние игрока — по-прежнему `PlayerComponent.state` (живая ссылка).

## Проблема

`EcsWorld.registerPlayer()` (`EcsWorld.ts:500-508`) создаёт сущность с
`PlayerComponent(state)`, но состояние двигает императивный класс
`src/game/systems/PlayerSystem.ts` (без `extends System`), который читает `InputManager`,
`Fx`, `ShieldSystem` и мутирует `PlayerState`. То есть `PlayerComponent` — «склад», а
управление игроком — старый код.

## Подход

Переносим всю логику игрока (движение, угол, неуязвимость, скорость-мультипликатор,
урон, лечение, телепорт) в `PlayerSystem extends System`. `PlayerSystem` читает
`PlayerComponent.state` и мутирует его; больше нет отдельного `PlayerState`, который
держится вне компонента. Ввод (`InputManager`) и урон приходят через зависимости системы
или события — но не через legacy-класс.

## Задачи

- [x] **Перенести движение.** `updateMovement(state, dt, ax, ay, fx, ...)` остался чистым
  модулем `src/game/systems/PlayerMovement.ts`; `PlayerSystem.process(dt)` берёт
  `PlayerComponent.state`, читает ось ввода, применяет ускорение/трение/ограничение
  скорости/угол и пишет результат в компонент. Учитывается `integratePosition` — флаг
  физики приходит из `PlayerIntegrateSource` (`() => !physics.integratesPositions`).
- [x] **Перенести урон/лечение/неуязвимость.** `hit(dmg)`, `heal(amount)`, защита щитом
  внедрены в `PlayerSystem`; события `player_damaged`/`drone_push_player` подписаны в
  системе. `invuln`-таймер уменьшается в `process`.
- [x] **Перенести настройки.** `setMaxHp`, `resetHp`, `setSpeedMult`, `setShield`,
  `teleportTo` — методы `PlayerSystem`, работающие с компонентом.
- [x] **Удалить `PlayerState` как standalone-источник.** Состояние живёт в
  `PlayerComponent.state`; `createPlayerState`/`resetPlayerState` остаются фабрикой
  значений для компонента. (Императивный `PlayerSystem` без `extends System` удалён,
  класс переписан на ECS.)
- [x] **Проверить всех потребителей `playerSystem.*`** (`GameContext`, `GameRender`,
  `GameFrame`, `CollisionSystem`, `ZoneSystem`, `WeaponManager`, `AbilitySystem`,
  `WaveOrchestrator`, `CountdownSystem`, `DeathSystem`, `GrazeSystem`): публичный API
  `getPlayerRef()/getPosition()/getHp()/getMaxHp()/teleportTo()/setMaxHp()/resetHp()/
  setSpeedMult()/setShield()/hit()/heal()` сохранён, поэтому потребители не менялись.
- [x] `Fx`-эффекты при движении: `PlayerSystem` принимает `Fx` через границу системы
  (не legacy-класс), эффекты остаются презентацией.

## Ограничения этапа

- Не трогаем физику (этап 5), оружие/дронов (этап 4), волну/счёт (этап 4), коллизии
  (этап 4). `getPlayerRef()` может временно работать через `ecs.playerComponent()`.
- `PlayerState`-интерфейс может остаться как тип данных компонента, но не как отдельный
  императивный носитель.
- `EventBus.player_damaged` оставляем (это сигнал для щита/звука/FSM), но урон в компонент
  пишет сама ECS-система игрока.

## Gate этапа 3

- [x] `PlayerSystem extends System` зарегистрирован в `engine.systems` и тикает `engine.run`.
- [x] `PlayerComponent.state` — единственный источник позиции/HP/скорости/угла/инвулна.
- [x] Императивный `PlayerSystem` (без `extends System`) удалён; `getPlayerRef()` работает
      через состояние из компонента (публичный API сохранён).
- [x] `typecheck`/`build` зелёные; `lint` по изменённым файлам — 0 ошибок;
      smoke-тест (волна 1 → 3, движение, урон/щит через события) идентичен этапу 2.