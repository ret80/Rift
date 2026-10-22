# Арсенал — сводка изменений

> Дата: 2026-10-22  
> Краткий обзор всех правок по задаче улучшения арсенала

## Новые файлы
| Файл | Описание |
|---|---|
| `src/game/systems/GrazeCollision.ts` | Swept-проверка попаданий/грейза, утилита `distanceToSegment`, тип `PlayerHitbox` |
| `src/game/systems/GrazeSystem.ts` | Система грейза и импульса от касаний, множитель скорости от импульса |
| `src/game/weapons/WeaverWeapon.ts` | Оружие «Ткань Пространства» — генерация нитей по траектории |
| `src/game/abilities/Ability.ts` | Контракт активной способности |
| `src/game/abilities/QuantumSwapAbility.ts` | Способность «Телепорт-Подмена» |
| `src/game/abilities/AbilityRegistry.ts` | Реестр способностей |
| `src/game/abilities/AbilitySystem.ts` | Система способностей, активация по Space, слоты HUD |

## Ключевые правки

### Баланс и типы
- `src/game/types.ts` — `Bullet.r`, `EBullet.px/py/grazed`, `WeaveThread`, `Enemy.baseSpeed/slowT`
- `src/game/balance/player.ts` — константы грейза/фантомного хитбокса/твёрдых снарядов/weaver/quantum swap, добавлен `PLAYER_HIT_INVULN`
- `src/game/upgrades.ts` — новые линии прокачки, миграция `dashCooldown`→`dashDuration`, перерасчёт экономики
- `src/game/core/EventBus.ts` — события `bullet_grazed`, `bullet_intercepted`, `score_added`
- `src/game/balance/drops.ts` — добавлен `quantum_swap` в `PickupKind`/`ALL_PICKUP_KINDS`

### Системы коллизий и физики
- `src/game/systems/CollisionSystem.ts` — грейз + попадания по кольцевому хитбоксу, перехват твёрдых снарядов, `weaveCollisions()`
- `src/game/systems/BulletCollision.ts` — swept-проверка вражеских пуль, перехват `checkBulletInterceptions()`
- `src/game/systems/BulletSystem.ts` — сохранение `px/py` для swept-проверки
- `src/game/systems/EnemySystem.ts` — применение замедления от нитей к `enemy.speed`
- `src/game/systems/EntityPoolSystem.ts` — инициализация `EBullet.px/py/grazed/r`, пул `weaveList`
- `src/game/systems/CollisionConstants.ts` — удалён мёртвый `HIT_RADIUS_OFFSET`
- `src/game/systems/ScoringSystem.ts` — подписка на `score_added`

### Оружие и апгрейды
- `src/game/weapons/Weapon.ts` — `WeaponId` включает `weaver`, `WeaponContext.weaves`, `WeaponModifiers.solidRadius`, `usesSolidUpgrade`
- `src/game/weapons/WeaponManager.ts` — `getWeaves()` в world, применение `solidRadius` для `usesSolidUpgrade`
- `src/game/weapons/WeaponRegistry.ts` — регистрация `WeaverWeapon`
- `src/game/weapons/CannonWeapon.ts`, `MissileWeapon.ts` — поддержка твёрдых снарядов
- `src/game/weapons/DroneWeapon.ts` — без поддержки твёрдых снарядов
- `src/game/systems/PlayerSystem.ts` — `getMomentumMult`, `setSpeedMult`, `setCoreRadius`, `teleportTo()`, `PLAYER_HIT_INVULN` при попадании
- `src/game/systems/PlayerMovement.ts` — `speedMult` применяется к скорости
- `src/game/systems/PlayerState.ts` — поле `core`

### Бонусы, пикапы, HUD
- `src/game/systems/ApplyPickupSystem.ts` — обработка `weaver` и `quantum_swap`, делегирование пикапов
- `src/game/systems/PickupDropSystem.ts` — `weaver`/`quantum_swap` в дропе Carrier
- `src/game/loadout/bonuses/DashBonus.ts`, `BonusManager.ts` — `dashDurationMult` реально работает
- `src/game/loadout/LoadoutTypes.ts`, `LoadoutSystem.ts` — слот способности
- `src/game/input.ts` — `consumePress()` для одиночных нажатий

### Рендер и UI
- `src/game/systems/RendererSystem.ts` — `phantomLevel`, `weaves`, отрисовка нитей
- `src/game/systems/Renderers/BulletRenderer.ts` — рендер твёрдых снарядов
- `src/game/systems/Renderers/PlayerRenderer.ts` — фантомный хитбокс
- `src/game/systems/Renderers/PickupRenderer.ts` — пикапы `weaver`/`quantum_swap`
- `src/ui/components/Icon.tsx` — иконки новых апгрейдов/оружия/способности
- `src/ui/UpgradeScreen.tsx` — описание новых апгрейдов
- `src/i18n.ts` — локализация RU/EN

### Оркестратор
- `src/game/game.ts` — интеграция GrazeSystem/AbilitySystem, грейз/импульс, weaves в коллизиях/рендере, `pickup_collected` → применение пикапов, прокидка апгрейдов

## Верификация
- `npm run typecheck` — ✅ чистый
- `npm run lint` — ✅ 58 ошибок (baseline, новых не добавлено)
- `npm run check:i18n` — ✅ 152 ключа в каждом словаре (увеличился с 142)
