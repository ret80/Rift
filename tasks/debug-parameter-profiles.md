# Профили параметров и связанные значения

Дата: 2026-11-13
Статус: реализовано (шаги 1–6 плана ниже; см. раздел «Что сделано»)

## 0. Что сделано

- `src/game/balance/enemyKinds.ts` — `EnemyKind` вынесен из `enemies.ts`,
  чтобы DTO параметров не создавал цикл импортов.
- `src/game/balance/params/` — `GameParams` (DTO + `DEFAULT_PARAMS`),
  `profiles.ts` (`default` / `relaxed` / `stress`), `resolveParams.ts`
  (профиль + отладочные сдвиги), `derived.ts` (`enemySpeed`, `arenaRadius`).
- Скорости врагов хранятся долей от `player.maxSpeed`; скорость игрока
  читается `PlayerSystem` из параметров, корпус — из `applyUpgrades`.
- Зона получает параметры через `ZoneModel.setParams`; `zoneRadiusFor`
  принимает `GameParams`.
- `GameWorld` держит `params` и пересобирает их в `applyParams()`;
  публичные входы — `setParamProfile`, `setTestSpeed`, `setTestZone`
  (проценты), вместо прежних `setTestSpeedMult` / `setTestZoneScale`.
- Отладка: `src/ui/debugTuning.ts` (`DebugTuning` + реестр `DEBUG_SLIDERS`),
  один ключ хранения `rift9_debug_tuning` с миграцией старых
  `rift9_debug_speed` / `rift9_debug_zone`; выбор профиля и ползунки в
  панели разработчика строятся из реестра.
- Сценарии: поле `paramProfile` в JSON сценария и в записи сессии;
  `SessionRecorder` сохраняет профиль только если он не `default`,
  поэтому хэши старых сценариев не меняются.

## 1. Что уже есть

- Константы баланса разложены по файлам `src/game/balance/*.ts`
  (`player.ts`, `enemies.ts`, `waves.ts`, `zones.ts`, `drops.ts`).
  Часть значений выводится из других: `HUNTER_SPEED = PLAYER_MAX_SPEED * 1.15`,
  `DRONE_BASE_SPEED = PLAYER_MAX_SPEED * 0.93` и т.п.
- `BalanceOverrides` (`src/game/balance/BalanceOverrides.ts`) — уже готовый
  механизм множителей для сценариев: `enemyHpMult`, `enemyDamageMult`.
  Он нормализует значения, валидирует диапазон и умеет отличать «нет
  override» от «×1».
- Отладочные сдвиги живут отдельно от констант: `debugSpeed` в
  `usePersistentSettings`, `setTestSpeed()` в `game.ts` →
  `GameWorld.setTestSpeedMult()`. Множитель применяется только при
  `testMode`.
- Размер арены: `zoneRadiusFor(wave)` (`balance/waves.ts`) уже умножает
  радиус волны на `ZONE_RADIUS_SCALE = 1.1`.

Итог: единая точка «базовых чисел» есть, но она размазана по модулям,
а отладочные сдвиги — это отдельные поля, каждое со своей проводкой
(настройка → action → game → world → система).

## 2. Проблема

1. Чтобы связать два параметра (скорость игрока и скорость врагов),
   пришлось вручную добавлять зависимость в `EnemySystem`.
2. Каждый новый отладочный параметр требует правок в 6–7 файлах
   (storage key, hook настроек, action, ScreenRouter, экран, game, world).
3. Профилей нет: базовые числа можно поменять только правкой констант
   и пересборкой. Нельзя сравнить два набора в одном запуске.
4. Константы — модульные `export const`, поэтому их нельзя подменить
   на лету и нельзя сохранить в сценарий/реплей.

## 3. Целевая архитектура

### 3.1 DTO параметров — единственный источник чисел

Новая папка `src/game/balance/params/`:

```
params/
  GameParams.ts       // интерфейс DTO + значения по умолчанию
  profiles.ts         // реестр профилей
  resolveParams.ts    // профиль + overrides + отладочные сдвиги → ResolvedParams
  derived.ts          // связанные значения (скорости, радиусы, тайминги)
```

`GameParams` — плоский типизированный DTO, сгруппированный по доменам.
Только «первичные» числа, без вычисляемых:

```ts
export interface GameParams {
  player: {
    maxSpeed: number;        // 480
    radius: number;          // 13
    accel: number;
  };
  enemy: {
    speedFactor: {           // доля от player.maxSpeed — связь по определению
      drone: number;         // 0.93
      hunter: number;        // 1.15
      fighter: number;       // 0.90
      cruiser: number;       // 0.50
      carrier: number;       // 0.30
      miner: number;         // 0.55
    };
    hpBase: Record<EnemyKind, number>; // hpBase из enemies.ts
  };
  zone: {
    radiusScale: number;     // 1.1 — общий масштаб арены
    baseRadius: { from: number; to: number; perWave: number };
    collapse: { delay: number; targetFraction: number; speedMult: number };
  };
  // drops, meta, scoring — по мере переноса
}
```

Ключевой приём: **не хранить скорость врага в px/s**, а хранить долю от
`player.maxSpeed`. Тогда «поменять один параметр — поменялись связанные»
работает автоматически, без ручных множителей:

```ts
export function enemySpeed(kind: EnemyKind, params: ResolvedParams): number {
  return params.player.maxSpeed * params.enemy.speedFactor[kind];
}
```

### 3.2 Профили

`profiles.ts` — реестр именованных наборов:

```ts
export const PARAM_PROFILES = {
  default: defaultParams,          // текущий баланс
  relaxed: relaxedParams,          // больше арена, меньше урон
  stress: stressParams,            // тесная арена, быстрые враги
} as const satisfies Record<string, GameParams>;

export type ParamProfileId = keyof typeof PARAM_PROFILES;
```

Профиль — это **полный** `GameParams` (не дельта): так его можно
прочитать, сравнить и провалидировать целиком. Дельты появляются только
в отладочных сдвигах поверх профиля.

### 3.3 Resolved params на мир

```ts
export interface ParamModifiers {
  /** Сдвиг скорости, −0.5…+0.5 (сейчас debugSpeed/100). */
  speed?: number;
  /** Сдвиг размера арены, −0.5…+0.5 (сейчас debugZone/100). */
  zone?: number;
  /** Множители сценария. */
  balance?: BalanceOverrides;
}

export function resolveParams(
  profileId: ParamProfileId,
  mods: ParamModifiers,
  testMode: boolean,
): ResolvedParams;
```

`ResolvedParams` — те же числа, но с применёнными сдвигами и
нормализованными диапазонами. Мир получает его один раз на старте забега
(`GameWorld.params`), как сейчас получает `balance`.

Правило: **сдвиги применяются только при `testMode`**, профили — всегда;
обычный забег использует `default` без сдвигов. Это сохраняет рекорды и
реплеи.

### 3.4 Использование в коде

- `PlayerSystem` берёт `params.player.maxSpeed` вместо импорта константы.
- `EnemySystem.createEnemy` берёт `enemySpeed(kind, params)` — вместо
  `def.speed` и множителя извне.
- `ZoneModel.activate` берёт `params.zone.radiusScale` вместо поля
  `radiusScale`, которое сейчас ставят снаружи.
- `waves.ts`/`enemies.ts` остаются чистыми функциями, но принимают
  `params` аргументом, а не читают модульные константы.

Мир создаёт системы с параметрами в конструкторе — как сейчас передаются
`getEnemyHpMult` и `getEnemyDamageMult`.

### 3.5 Отладочная панель

Вместо отдельных полей (`debugSpeed`, `debugZone`) — один объект:

```ts
interface DebugTuning {
  profile: ParamProfileId;   // выпадающий список
  speed: number;             // −50…+50 %
  zone: number;              // −50…+50 %
}
```

Панель отладки строит слайдеры из декларативного описания
(`DEBUG_SLIDERS: { key, min, max, step, labelKey }[]`), а `ScreenRouter`
передаёт один проп `tuning`/`onTuningChange`. Добавление параметра =
одна строка в описании + поле в `ParamModifiers`.

Хранение: `rift9_debug_tuning` (JSON) с миграцией старых
`rift9_debug_speed` / `rift9_debug_zone`.

## 4. Как это ложится на текущий код

| Сейчас | После |
| --- | --- |
| `PLAYER_MAX_SPEED`, `HUNTER_SPEED`, … | `params.player.maxSpeed`, `enemySpeed(kind, params)` |
| `ZONE_RADIUS_SCALE` | `params.zone.radiusScale` |
| `zoneRadiusFor(wave, scale)` | `zoneRadiusFor(wave, params)` |
| `world.getEnemySpeedMult()` | `EnemySystemDeps.getEnemyParams()` → `enemyDefFor(kind, wave, params)` |
| `debugSpeed`, `debugZone` + 6 файлов проводки | `DebugTuning` + описание слайдеров |
| `BalanceOverrides` | остаётся отдельным механизмом сценариев (hp/damage), не дублируется в `GameParams` |

## 5. План внедрения (по шагам, каждый шаг рабочий)

1. **DTO и default-профиль.** Завести `GameParams` и `defaultParams`
   ровно с текущими числами. Никакой логики не менять.
2. **Скорости врагов.** Перенести `speedFactor` в DTO, `enemySpeed()`
   в `derived.ts`. `enemies.ts` начинает строить `ENEMY_BASES.speed`
   из параметров. Проверить `sim:selftest` и сценарии.
3. **Игрок и зона.** `PlayerSystem` и `ZoneModel` читают `params`.
4. **Resolved на мир.** `resolveParams` в `GameWorld` вместо
   `setTestSpeedMult`/`setTestZoneScale`.
5. **Отладка.** `DebugTuning`, реестр слайдеров, миграция ключей
   localStorage.
6. **Профили.** Добавить `relaxed`/`stress` в реестр, выбор в отладке,
   вывести в сценарии (`scenarios/*.json`) для прогонов.

## 6. Риски и ограничения

- **Реплеи и хэши сценариев.** Значения `1` должны оставаться
  «отсутствием override», иначе изменятся хэши старых сценариев.
- **Инициализация до мира.** Часть модулей (`BalanceOverrides`,
  `formatBalance`) используется сценариями без `GameWorld` — им нужен
  `defaultParams` по умолчанию, а не глобальное состояние.
- **Глобальное состояние запрещено.** Нельзя делать изменяемый
  module-level `let params`; иначе два мира в одном процессе
  (headless-прогоны) начнут влиять друг на друга.
- **Скорость врагов и отладочный сдвиг.** Сдвиг скорости применяется
  только к `player.maxSpeed`: `enemySpeed` выводит скорость врага из неё,
  поэтому множитель не удваивается. Прирост за волну тоже масштабируется
  (`growthScale`), иначе на поздних волнах соотношение скоростей
  «размывалось» бы постоянной добавкой.
- **Живые враги при смене сдвига.** Уже вышедшие враги пересчитываются
  пропорционально в `GameWorld.applyParams`; корпус существующих врагов
  не меняется до следующего спавна (профили выбираются перед тестом).
