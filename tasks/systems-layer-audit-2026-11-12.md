# Аудит слоя `src/game/systems/` — что действительно стоит переводить на ECS

> Дата: 2026-11-12
> Цель: проверить предварительный вывод по 10 оставшимся файлам `src/game/systems/`,
> отделить доменные модели/презентацию от ECS и внести только те изменения,
> которые улучшают архитектуру. Поведение и баланс не меняются.

## 1. Итог аудита

Предварительный вывод был частично верен, но три пункта требуют коррекции.

| Файл | Предварительно | Проверка | Решение |
|---|---|---|---|
| `AudioManager` | оставить | Инфраструктурный сервис звука, не оперирует сущностями | **Оставить** (не ECS) |
| `CameraSystem` | оставить | Презентационная камера, одно состояние на сцену | **Оставить** (не ECS) |
| `CreditSystem` | оставить | Мета-экономика между забегами, не тикает покадрово | **Оставить** (не ECS) |
| `DebugSystem` | оставить | Отрисовка debug-оверлея | **Оставить** (не ECS) |
| `InputSystem` | оставить | DOM-ввод, не игровая симуляция | **Оставить** (не ECS) |
| `UpgradeSystem` | оставить | Доменная модель прокачки забега | **Оставить** (не ECS) |
| `PickupEffects` | оставить сервисом | Доменный сервис эффектов пикапа | **Оставить** (не ECS) |
| `RendererSystem` (+ `Renderers/`) | в presentation | Презентационный координатор; `RenderScene` уже собирается из ECS-refs | **Перенести в `presentation/`**, DTO оставить |
| `WaveOrchestrator` | перевести на ECS | Доменный координатор singleton-состояния волны/зоны; уже управляется `WaveFlowSystem` | **Перенести в `waves/`**, не делать ECS-системой |
| `DeathSystem` | разбить на DeathComponent + систему | Симуляция намеренно не тикает в `dying`/`over` | **Оставить lifecycle-сервисом** |

## 2. Почему коррекция, а не следование исходному выводу

### 2.1 `WaveOrchestrator` — это домен, а не ECS-система

`WaveOrchestrator` не обрабатывает сущности: он владеет singleton-состоянием
волны и зоны (`WaveStateMachine`, `ZoneModel`) и вызывает политики
`ZoneEdgeDamage`/`ZoneStorm`. Покадровый вход у него уже один — ECS-система
`WaveFlowSystem`, которая передаёт `dt`, позицию игрока и состояние отсчёта.
`ZoneEdgeDamage` и `ZoneStorm` — это чистые политики над состоянием зоны и
позицией игрока, а не системы сущностей.

Перенос их в `PhasedSystem` без компонентов дал бы «псевдо-ECS»: системы без
запросов к сущностям, размазанное по расписанию состояние волны и лишнюю
связанность. Вместо этого координатор переносится в доменный пакет
`src/game/waves/` — ближе к моделям, которыми он управляет.

### 2.2 `RendererSystem` — презентация, но не прямой читатель ECS

`RendererSystem` уже получает `RenderScene` — view-model, собранную в
`GameRender` из `WorldFrame`/ECS-refs. Делать рендерер зависимым от `EcsWorld`
не нужно: это развернуло бы зависимость «презентация → симуляция» и ухудшило
тестируемость. Правильное изменение — перенести координатор и рендереры в
`src/game/presentation/`, сохранив границу `RenderScene`/`RenderFrame`.

### 2.3 `DeathSystem` — lifecycle-сервис, а не ECS-система

`GameWorld.tick` намеренно не вызывает `ecs.update` в состояниях `dying`/`over`
(см. `GameWorld.tick`). `DeathSystem.update` обслуживает переход `dying → over`
в `PresentationFrame` и возвращает boolean для FSM. `DeathComponent` + ECS-система
потребовали бы гонять симуляцию после смерти, что рискует «сиротскими» пулями и
меняет FSM-контракт. Разбиение не даёт выигрыша — оставляем сервис.

### 2.4 Остальные шесть + `PickupEffects`

Ни один из них не является системой сущностей: это инфраструктура (звук, ввод),
презентация (камера, debug) или доменные модели (кредиты, прокачка, эффекты
пикапов). Переводить их в ECS — искусственно.

## 3. План изменений

### 3.1 Перемещения (без изменения логики)

- [x] `src/game/systems/WaveOrchestrator.ts` → `src/game/waves/WaveOrchestrator.ts`
- [x] `src/game/systems/RendererSystem.ts` → `src/game/presentation/RendererSystem.ts`
- [x] `src/game/systems/Renderers/` → `src/game/presentation/Renderers/`

### 3.2 Обновление импортов

- [x] `WaveOrchestrator`: `../waves/*` → `./*` (модели теперь соседи)
- [x] `GameWorld`, `GameContext`, `WaveFlowSystem`, `sim/selftest`:
      `systems/WaveOrchestrator` → `waves/WaveOrchestrator`
- [x] `RendererSystem`: `../presentation/menu/types` → `./menu/types`
- [x] `GameContext`, `presentation/menu/MenuScene`: `systems/RendererSystem` →
      `presentation/RendererSystem`
- [x] `types/render`, `ui/components/EnemySprite`: `systems/Renderers/*` →
      `presentation/Renderers/*`

### 3.3 Документация

- [x] Дополнить `tasks/ecs-migration/STATUS.md` записью о новом слое.
- [x] Отметить выполненные пункты этого плана.

## 4. Гейты проверки

- [x] `npm run typecheck` — exit 0
- [x] `npm run build` — exit 0
- [x] `npm run lint` — без новых ошибок
- [x] Симуляции (`campaign-orbit`, `smoke`, `inner-orbit`, `rim-orbit`,
      `fighter-orbit-r300`, seed 12345): `scenarioHash` и метрики совпадают
      с baseline бит-в-бит

## 5. Что осознанно не делаем

- Не переводим `WaveOrchestrator`, `ZoneEdgeDamage`, `ZoneStorm` в ECS-системы:
  это singleton-политики, а не системы сущностей.
- Не разбиваем `DeathSystem` на `DeathComponent` + систему: ECS не тикает в
  `dying`/`over` по замыслу.
- Не связываем `RendererSystem` с `EcsWorld` напрямую: сохраняем `RenderScene`
  как границу презентации и симуляции.
