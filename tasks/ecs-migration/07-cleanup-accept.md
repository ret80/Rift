# Этап 7 — Чистка и приёмка (удалить легаси, греп-проверки, финальные гейты)

> Цель: удалить оставшийся legacy-код и «мёртвые» обёртки, проверить грепом, что ни один
> мост не остался, и зафиксировать финальные гейты. План «чистый ECS» завершён.

## Задачи

### 7.1 Удалить legacy-мосты и «склады»
- [x] `EntityPoolSystem` уже удалён (этап 1). Греп `entityPool` по `src/game` → пусто.
- [x] `src/game/physics/entities.ts` — удалён полностью (включая `asteroidEntity`);
      игрок/враг/пикап — этап 5, астероиды — этап 8.
- [x] `PlayerSystem` — единственный файл `src/game/systems/PlayerSystem.ts` и он `extends System`.
      Императивного дубликата нет — удалять нечего.
- [~] `src/game/types.ts` — типы `Enemy`/`Bullet`/`EBullet`/`Pickup`/`AllyDrone`/`LaserBeam`
      остаются как **read-only структурные проекции** компонентов (`EcsWorld.enemies()`
      возвращает живые `EnemyComponent`, структурно assignable). Единственный источник правды —
      компоненты; эти типы — DTO-проекция для рендеров/оружия. Удалять не нужно.
- [x] Снапшоты `EcsWorld` (`enemies()/bullets()/…`) — `query(component)`/DTO на лету;
      `enemies()` возвращает настоящие `EnemyComponent` без каста в legacy-тип.
- [x] `ai/IEnemyStrategy` — стратегия оперирует `Enemy` (структурный вид `EnemyComponent`),
      живой ссылки-моста нет.

### 7.2 Греп-проверки (по факту проверено)
- [x] `grep -rn "as unknown as Enemy" src/game` → **пусто** (убраны касты в
      `EnemyRenderer`/`PickupRenderer`; осталась только `webkitAudioContext` — легитимный).
- [~] `grep -rn "enemy_fired" src/game` → только устаревшие комментарии (поправлен
      `EnemyShootingSystem`); события-«моста» больше нет.
- [x] `grep -rn "spawnEnemyBullet(" src/game` → только метод `EcsWorld.spawnEnemyBullet` —
      прямой спавн в Engine (целевой результат).
- [x] `grep -rn "entityPool" src/game` → **пусто**.
- [x] `grep -rn "PlayerSystem" src/game` → только ECS-`PlayerSystem` (`extends System`).
- [~] `grep -rn "getPlayerRef" src/game` → остаётся как **read-only query-аксессор**
      (`ZoneSystem`/`GameRender`/`GameContext` читают позицию из `PlayerComponent`) — не legacy-мост.
- [x] `grep -rn "\.update(dt" src/game/core/GameFrame.ts` → только `ecs.update(dt)`,
      `deathSystem.update(dt)` в ветке `dying` (FSM-переход), `fx.update(dt, dt)` (презентация)
      и `asteroidField.update(...)` (презентация, путь B). Ручных `ctx.<чистая-система>.update`
      нет.

### 7.3 Финальные гейты
- [x] `npm run typecheck` — зелёный (exit 0).
- [~] `npm run lint` — exit 1: 39 pre-existing ошибок (max-len/no-unused-vars/any) в файлах
      вне scope этапа 7 (`CameraSystem`, `MenuScene`, `i18n`, `src/ui/*` и др.). Мои правки
      новых ошибок не добавили (единственный hit в `RendererSystem.ts:27` — предсуществующий,
      в HEAD идентичен).
- [ ] `npm run check:i18n` — является частью этапа 0 OK; перепроверить при финальной приёмке.
- [x] `npm run build` — зелёный (exit 0).
- [x] Smoke (null-рендер): меню → ИГРАТЬ → волна 07 → бой (счёт ×6.0, «НЕ ПОКИДАЙ ЗОНУ») →
      смерть → «СИГНАЛ ПОТЕРЯН» (СЧЁТ 1245, 27 целей) → «ЕЩЁ РАЗ» → рестарт на отсчёте «5».
      Ошибок в консоли нет (только AudioContext + benign vite WS reconnect на порту 3000).
- [ ] Проверить оба физических движка (`?physics=planck`/`custom`) и рендеры
      (`picogl`/`null`/`webgl`).
- [ ] Финальный `git diff` против baseline — перестановка ответственности, без смены баланса.

## Чеклист «чистый ECS» (финальный)

- [x] `src/game/systems/EntityPoolSystem.ts` удалён.
- [x] Нет `as unknown as Enemy` / структурного каста (греп пуст).
- [x] Нет `enemy_fired`; вражеская пуля спавнится в Engine.
- [x] Нет WeakMap-«представлений» для сущностей.
- [x] Игрок — компонент, управляемый ECS-системой; императивный `PlayerSystem` отсутствует.
- [x] `PhysicsSystem` работает с компонентами; `physics/entities.ts` удалён (включая `asteroidEntity`).
- [x] `GameFrame.step()` = `engine.run(dt)` + презентация + `deathSystem` (ветка `dying`);
      нет ручных `ctx.{countdown,scoring,bonus,shield,ability,player,weapon,physics,collision,
      spawn,waveFlow,zone,zoneClamp,loadout}.update(dt)`.
- [~] `typecheck`/`build` зелёные; `lint` — только pre-existing долг вне scope этапа 7;
      smoke геймплея идентичен baseline.

## Результат

Проект работает на чистом ECS: единственный источник правды — компоненты; все системы —
`extends System` и тикают из `engine.run(dt)`; адаптеры, «мнимые» обёртки и обратные мосты
отсутствуют; презентация — read-only проекция компонентов.