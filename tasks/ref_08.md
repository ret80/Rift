# ref_08 — Убрать DEBUG_ROTATION код

## Проблема

В `PlayerSystem.ts` и `EnemySystem.ts` зашита отладочная логика:

```typescript
// PlayerSystem.ts:28-36
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;

function logRotation(tag: string, msg: string): void {
  if (!DEBUG_ROTATION) return;
  if (rotationLogCounter.player >= MAX_ROTATION_LOGS) return;
  console.log(`[ROTATION-P] ${tag}: ${msg}`);
}
```

```typescript
// EnemySystem.ts:15-23
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;

function logRotation(tag: string, msg: string): void {
  if (!DEBUG_ROTATION) return;
  if (rotationLogCounter.enemy >= MAX_ROTATION_LOGS) return;
  console.log(`[ROTATION] ${tag}: ${msg}`);
}
```

Эти флаги встречаются ~20 раз по коду (каждый раз при вращении корабля):
- `PlayerSystem.ts`: строки 34, 35, 387-395, 586-588
- `EnemySystem.ts`: строки 21, 22, 149, 268-274, 324-327, 387-390, 428-431, 721

## Цель

Убрать весь DEBUG_ROTATION код. Если нужна отладка — использовать `DebugSystem`.

## Задачи

### 1. Убрать из `PlayerSystem.ts`

```typescript
// УДАЛИТЬ:
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;
function logRotation(...) { ... }

// УДАЛИТЬ все вызовы:
if (DEBUG_ROTATION && ...) { rotationLogCounter.player++; logRotation(...) }

// Оставить только логику вращения:
this.player.angle = lerpAngle(...);
```

### 2. Убрать из `EnemySystem.ts`

```typescript
// УДАЛИТЬ:
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;
function logRotation(...) { ... }

// УДАЛИТЬ все вызовы:
if (DEBUG_ROTATION && ...) { rotationLogCounter.enemy++; logRotation(...) }
```

## Критерии готовности

- [ ] Нет упоминаний `DEBUG_ROTATION` в коде
- [ ] Нет упоминаний `rotationLogCounter` в коде
- [ ] Нет функции `logRotation`
- [ ] Вращение кораблей работает корректно
- [ ] `npm run typecheck` без ошибок

## Ожидаемый эффект

- Удалить ~80 строк мёртвого кода
- Очистить логику вращения от условных проверок
- Уменьшить размер бандла на ~1KB

## Зависимости

Нет. Можно делать в любое время.
