# ref_06 — Разделить CollisionSystem (SOLID: SRP)

## Проблема

`CollisionSystem` (476 строк) нарушает SRP — он делает слишком много:

1. **Детекция столкновений** — проверки `checkBulletCollision` (корректно)
2. **Расчёт импульсов** — `softResolveCollision` (корректно)
3. **Логика дропов** — `getDropKind()`, `trySpawnDrop()`, `partsAmountFor()` (некорректно)
4. **Начисление валюты** — `spawnParts()` внутри коллизий (некорректно)

Фактически это два класса в одном файле:
- `CollisionSystem` — физика столкновений
- `PickupDropSystem` — дроп бонусов из убитых врагов

## Цель

Разделить на две системы. CollisionSystem остаётся чистой физикой. Дропы — отдельная система.

## Задачи

### 1. Создать `src/game/systems/PickupDropSystem.ts`

```typescript
class PickupDropSystem {
  // Конфигурация из balance.ts
  partsAmountFor(enemyKind): number;
  dropChanceFor(enemyKind): number;
  
  // Генерация бонуса из врага
  generateDrop(enemyKind, seed): PickupKind | null;
  
  // Обработка после убийства (вызывается из любого места)
  onEnemyKilled(enemy: Enemy, spawnPickupFn, spawnPartsFn): void {
    // partsAmountFor -> spawnParts
    // generateDrop -> spawn_pickup event
  }
}
```

Перенести методы:
- `partsAmountFor()` → PickupDropSystem
- `getDropKind()` → `PickupDropSystem.generateDrop()`
- `trySpawnDrop()` → `PickupDropSystem.onEnemyKilled()`

### 2. Очистить `CollisionSystem`

Удалить из `CollisionSystem`:
- `partsAmountFor()` (10 строк)
- `getDropKind()` (27 строк)
- `trySpawnDrop()` (19 строк)

Заменить вызовы в `update()` на:
```typescript
// Было:
this.trySpawnDrop(e);

// Стало:
this.dropSystem.onEnemyKilled(e, spawnPickupFn, spawnPartsFn);
```

### 3. Интегрировать в Game.ts

```typescript
// game.ts — добавить:
this.dropSystem = new PickupDropSystem();

// game.ts — вместо:
this.collisionSystem.trySpawnDrop(e);

// Стало:
this.dropSystem.onEnemyKilled(enemy,
  (kind, x, y, vx, vy) => this.spawnPickup(kind, x, y, vx, vy),
  (n, x, y) => this.upgradeSystem.addParts(n)
);
```

## Критерии готовности

- [ ] `CollisionSystem` < 300 строк (было 476)
- [ ] `PickupDropSystem` существует и содержит всю логику дропов
- [ ] Нет вызовов `trySpawnDrop` / `getDropKind` / `partsAmountFor` в CollisionSystem
- [ ] `npm run typecheck` без ошибок
- [ ] `npm run build` без ошибок

## Ожидаемый эффект

- CollisionSystem становится тестируемым (чистая физика без дропов)
- PickupDropSystem можно тестировать отдельно
- Явная зависимость: CollisionSystem → PickupDropSystem (не наоборот)

## Зависимости

Зависит от: ref_01. Рекомендуется после ref_01.
