# Реализация арсенала — спецификация

> Дата: 2026-10-22  
> Файлы реализации, новые системы, интеграция

## 1. Фундаментальные механики

### 1.1. Грейз (касание) — `GRAZE_*`
**Файлы:** `src/game/systems/GrazeCollision.ts` (новый), `src/game/systems/GrazeSystem.ts` (новый), `src/game/systems/BulletCollision.ts`, `src/game/systems/CollisionSystem.ts`, `src/game/core/EventBus.ts`

- **Событие:** `bullet_grazed { count, x, y }`
- **Swept-проверка:** вражеские пули проверяются по отрезку движения `px,py -> x,y` (устраняет прохождение сквозь хитбокс между кадрами)
- **Грейз-полоса:** `GRAZE_BAND = 22` за внешней границей хитбокса
- **Очки:** `GRAZE_SCORE = 12` за касание
- **Импульс:** `GRAZE_IMPULSE_PER_GRAZE = 0.08`, максимум `GRAZE_IMPULSE_MAX = 1`, утечка `GRAZE_IMPULSE_DECAY = 0.35/с`

### 1.2. Фантомный хитбокс (Phantom Hitbox) — `PHANTOM_CORE_RADII`
**Файлы:** `src/game/balance/player.ts`, `src/game/upgrades.ts`, `src/game/types.ts`, `src/game/systems/PlayerState.ts`, `src/game/systems/PlayerSystem.ts`, `src/game/systems/CollisionSystem.ts`, `src/game/systems/GrazeCollision.ts`

- **Концепция:** хитбокс становится кольцом. Внутреннее ядро безопасно.
- **Радиусы по уровням:** `[0, 8, 12, 15]` (индекс 0 — не куплен)
- **Поведение:**
  - Попадание вражеской пули смертельно только при расстоянии в диапазоне `[core, outer]`
  - Касание (грейз) засчитывается также при прохождении через пустое ядро (`dist < core`)
  - Столкновение с врагами/астероидами игнорируется в ядре
- **Интеграция:** `playerState.core` прокидывается в `CollisionSystem`, передаётся в `PlayerHitbox`

### 1.3. Твёрдые снаряды (Solid Bullets) — `SOLID_BULLET_RADII`
**Файлы:** `src/game/balance/player.ts`, `src/game/upgrades.ts`, `src/game/weapons/Weapon.ts`, `src/game/weapons/WeaponManager.ts`, `src/game/weapons/CannonWeapon.ts`, `src/game/weapons/MissileWeapon.ts`, `src/game/weapons/DroneWeapon.ts`, `src/game/systems/BulletCollision.ts`, `src/game/systems/CollisionSystem.ts`, `src/game/systems/Renderers/BulletRenderer.ts`, `src/game/types.ts`

- **Радиусы по уровням:** `[0, 5, 7, 9]`
- **Механика:** снаряды игрока с `r > 0` перехватывают вражеские снаряды при пересечении
- **Очки:** `SOLID_BULLET_INTERCEPT_SCORE = 25` за перехват
- **События:** `bullet_intercepted { count, x, y }`, `score_added { amount }`
- **Применение:** только к `cannon` и `missile` (`usesSolidUpgrade = true`). Дроны не получают апгрейд.
- **Рендер:** твёрдые снаряды рисуются окружностью

### 1.4. Поглощение Импульса (Graze Momentum) — `GRAZE_IMPULSE_*`
**Файлы:** `src/game/balance/player.ts`, `src/game/upgrades.ts`, `src/game/systems/GrazeSystem.ts`, `src/game/systems/PlayerSystem.ts`, `src/game/systems/PlayerMovement.ts`

- **Множитель скорости:** `getSpeedMult()` возвращает `1 + impulse * GRAZE_IMPULSE_SPEED_GAIN * momentumLevel` при `momentumLevel > 0`
- **Прирост за единицу импульса на уровень:** `GRAZE_IMPULSE_SPEED_GAIN = 0.18`
- **Интеграция:** `PlayerSystem` принимает `getMomentumMult()` из `GrazeSystem`, умножает на `speedMult` из апгрейда
- **UI:** импульс доступен через `grazeSystem.getImpulse()` для будущего HUD

## 2. Новое оружие — Ткань Пространства (Spatial Weaver)

**Файлы:** `src/game/weapons/WeaverWeapon.ts` (новый), `src/game/weapons/Weapon.ts`, `src/game/weapons/WeaponRegistry.ts`, `src/game/weapons/WeaponManager.ts`, `src/game/systems/CollisionSystem.ts`, `src/game/systems/EnemySystem.ts`, `src/game/types.ts`, `src/game/systems/EntityPoolSystem.ts`, `src/game/systems/RendererSystem.ts`, `src/game/systems/Renderers/` (через RendererSystem)

### Константы (`src/game/balance/player.ts`)
| Константа | Значение | Описание |
|---|---|---|
| `WEAVER_SEGMENT_LENGTH` | 26 | Длина одного сегмента нити |
| `WEAVER_THREAD_LIFE` | 4 | Время жизни нити (секунды) |
| `WEAVER_MAX_THREADS` | 48 | Максимум живых нитей на арене |
| `WEAVER_DPS` | 14 | Урон в секунду пересекающему врагу |
| `WEAVER_SLOW_MULT` | 0.45 | Множитель скорости замедленного врага |
| `WEAVER_SLOW_DURATION` | 0.4 | Длительность замедления (секунды) |
| `WEAVER_HIT_RADIUS` | 9 | Радиус действия нити на врага |
| `WEAVER_DURATION` | 20 | Время действия оружия |

### Механика
- **Появление:** пикап `weaver` выпадает только с Carrier (добавлен в список дропа Carrier)
- **Поведение:** при подборе активируется на 20 секунд, оставляет нити по пути движения корабля
- **Генерация:** от последней точки тянутся сегменты по `WEAVER_SEGMENT_LENGTH`, при переполнении удаляется самая старая нить
- **Урон:** `CollisionSystem.weaveCollisions()` проверяет расстояние от врага до отрезка нити (`distanceToSegment` из GrazeCollision), наносит `WEAVER_DPS * dt`
- **Замедление:** при пересечении `enemy.slowT = WEAVER_SLOW_DURATION`, `EnemySystem` применяет `WEAVER_SLOW_MULT` к `enemy.speed` относительно `enemy.baseSpeed` (важно: замедление применяется к целевой скорости, чтобы ИИ не разгонялся обратно)
- **Рендер:** полупрозрачные фиолетовые линии с затуханием по времени жизни

### Типы
```typescript
// src/game/types.ts
export interface WeaveThread {
  x1: number; y1: number;
  x2: number; y2: number;
  life: number;
  maxLife: number;
}
export interface Enemy {
  // ...
  baseSpeed: number;  // базовая скорость без замедления
  slowT: number;      // остаток замедления от нити
}
```

## 3. Активная способность — Телепорт-Подмена (Quantum Swap)

**Файлы:** `src/game/abilities/Ability.ts` (новый), `src/game/abilities/QuantumSwapAbility.ts` (новый), `src/game/abilities/AbilityRegistry.ts` (новый), `src/game/abilities/AbilitySystem.ts` (новый), `src/game/input.ts`, `src/game/loadout/LoadoutTypes.ts`, `src/game/loadout/LoadoutSystem.ts`, `src/game/game.ts`, `src/game/balance/player.ts`

### Константы (`src/game/balance/player.ts`)
| Константа | Значение | Описание |
|---|---|---|
| `QUANTUM_SWAP_COOLDOWN` | 8 | Перезарядка (секунды) |
| `QUANTUM_SWAP_RANGE` | 520 | Максимальная дальность поиска цели |
| `QUANTUM_SWAP_BLAST_RADIUS` | 110 | Радиус взрыва в точке выхода |
| `QUANTUM_SWAP_BLAST_DAMAGE` | 30 | Урон взрыва по врагам рядом |

### Архитектура
Построена по образцу WeaponManager/BonusManager:
- **Контракт:** `Ability` интерфейс с `reset/grant/isAvailable/update/activate/getSlot`
- **Контекст активации:** `AbilityContext` с `playerX/Y`, `enemies`, `movePlayerTo()`, `killEnemy()`, `fx`
- **Реестр:** `createAbilityRegistry()` собирает экземпляры способностей
- **Система:** `AbilitySystem` тикает кулдауны, активирует по нажатию `Space` через `InputManager.consumePress()`

### Поведение
1. По нажатию `Space` ищется ближайший живой враг в радиусе `QUANTUM_SWAP_RANGE`
2. При наличии цели происходит обмен позициями: враг перемещается на позицию игрока (скорость сброшена), игрок телепортируется на позицию врага
3. В точке выхода игрока создаётся кольцо-эффект (`fx.ring`) и вспышка (`fx.burst`)
4. Враги в радиусе взрыва (кроме цели подмены) получают урон, при HP <= 0 убиваются через колбэк `killEnemy` (начисляются очки и спавнится дроп)
5. Ставится кулдаун 8 секунд
6. Способность выдаётся подбором пикапа `quantum_swap` (выпадает с Carrier)

### Интеграция с вводом
- `InputManager` добавлен `pressed` Set для отслеживания одиночных нажатий
- `consumePress(code)` возвращает true только один раз на физическое нажатие (игнорирует автоповтор)
- `clear()` очищает и `pressed` при паузе/blur

### HUD
- Слот добавлен в `LoadoutSlotKind` (`quantum_swap`) и `LoadoutIcon` (`ability-quantum-swap`)
- `LoadoutSystem` принимает `getAbilitySlots` из `AbilitySystem`
- Иконка и цвета добавлены в `Icon.tsx`
- Локализация `hud.loadout.quantum_swap` (RU/EN), `debug.quantum_swap` (RU/EN)
- Рендер пикапа `quantum_swap` в `PickupRenderer`

## 4. Интеграция в `Game`

### Инициализация (конструктор)
- `GrazeSystem` создаётся с `eventBus, fx, scoringSystem` (перед `playerSystem`)
- `AbilitySystem` создаётся с `input, AbilityWorld, fx`
- `PlayerSystem` получает `getMomentumMult = () => grazeSystem.getSpeedMult()`
- `BonusManager.setDashDurationMult()` подключён через `UpgradeSystem`
- `WeaponManager` получает `getWeaves` в world
- `LoadoutSystem` получает `getAbilitySlots`
- `ApplyPickupSystem` получает `grantAbility`
- Подписка `pickup_collected` → `applyPickupSystem.apply()`
- Подписка `drone_hit` остаётся, добавлена обработка пикапов

### Update-цикл (`step`)
- `grazeSystem.update(dtScaled)` вызывается каждый кадр
- `abilitySystem.update(dtScaled)` вызывается только в состояниях `playing/active`
- `CollisionSystem.update()` получает `core` в `playerState` и `weaveList`
- `RendererSystem.render()` получает `phantomLevel` из `upgradeSystem.playerUpgrades.phantomHitbox` и `weaveList`

### Применение апгрейдов
`UpgradeSystem.applyToSystems()` расширен колбэками:
- `setSpeedMult(v)` → `playerSystem.setSpeedMult(v)`
- `setCoreRadius(v)` → `playerSystem.setCoreRadius(v)`
- `setDashDurationMult(v)` → `bonusManager.setDashDurationMult(v)`
- `setMomentumLevel(v)` → `grazeSystem.setMomentumLevel(v)`

Вызывается в `startRun()` и `refreshUpgrades()`.

### Сброс забега
В `startRun()` добавлен сброс `grazeSystem.reset()`, `abilitySystem.reset()`, очистка `entityPool.weaveList`.

### Убийство через способность
Метод `Game.killEnemy(enemy)`: помечает врага мёртвым, вызывает `dropSystem.onEnemyKilled()`, публикует `enemy_killed` (для дропа деталей, очков и проверки завершения волны).
