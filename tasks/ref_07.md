# ref_07 — Интегрировать AI System (Strategy Pattern)

## Проблема

В проекте есть полностью реализованная AI система с Strategy Pattern (`src/game/ai/`), которая **не используется**:

```
ai/
├── EnemyAI.ts          — AI factory + manager
├── IEnemyStrategy.ts   — стратегия интерфейса
├── GameContext.ts      — контекст данных для AI
└── strategies/
    ├── DroneStrategy.ts  — рой
    ├── HunterStrategy.ts — предсказание
    └── FighterStrategy.ts — страф + огонь
```

Всё AI-поведение зашито в `EnemySystem.ts` как один метод `update()` с ~240 строками switch/case (строки 226–463):

```typescript
switch (e.kind) {
  case EnemyKind.Drone: { /* 30 строк */ }
  case EnemyKind.Hunter: { /* 25 строк */ }
  case EnemyKind.Fighter: { /* 50 строк */ }
  case EnemyKind.Cruiser: { /* 60 строк */ }
  case EnemyKind.Carrier: { /* 70 строк */ }
}
```

## Цель

Перенести AI логику из `EnemySystem` в Strategy классы. `EnemySystem.update()` делегирует каждой сущности её стратегию.

## Задачи

### 1. Адаптировать существующие стратегии

Перенести логику из switch/case в стратегии:

```typescript
// DroneStrategy.ts — преследование + фланг
update(enemy, context, dt) {
  const angleToPlayer = Math.atan2(context.playerY - enemy.y, context.playerX - enemy.x);
  const flankAngle = Math.sin(enemy.seed + context.wave * 0.5) * flankFactor;
  enemy.angle = lerpAngle(enemy.angle, angleToPlayer + flankAngle, k);
  enemy.vx = Math.cos(enemy.angle) * enemy.speed;
  enemy.vy = Math.sin(enemy.angle) * enemy.speed;
}

// HunterStrategy.ts — предсказание позиции
update(enemy, context, dt) {
  const lookahead = 0.4 + context.wave * 0.03;
  const leadX = context.playerX + context.playerVx * lookahead;
  ...
}

// FighterStrategy.ts — страф + огонь
update(enemy, context, dt) {
  // идеальная дистанция, орбита, страф
}
```

### 2. Расширить EnemyAI для Cruiser и Carrier

```typescript
// CruiserStrategy.ts — эскорт + dual turret
// CarrierStrategy.ts — burst spawn drones
```

Создать новые файлы для недостающих стратегий.

### 3. Интегрировать в EnemySystem

```typescript
// EnemySystem.ts:
private aiFactory: EnemyAI;

constructor(...) {
  this.aiFactory = new EnemyAI(); // или createEnemyAI()
}

update(dt, enemyList, playerPos, enemyBullets) {
  const context = this.aiFactory.getContext(playerPos, this.wave, enemyBullets);
  
  for (const e of enemyList) {
    if (e.dead) continue;
    
    // AI делегирует стратегию
    const strategy = this.aiFactory.getStrategy(e.kind);
    strategy.update(e, context, dt);
    
    // Стрельба (отдельно от движения)
    this.updateFiring(e, context, dt);
    
    e.x += e.vx * dt;
    e.y += e.vy * dt;
  }
}
```

### 4. Убрать switch/case из EnemySystem

Удалить весь switch на основе `e.kind` (строки 226–463). Оставить только:
- `updateFiring()` — стрельба
- `applyAvoidance()` — избегание друг друга
- `spawnDrone()` — спавн от Carrier

## Критерии готовности

- [ ] Нет switch/case по `e.kind` в `EnemySystem.update()`
- [ ] Каждая стратегия (`DroneStrategy`, `HunterStrategy`, `FighterStrategy`, `CruiserStrategy`, `CarrierStrategy`) реализует `IEnemyStrategy`
- [ ] `EnemyAI.getStrategy(kind)` возвращает нужную стратегию
- [ ] Поведение врагов не изменилось (тесты / ручная проверка)
- [ ] `npm run typecheck` без ошибок

## Ожидаемый эффект

- `EnemySystem.update()` сокращается с ~800 до ~200 строк
- Добавить нового врага = создать одну стратегию, не трогая EnemySystem
- Каждая стратегия тестируется отдельно
- Код читается как документация: "DroneStrategy делает X, Hunter делает Y"

## Зависимости

Зависит от: ref_01. Рекомендуется после ref_01.
