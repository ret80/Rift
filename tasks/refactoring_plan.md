# План рефакторинга Rift

> Основан на анализе кода. ECS-планы в `tasks/ecs_*.md` рассматривать как дизайн-доки, в проекте нет `src/game/ecs/`. Цель — улучшить поддерживаемость без крупных архитектурных переписываний ради переписываний.

## 1) Критичные баги (исправить в первую очередь)

| Проблема | Файлы | Описание | Предложение |
| --- | --- | --- | --- |
| Враги не масштабируются по волне | `src/game/systems/EnemySystem.ts`, `src/game/systems/EnemyShootingSystem.ts`, `src/game/systems/WaveOrchestrator.ts`/`src/game/game.ts` | `setWave()` есть, но нигде не вызывается. `EnemySystem.reset()` выставляет `wave=1`. `EnemyShootingSystem` тоже держит `wave=1`. В следствии урон/скорострельность/точность врагов и их HP не растут. | Подключить проброс волны из `WaveOrchestrator` (или `Game`) в оба модуля при старте волны/переходе. Найти место, где меняется текущая волна, и вызвать `enemySystem.setWave(wave)` и `enemyShootingSystem.setWave(wave)`. Также проверить `EnemySystem.createEnemy` использует `enemyDefFor(kind, wave)` — сейчас работает, но при текущем состоянии `wave` всегда 1. |
| Дебаг-покупка апгрейда не работает | `src/game/game.ts:778-790`, `src/game/systems/UpgradeSystem.ts:69-72`, `src/ui/UpgradeScreen.tsx:140` | `Game.purchaseUpgradeNoCost()` вызывает `UpgradeSystem.purchaseNoCost()` который всегда возвращает `false`. UI считает успехом только `true`. | Либо реализовать безопасный дебаг-путь (только в dev), либо убрать/переименовать метод. Если нужен дебаг — добавить `addParts` + покупку через обычный механизм или флаг `__DEV__`. Не оставлять обманный метод, возвращающий false. |
| Жёстко захардкоженный magic-число `5` | `src/App.tsx:222,293,308,346`, `src/game/balance/waves.ts:151`, `src/game/systems/SpawnSystem.ts:146`, `src/game/systems/CountdownSystem.ts:58` | Код считает, что "все враги включены" если `enabledEnemies.length === 5`. При изменении состава `EnemyKind` сломается. | Вычислять через `Object.keys(EnemyKind).length` или хранить `ENEMY_KIND_COUNT`, либо проверять равенство с полным списком. В `SpawnSystem`/балансе — по смыслу "если пустой/не задан — все". |

## 2) Удаление мёртвого кода/зависимостей

| Цель | Файлы | Действие |
| --- | --- | --- |
| Неиспользуемые зависимости | `package.json` | Удалить `kinetics.ts`, `canvas-confetti`, `framer-motion`, `lucide-react`. `@dnd-kit` не используется и не объявлен — либо добавить при реальной потребности, либо игнорировать. |
| Мёртвые поля/методы | `src/game/systems/SpawnSystem.ts` (hooks/fx/audio поля, обёртки `waveTotalCount/zoneRadius/pickKind`), `src/game/systems/PlayerState.ts` (`@deprecated getRenderState`), `src/game/systems/CollisionConstants.ts` (`BULLET_DAMAGE_ASTEROID`), `src/game/systems/EnemySystem.ts` (`lerpAngleAngle`), `src/game/systems/CountdownSystem.ts` (alias/showBanner/showToast/reset), `src/game/systems/UpgradeSystem.ts` (`persistUpgrades` обёртка, не используется), `src/game/systems/ScoringSystem.ts` (`ScoringHooks.onNewBest` не используется), `src/game/systems/DeathSystem.ts` (`isDying`, хардкод `wave 0` + `addParts(0)` хак), `src/game/rifts.ts`/`src/game/systems/Renderers/RiftAnimation.ts` (`anyPending/clear` не используются), `src/game/balance/player.ts` (`PLAYER_ACCEL`, `DASH_ACCEL`, `DASH_SPEED`, `DASH_DMG` не используются), `src/game/weapons/Weapon.ts` (deprecated `PlayerBonuses` re-export), `src/game/systems/UpgradeSystem.ts` (неиспользуемый код) | Снять немедленно по правилам проекта. Перед удалением грепнуть использования. |
| Неиспользуемые импорты/линт-проблемы | `src/App.tsx`, `src/ui/*`, `src/game/systems/*` (много `max-len` из eslint) | Исправить по мере правок. Часть может автоисправиться, но есть ручные (длинные строки). |

## 3) God-объекты и декомпозиция

| Объект | Проблема | Предложение |
| --- | --- | --- |
| `src/game/game.ts` (942 строки) | Оркестратор разросся, много приватных полей, `handleDebugKeys` делегирует, но остальное связано плотно. `purchaseUpgradeNoCost` обманка. | Выделить инициализацию: `GameBootstrap`/фабрика для сборки систем с зависимостями. Снизить прямые мутации. `purchaseUpgradeNoCost` либо реализовать либо удалить. |
| `src/App.tsx` (566 строк) | Большой компонент, дубли `resetGameState`, магическое `5`, прямая работа с `game` объектом. | Разбить на хуки (`useGame`, `useGameLoop`, `useUIState`), вынести константы (`ENEMY_COUNT`), убрать дублирование сброса. |
| `src/game/systems/RendererSystem.ts` (260) | 18 позиционных параметров в `render()`, `unknown[]`, `as any`, рендереры кастуют сущности. | Ввести `RenderFrame` тип/интерфейс с группами `{player, enemies, bullets, ebullets, pickups, drones, zone, camera, meta}`. Каждый билдер уже есть — собрать объект вместо горы аргументов. Убрать `as any` где возможно, типизировать через существующие типы. |
| `src/game/systems/SpawnSystem.ts` (443) | Смешивает размещение, спавн волн, анонсы, математику. Много неиспользуемых полей/обёрток. | Разбить на `SpawnPlacer` (позиционирование), `WaveSpawner` (логика волн), `SpawnAnnouncer` (тосты/баннеры). Упростить после удаления мёртвого кода. |

## 4) Дублирование логики

| Дублирование | Файлы | Предложение |
| --- | --- | --- |
| Убийство врагов/урон | `src/game/systems/CollisionSystem.ts`, `src/game/systems/BulletCollision.ts`, `src/game/systems/EntityCollision.ts` | Консолидировать логику нанесения урона/убийства/дропа в одном месте (например `DamageResolver`). Сейчас правила размазаны. |
| Столкновения астероидов | `src/game/asteroids.ts`, `src/game/systems/CollisionSystem.ts` | `AsteroidField.update()` уже обрабатывает астероид-астероида; `CollisionSystem` тоже трогает астероиды. Выбрать единую ответственность (либо физика в `AsteroidField`, либо в `CollisionSystem`) и убрать дубли. |
| Толкание/отталкивание в зоне/астероидах | `src/game/asteroids.ts`, `src/game/systems/ZoneSystem.ts` | Общую механику "push" вынести в утилиту. |
| Рендер разломов | `src/game/rifts.ts`, `src/game/systems/Renderers/RiftAnimation.ts` | `RiftField.draw()` использует свой рендер, `RiftAnimation` только для меню. Уточнить назначение, убрать неиспользуемое (`anyPending/clear`), возможно унифицировать. |
| AI-избегание/поворот | `src/game/ai/strategies/*.ts` (особенно `DroneStrategy.updateNormal`/`updateAttacking` почти идентичны) | Вынести общие блоки в хелперы (`avoidObstacles`, `faceTarget`, `steer`). Убрать устаревшие комментарии. |
| Камера API | `src/game/core/Camera.ts`, `src/game/systems/CameraSystem.ts` | Много неиспользуемых методов (`worldToScreen`, `screenToWorld`, `isVisible`, `applyTo`, `setZoom` частично). Либо использовать, либо удалить. `CameraSystem` использует сглаживание — константа `FPS_SMOOTHING_FACTOR` используется некорректно для follow (проверить). |

## 5) Типизация, API, стиль

| Проблема | Файлы | Предложение |
| --- | --- | --- |
| Сырые типы в рендере | `RendererSystem.ts` | Заменить `unknown[]` на конкретные типы сущностей (`Enemy[]`, `Bullet[]`, etc.). Убрать `as any`. |
| Магические числа | `App.tsx` (`5`), `DeathSystem.ts` (`0`), `PickupDropSystem.ts` (хардкод) | Вынести в константы/баланс. |
| Дублирование формул апгрейдов | `src/ui/UpgradeScreen.tsx`, `src/game/upgrades.ts` | UI не должен дублировать формулы — брать из `upgrades.ts` (цены/эффекты). Сейчас легко рассинхронизируется. |
| Re-exportы и deprecated | `src/game/weapons/Weapon.ts` | Убрать `PlayerBonuses` re-export после миграции всех импортов. |
| Линт | Много `max-len` | Исправить длинные строки, не breaking. |

## Порядок выполнения (итеративный)

1. **Подготовка**: прогнать `npm run typecheck && npm run lint && npm run check:i18n`. Зафиксировать baseline.
2. **Критичные баги**: проброс `setWave` в `EnemySystem`/`EnemyShootingSystem` из `WaveOrchestrator`/`Game`. Исправить магическое `5` на вычисляемое. Решить вопрос с `purchaseUpgradeNoCost` (убрать или реализовать).
3. **Мёртвый код**: удалить неиспользуемые поля/методы/импорты, удалить неиспользуемые deps из `package.json`. После каждого блока — typecheck.
4. **Дублирование**: консолидировать коллизии/урон, астероид-астероида, рифт-рендер при необходимости. Упростить AI-хелперы.
5. **Декомпозиция**: `RendererSystem` (RenderFrame), по возможности `SpawnSystem`, `Game` bootstrap. `App.tsx` хуки — аккуратно.
6. **Типизация/линт**: убрать `any/unknown`, пофиксить `max-len`. Финальная проверка.

## Верификация
- `npm run typecheck`
- `npm run lint` (стремиться к 0 ошибок; warnings минимизировать)
- `npm run check:i18n`
- Ручной плейтест: новая игра, переход волн (проверить рост HP/урона врагов), покупка апгрейдов, смерть/рестарт, меню, тач-контролы.

## Риски
- Неправильный проброс `setWave` — нужно найти единственный источник правды по волне (у `WaveOrchestrator` есть `wave`). 
- Консолидация коллизий может изменить порядок обработки — тестировать.
- Удаление "кажется неиспользуемого" — полагаться на grep, не на догадки.
- `RendererSystem` рефактор — много call sites в `Game`, править аккуратно.

## Примечания по проектным правилам
- Удалять мёртвый код сразу, без закомментированных блоков.
- Комментарии/JSDoc на русском, идентификаторы на английском.
- Рефакторить напрямую, не городить адаптеры там, где можно починить.
- Сохранять стиль и паттерны проекта.
