# ref_01 — Убрать «God Object» Game.ts (разделение ответственности)

## Проблема

`game.ts` содержит 1219 строк и нарушает принцип единственной ответственности (SRP). Вместо чистой оркестрации система хранит бизнес-логику, которая должна жить в отдельных модулях:

- `handleAutoFire()` — авто-стрельба по ближайшему врагу (строки 1188–1217)
- `updateHomingMissiles()` — самонаведение ракет (строки 1054–1083)
- `applyPickup()` — применение 12 типов бонусов switch/case (строки 1101–1141)
- `checkWaveClear()` — логика завершения волны (строки 1149–1165)
- `updateZoneAndWaves()` — обновление зоны и волн (строки 1167–1180)
- `enemyFire()` — создание вражеских пуль (строки 1085–1099)
- `setupEventListeners()` — 10+ обработчиков событий, дублирующих логику систем

## Цель

Снизить `game.ts` до ~550 строк. Game.ts должен только: инициализировать системы, вызывать `step(dt)`, триггерить FSM-переходы, передавать HUD/UI данные через callbacks.

## Задачи

### 1. Создать `AutoFireSystem.ts`

Переместить логику авто-стрельбы из `Game.handleAutoFire()`:

```typescript
class AutoFireSystem {
  update(dt: number, playerPos, entityPool, playerSystem) {
    // Найти ближайшего врага в ZONE_GUN_RANGE
    // Установить aim и firing через playerSystem
  }
}
```

**Удалить:** `Game.handleAutoFire()` (30 строк)

### 2. Создать `MissileSystem.ts`

Переместить логику ракет из `Game.updateHomingMissiles()` и `PlayerSystem.launchMissiles()`:

```typescript
class MissileSystem {
  launchMissiles(dt: number, playerState, entityPool) {
    // Найти ближайшего врага
    // Создать ракету (fireMissile)
  }
  
  updateHoming(dt: number, bullets) {
    // Lerp направления к цели для ракет с homingTarget
  }
}
```

**Удалить:** `Game.updateHomingMissiles()` (30 строк), часть `PlayerSystem.launchMissiles()` и `fireMissile()`

### 3. Расширить `PickupSystem.ts`

Переместить switch/case из `Game.applyPickup()`:

```typescript
class PickupSystem {
  apply(kind: PickupKind, playerSystem, droneSystem, mineSystem, scoringSystem, audio) {
    switch (kind) {
      case 'heal25': case 'heal50': case 'heal100': case 'hp':
        playerSystem.heal(...)
        break;
      case 'rate20': case 'rate40': ...
      case 'gun': ...
      case 'drone': ...
      case 'miner': case 'mine': ...
      case 'mineral': ...
      case 'missile': ...
    }
    audio.playPickupSound(kind);
  }
}
```

**Удалить:** `Game.applyPickup()` (40 строк)

### 4. Создать `WaveClearSystem.ts`

Переместить проверку завершения волны:

```typescript
class WaveClearSystem {
  check(weaponOrchestrator, entityPool, scoringSystem) {
    // Проверить allSpawned && allKilled
    // Вызвать orchestrator.tryCheckWaveClear()
  }
}
```

**Удалить:** `Game.checkWaveClear()` (16 строк)

### 5. Создать `ZoneSystem.ts` (расширить)

Переместить `Game.updateZoneAndWaves()`:

```typescript
class ZoneSystem {
  update(dt: playerPos, enemies, asteroids, countdownActive) {
    // waveOrchestrator.update(...)
    // scoringSystem.addRunTime(dt)
    // waveOrchestrator.setSpeedMult(...)
  }
}
```

**Удалить:** `Game.updateZoneAndWaves()` (14 строк)

### 6. Переместить `Game.enemyFire()` в `BulletSystem`

```typescript
// BulletSystem.ts
createEnemyBullet(x, y, angle, dmg, heavy, cruiser, speed, life) {
  enemyBulletList.push({
    x: x + Math.cos(angle) * 14,
    y: y + Math.sin(angle) * 14,
    vx: Math.cos(angle) * speed,
    vy: Math.sin(angle) * speed,
    life, dmg, heavy, cruiser
  });
}
```

**Удалить:** `Game.enemyFire()` (14 строк)

## Критерии готовности

- [ ] Game.ts < 600 строк
- [ ] Все системы получают данные только через свои интерфейсы
- [ ] Game.ts не содержит switch/case для бонусов
- [ ] Game.ts не содержит логику клампинга ракет
- [ ] Авто-стрельба через AutoFireSystem.update(dt)
- [ ] Применено: `npm run typecheck` без ошибок

## Зависимости

Эта задача — фундамент для ref_02, ref_03, ref_05. Нужно сделать первой.
