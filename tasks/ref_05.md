# ref_05 — Убрать EventBus bypass (нарушение инкапсуляции)

## Проблема

Game.ts напрямую манипулирует внутренними массивами систем, обходя их публичные API:

```typescript
// game.ts:589 — bypassing BulletSystem
this.entityPool.enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy, cruiser });

// game.ts:608 — bypassing BulletSystem
this.entityPool.enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy, cruiser });

// game.ts:581 — bypassing DroneSystem
this.entityPool.allyDrones.push({ ... });
```

`setupEventListeners()` (строки 525–661) содержит 10+ обработчиков, которые должны жить в своих системах:

| Событие | Обработчик в Game.ts | Должен жить в |
|---------|:---:|:---:|
| `fire_bullet` | Game.ts:585–593 | `BulletSystem` |
| `drone_fired` | Game.ts:606–618 | `BulletSystem` / `DroneSystem` |
| `drone_hit` | Game.ts:620–625 | `DroneSystem` |
| `enemy_killed` | Game.ts:532–537 | `ScoringSystem` |
| `player_hit` | Game.ts:527–530 | `PlayerSystem` |
| `spawn_pickup` | Game.ts:595–599 | `PickupSystem` |
| `pickup_collected` | Game.ts:601–604 | `PickupSystem` |
| `popup` | Game.ts:627–632 | `UISystem` (future) |
| `camera_shake` | Game.ts:634–638 | `FxSystem` |
| `asteroid_hit` | Game.ts:651–656 | `AsteroidField` |
| `game_over` | Game.ts:658–661 | FSM (ok) |

## Цель

Системы управляют своими данными. Game.ts только вызывает `system.update(dt)` и триггерит FSM.

## Задачи

### 1. Добавить публичные API в BulletSystem

```typescript
// BulletSystem.ts — добавить:
spawnEnemyBullet(x, y, vx, vy, life, dmg, heavy, cruiser): void {
  this.enemyBulletList.push({ x, y, vx, vy, life, dmg, heavy, cruiser });
}

spawnAllyBullet(x, y, vx, vy, life, dmg): void {
  this.bulletList.push({ x, y, vx, vy, life, dmg });
}
```

### 2. Добавить публичные API в DroneSystem

```typescript
// DroneSystem.ts — добавить:
addDrone(x, y, angle, phase, hp, maxHp): void {
  this.entityPool.allyDrones.push({ x, y, angle, fireCd: 0, phase, hp, maxHp, target: null, retargetT: 0, flash: 0 });
}

removeDroneAt(x, y): void {
  const idx = this.entityPool.allyDrones.findIndex(d => ...);
  if (idx !== -1) this.entityPool.allyDrones.splice(idx, 1);
}
```

### 3. Добавить публичные API в PickupSystem

```typescript
// PickupSystem.ts — добавить:
spawnPickup(kind, x, y, vx, vy): void {
  this.entityPool.pickups.push({ kind, x, y, vx, vy, life: 20, seed: Math.random(), r: 14 });
}
```

### 4. Переместить обработчики событий в системы

Каждый обработчик из `Game.setupEventListeners()` перенести:

```typescript
// В PlayerSystem.ts:
constructor(eventBus, ...) {
  eventBus.subscribe('player_hit', (event) => {
    const dmg = event.payload.dmg;
    this.hit(dmg);
  });
}

// В ScoringSystem.ts:
constructor(eventBus, ...) {
  eventBus.subscribe('enemy_killed', (event) => {
    this.onKill(event.payload.scoreValue, this.killed);
  });
}

// В Fx/EntityPool — аналогично
```

### 5. Упростить `Game.setupEventListeners()`

Оставить только те события, которые требуют координации между системами:

```typescript
// Game.setupEventListeners() — оставить:
eventBus.on('wave_started', () => this.fsm.fire(...));
eventBus.on('wave_cleared', () => this.fsm.fire(...));
eventBus.on('game_over', () => this.fsm.fire(...));
```

Всё остальное уходит в системы.

## Критерии готовности

- [ ] В Game.ts нет прямых вызовов `entityPool.enemyBulletList.push(...)`
- [ ] `BulletSystem.spawnEnemyBullet()` используется вместо прямого push
- [ ] `PickupSystem.spawnPickup()` используется вместо прямого push
- [ ] `setupEventListeners()` содержит только 2-3 FSM-координирующих обработчика
- [ ] `npm run typecheck` без ошибок

## Ожидаемый эффект

- Удалить ~60 строк обработчиков из Game.ts
- Системы инкапсулируют свои данные
- Нет возможности создать "сиротскую" пулю минуя BulletSystem

## Зависимости

Зависит от: ref_01 (базовая структура). Рекомендуется делать сразу после ref_01.
