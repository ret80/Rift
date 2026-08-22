# ref_04 — Убрать дублирование типов сущностей

## Проблема

Типы сущностей определены в нескольких местах с несовместимыми интерфейсами:

| Тип | types.ts | GameState.ts | Итого мест |
|-----|:---:|:---:|:---:|
| `Enemy` | ✅ (строки 49–68, 20 полей) | ✅ (`EnemyEntity`, строки 53–77, 23 поля) | 2 |
| `Bullet` | ✅ (строки 71–75) | ❌ (inlined в `WorldState.bullets`) | 1 + inline |
| `EBullet` | ✅ (строки 77–83) | ❌ (inlined в `WorldState.enemyBullets`) | 1 + inline |
| `Pickup` | ✅ (строки 85–91) | ❌ (inlined в `WorldState.pickups`) | 1 + inline |
| `AllyDrone` | ✅ (строки 98–106) | ❌ (inlined в `WorldState.allyDrones`) | 1 + inline |
| `Mine` | ✅ (строки 93–96) | ❌ (inlined в `WorldState.mines`) | 1 + inline |

Кроме того, `WorldState` в `GameState.ts` (строки 81–127) определён, но **никому не нужен**:
- `GameState.world.enemies[]` — пустой массив, реально используется `EntityPoolSystem.enemyList`
- `GameState.world.bullets[]` — пустой массив, реально используется `EntityPoolSystem.bullets`
- Все массивы `WorldState` существуют параллельно с пулами

## Цель

Единый источник типов — `src/game/types.ts`. Удалить `GameState.world`.

## Задачи

### 1. Удалить `GameState.world`

```typescript
// GameState.ts — УДАЛИТЬ:
export interface WorldState {
  enemies: EnemyEntity[];
  bullets: Array<{...}>;
  enemyBullets: Array<{...}>;
  pickups: Array<{...}>;
  allyDrones: Array<{...}>;
  mines: Array<{...}>;
}

// GameState.ts — УДАЛИТЬ:
public world: WorldState = { ... };

// GameState.ts — УДАЛИТЬ из reset():
this.world = { enemies: [], bullets: [], ... };
```

### 2. Удалить `GameState.EnemyEntity`

```typescript
// GameState.ts — УДАЛИТЬ:
export interface EnemyEntity {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  ...  // 23 поля
}
```

Все должны импортировать `Enemy` из `../types.ts`.

### 3. Оставить единые интерфейсы в types.ts

```typescript
// src/game/types.ts — оставить:
export interface Enemy { ... }        // единый, 20 полей
export interface Bullet { ... }       // единый
export interface EBullet { ... }      // единый
export interface Pickup { ... }       // единый
export interface Mine { ... }         // единый
export interface AllyDrone { ... }    // единый
export interface Ring { ... }         // из fx.ts
export interface Particle { ... }     // из fx.ts
export interface Rift { ... }         // из rifts.ts
```

### 4. Обновить `GameState` до минимума

После удаления `world` и `EnemyEntity` оставить только метаданные:

```typescript
// src/game/core/GameState.ts — оставить:
export class GameState {
  public time: number = 0;
  public paused: boolean = false;
  // УДАЛЕНО: player, wave, zone, score, world, enemy - все ушли в системы
}
```

Или перенести метаданные в отдельные интерфейсы в `GameState.ts` и использовать типы из `types.ts`:

```typescript
export interface GameState {
  time: number;
  paused: boolean;
  zone: ZoneState; // из types.ts или core/ZoneTypes.ts
  score: ScoreState;
  wave: WaveMetadata;
}
```

## Критерии готовности

- [ ] `GameState.world` удалён (0 ссылок)
- [ ] `EnemyEntity` удалён, все используют `Enemy` из `types.ts`
- [ ] Ни один интерфейс не определён дважды
- [ ] `npm run typecheck` без ошибок
- [ ] `npm run build` без ошибок

## Ожидаемый эффект

- Удалить ~80 строк дублирующихся типов
- Устранить путаницу: один `Enemy` вместо двух несовместимых
- Убрать мёртвый массив `GameState.world` (~200 строк)

## Зависимости

Зависит от: нет. Можно делать после ref_02.
