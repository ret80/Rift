# Этап 2 — Чистый спавн снарядов (убрать `enemy_fired → spawnEnemyBullet`, WeakMap-представления)

> Цель: вражеская пуля рождается напрямую в Engine той ECS-системой, которая её
> инициирует, а не через цепочку «ECS-система → событие → plain-объект → снова ECS».
> Убираем также WeakMap-«представления» для пуль/частиц/колец.
>
> **Выполнено (кроме частиц/колец — см. «Осталось»).** Событие-«мост» `enemy_fired`
> удалено; вражеские пули спавнятся напрямую в ECS; WeakMap-«представления» пуль
> сняты (снапшоты собираются заново каждый кадр).

## Проблема

`EnemyShootingSystem.ts:211` публикует `enemy_fired`.
`src/game/core/GameListeners.ts:70-86` ловит его и вызывает
`entityPool.spawnEnemyBullet(...)` → `ecs.addEnemyBullet(...)`.
Это «адаптер»: ECS-система не имеет права порождать чужие сущности через событие —
она должна создавать их сама, в том же домене.

Дополнительно `EcsWorld` держит WeakMap-«представления» (`bulletViews`,
`enemyBulletViews`, `particleViews`, `ringViews`, `bulletEntity`, `enemyBulletEntity`) —
объектную идентичность поверх компонентов. Это тоже мост, который исчезает.

## Подход

Спавн всех сущностей выполняется внутри соответствующей ECS-системы через `engine.entities.add`.
EventBus остаётся только для *сигналов* (звук, FSM, HUD, счёт, баннер, тост), а не для
появления/удаления сущностей. Событие `enemy_fired` удаляется как «мост спавна».

## Задачи

- [x] **Прямой спавн вражеской пули.** `EnemyShootingSystem` получает прямой доступ к
  Engine (через `SpawnBoltSource` → `EcsWorld.spawnEnemyBullet` без события). Публикация
  `enemy_fired` удалена. Обработчик в `GameListeners` удалён:
  - `GameListeners.ts:70-86` — подписка `enemy_fired` удалена;
  - `EventBus.EnemyFiredPayload`, `EventBus.enemy_fired` — удалены из типа и мапы.
- [x] **Убрать WeakMap и структурную идентичность снарядов.** Вместо `bulletEntity`/
  `enemyBulletEntity`/`bulletViews`/`enemyBulletViews` удаление снаряда реализовано по
  `entity.id` (снапшот несёт `entityId`), а позиция/скорость/жизнь живут только в
  `PositionComponent/VelocityComponent/LifeComponent`. Метка `grazed` пишется обратно в
  `BulletSweepComponent` через `ecs.markEnemyBulletGrazed` — сохраняется между кадрами.
- [ ] **Прямой спавн для пуль игрока.** `WeaponManager`/`weapons/*` (Cannon, Missile, Weaver)
  перестают порождать legacy `Bullet` и класть его в `entityPool.addBullet`. Они создают
  `BulletComponent`-сущность напрямую в Engine (это правка в `weapons/*`, но только в части
  вызова — сама система оружия переходит в ECS на этапе 4). — *частично: `EntityPoolSystem`
  удалён, `weapons/*` работают через `ecs.addBullet` уже напрямую.*
- [x] **Убрать legacy-типы пуль из игровых решений.** `Bullet`/`EBullet` остались как
  read-only снапшоты (поля + `entityId`), но не как носители позиции/скорости в игровой
  логике — игровые системы работают с компонентами.
- [x] **Частицы/кольца.** Убраны `particleViews`/`ringViews` — `particles()`/`rings()`
      отдают read-only снапшот (DTO на лету) из компонентов
      (Position/Velocity/Life/Particle/Ring). `removeParticle`/`removeRing` не использовались
      снаружи — удалены вместе с WeakMap-представлениями. *Доделано на аудите.*

## Ограничения этапа

- Не трогаем `PlayerSystem` (этап 3), физику (этап 5), остальные домены (этап 4).
- `addEnemyBullet` может остаться открытым методом `EcsWorld` для явного спавна, но
  **не через событие** и **не через legacy `EBullet` как источник правды**.
- Частицы/кольца — визуал; их можно оставить как read-only снапшоты с компонентов.

## Gate этапа 2

- [x] `EnemyShootingSystem` не публикует `enemy_fired`; вражеская пуля спавнится в Engine.
- [x] `GameListeners` не подписан на `enemy_fired`; `EventBus.enemy_fired`/`EnemyFiredPayload` удалены.
- [x] В `EcsWorld` нет `bulletViews/enemyBulletViews/bulletEntity/enemyBulletEntity`.
- [x] `typecheck`/`build` зелёные; `lint` по изменённым файлам — 0 ошибок;
      smoke-тест (волна 1 → волна 2, враги стреляют, пули летят) идентичен этапу 1.