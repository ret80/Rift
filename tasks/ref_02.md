# ref_02 — Убрать дублирование WaveOrchestrator ↔ ZoneSystem

## Проблема

Две системы дублируют одинаковую логику управления зоной:

| Функция | WaveOrchestrator | ZoneSystem |
|---------|:---:|:---:|
| `applyZoneConstraints()` | ✅ строки 367–414 | ✅ строки 158–202 |
| `clampPlayerToZone()` | ❌ | ✅ строки 94–116 |
| `clampEnemiesToZone()` | ❌ | ✅ строки 122–149 |
| push астероидов от зоны | ✅ строки 379–392 | ✅ строки 164–178 |
| push врагов в зону | ✅ строки 394–413 | ✅ строки 180–201 |
| `ZoneState` | ✅ строки 47–55 | ✅ строки 32–40 |

**Итог:** ~120 строк полностью идентичного кода.

Кроме того, `PlayerSystem.clampPlayerToZone()` (строки 568–590) и `EnemySystem.clampEnemiesToZone()` (строки 697–725) — это третья копия логики клампинга.

## Цель

Один владелец зоны — `ZoneSystem`. Остальные системы вызывают его методы, а не дублируют.

## Задачи

### 1. Расширить `ZoneSystem` до единственного центра управления

```typescript
class ZoneSystem {
  // Текущий интерфейс
  update(dt): void;
  
  // НОВЫЕ методы:
  clampPlayer(playerRef, zone): void;      // вместо PlayerSystem
  clampEnemies(enemies, zone): void;        // вместо EnemySystem
  clampToZone(obj, zone, overdrive): void;  // общая утилита
}
```

Переместить логику из:
- `WaveOrchestrator.applyZoneConstraints()` → `ZoneSystem.applyZoneConstraints()`
- `PlayerSystem.clampPlayerToZone()` → `ZoneSystem.clampPlayer()`
- `EnemySystem.clampEnemiesToZone()` → `ZoneSystem.clampEnemies()`

### 2. Убрать `WaveOrchestrator.applyZoneConstraints()`

WaveOrchestrator остаётся только с логикой жизненного цикла волны:
- `initWave()` — инициализация новой волны
- `activateZone()` — активация зоны после countdown
- `updateClearTransition()` — анимация зачистки
- `updateEdgeDanger()` — урон на краю зоны (это **поведение волны**, не зоны)
- `advanceWave()` — переход к следующей волне

**Удалить:** `WaveOrchestrator.applyZoneConstraints()` (48 строк)

### 3. Убрать `PlayerSystem.clampPlayerToZone()`

Заменить вызовы в `game.ts` на:
```typescript
// Было:
playerSystem.clampPlayerToZone(zoneX, zoneY, zoneR, zoneOn, overdrive);

// Стало:
zoneSystem.clampPlayer(playerSystem.getPlayerRef(), zone);
```

**Удалить:** `PlayerSystem.clampPlayerToZone()` (25 строк)

### 4. Убрать `EnemySystem.clampEnemiesToZone()`

Заменить вызовы в `game.ts` на:
```typescript
// Было:
enemySystem.clampEnemiesToZone(zoneX, zoneY, zoneR, zoneOn);

// Стало:
zoneSystem.clampEnemies(entityPool.enemyList, zone);
```

**Удалить:** `EnemySystem.clampEnemiesToZone()` (29 строк)

### 5. Унифицировать `ZoneData`

Сейчас `ZoneState` определён в 3 местах:
- `GameState.ts` (строки 34–42)
- `WaveOrchestrator.ts` (строки 47–55)
- `ZoneSystem.ts` (строки 32–40)

**Создать:** `src/game/core/ZoneTypes.ts`:
```typescript
export interface ZoneData {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  collapseT: number;
}
```

Импортировать отовсюду. Удалить локальные определения.

## Критерии готовности

- [ ] `ZoneData` определён ровно в одном файле
- [ ] `WaveOrchestrator.applyZoneConstraints()` удалён
- [ ] `PlayerSystem.clampPlayerToZone()` удалён
- [ ] `EnemySystem.clampEnemiesToZone()` удалён
- [ ] Все клампинги идут через `ZoneSystem`
- [ ] Применено: `npm run typecheck` без ошибок

## Ожидаемый эффект

- Удалить ~120 строк дублирующегося кода
- Устранить рассинхронизацию логики зоны
- Единая точка модификации поведения зоны
