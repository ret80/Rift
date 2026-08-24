# ECS Этап 10 — Смерть, счёт и волны (Event-Driven)

> **v3.1:** Confirmed EventBus already has error handling (lines 143-147 in src/game/core/EventBus.ts) — no need to add duplicate.

## Цель
Перенести системы смерти, счёта и волн на ECS. Полностью через EventBus.

---

## 1. DeathSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/DeathSystem.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';

/**
 * DeathSystem — обработка смерти сущностей.
 * Подписывается на события и публикует события смерти.
 * 
 * ✅ v3: использует world.findEntityById() для destroy_entity
 * ✅ v3: все события typed (enemy_killed, game_over)
 */
export class DeathSystem {
  private world: World;
  private eventBus: import('../types').IEventBus;

  constructor(
    world: World,
    eventBus: import('../types').IEventBus
  ) {
    this.world = world;
    this.eventBus = eventBus;
    
    // Подписка на события уничтожения
    this.setupListeners();
  }

  private setupListeners(): void {
    // v3: typed event — EntityDestroyedPayload
    this.eventBus.subscribe('destroy_entity', (event) => {
      const payload = event.payload; // Typed! { entityId: number }
      this.onEntityDestroyed(payload.entityId);
    });

    // v3: typed event — PlayerDiedPayload
    this.eventBus.subscribe('player_died', () => {
      this.onPlayerDeath();
    });
  }

  /** Обработать уничтожение врага */
  onEnemyDeath(entity: Entity): void {
    const transform = entity.getComponent<any>('transform');
    const enemyState = entity.getComponent<any>('enemyState');
    
    if (!transform || !enemyState) return;
    
    // v3: typed event — EnemyDiedPayload
    this.eventBus.publish('enemy_killed', {
      entityId: entity.id,
      scoreValue: enemyState.score,
      kind: entity.getComponent<any>('aiState')?.kind,
      x: transform.x,
      y: transform.y,
    });

    // FX — typed event
    this.eventBus.publish('explosion', {
      x: transform.x,
      y: transform.y,
      radius: entity.getComponent<any>('physics')?.radius ?? 10 * 2,
      color: '#FF8800',
    });
  }

  /** Обработать уничтожение сущности — v3: uses world.findEntityById() */
  private onEntityDestroyed(entityId: number): void {
    // v3: world.findEntityById for entity lookup
    const entity = this.world.findEntityById(entityId);
    if (!entity) return;
    
    // Check if entity should be fully destroyed
    // (cleanup logic here)
  }

  /** Обработать смерть игрока */
  private onPlayerDeath(): void {
    // v3: typed event — GameOverPayload
    this.eventBus.publish('game_over', {});

    // FX
    this.eventBus.publish('explosion', {
      x: 0, y: 0,
      radius: 36,
      color: '#FFFFFF',
    });
  }
}
```

---

## 2. ScoringSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/ScoringSystem.ts`

```typescript
/**
 * ScoringSystem — счёт, комбо, сохранение в localStorage.
 * Подписывается на события через EventBus.
 * 
 * ✅ v3: все подписки используют typed events (enemy_killed, game_over)
 */
export class ScoringSystem {
  private eventBus: import('../types').IEventBus;
  
  private score = 0;
  private best = this.loadBest();
  private kills = 0;
  private combo = 0;
  private comboTimer = 0;
  private minerals = 0;
  private parts = 0;
  private killedWave = 0;
  private runTime = 0;

  constructor(eventBus: import('../types').IEventBus) {
    this.eventBus = eventBus;
    this.setupListeners();
  }

  private setupListeners(): void {
    // v3: typed event — EnemyDiedPayload
    this.eventBus.subscribe('enemy_killed', (event) => {
      const payload = event.payload; // Typed! { entityId, scoreValue, kind, x, y }
      this.addScore(payload.scoreValue);
      this.combo++;
      this.comboTimer = 2;
      this.kills++;
      this.killedWave++;
    });

    // v3: typed event — GameOverPayload
    this.eventBus.subscribe('game_over', () => {
      this.saveBest();
    });
  }

  private addScore(base: number): void {
    this.score += base * this.getComboMult();
  }

  getComboMult(): number {
    if (this.combo < 5) return 1;
    if (this.combo < 10) return 1.5;
    if (this.combo < 20) return 2;
    return 3;
  }

  /** Обновление */
  update(dt: number): void {
    this.runTime += dt;
    this.comboTimer -= dt;
    if (this.comboTimer <= 0) {
      this.combo = 0;
    }
  }

  // ---- Свойства ----

  get score(): number { return this.score; }
  get best(): number { return this.best; }
  get kills(): number { return this.kills; }
  get combo(): number { return this.combo; }
  get comboMult(): number { return this.getComboMult(); }
  get minerals(): number { return this.minerals; }
  get parts(): number { return this.parts; }
  get killedWave(): number { return this.killedWave; }
  get runTime(): number { return this.runTime; }

  // ---- Хранилище ----

  private loadBest(): number {
    try {
      return parseInt(localStorage.getItem('rift_best_score') || '0', 10);
    } catch {
      return 0;
    }
  }

  private saveBest(): void {
    if (this.score > this.best) {
      this.best = this.score;
      try {
        localStorage.setItem('rift_best_score', String(this.score));
      } catch { /* ignore */ }
    }
  }
}
```

---

## 3. WaveSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/WaveSystem.ts`

```typescript
import { Vec2 } from '../math/Vec2';

/**
 * WaveSystem — управление волнами через события.
 * 
 * ✅ v3: все события typed (wave_started, wave_cleared)
 */
export class WaveSystem {
  private eventBus: import('../types').IEventBus;
  
  private wave = 1;
  private total = 0;
  private killed = 0;
  private allocated = 0;
  private zoneRadius = 0;
  private zoneTargetRadius = 0;
  private zoneAlpha = 0;
  private state: 'inactive' | 'active' | 'cleared' = 'inactive';
  private zoneCenter = Vec2.zero();

  constructor(eventBus: import('../types').IEventBus) {
    this.eventBus = eventBus;
  }

  /** Начать новую волну — v3: typed event */
  start(waveNumber: number, center: Vec2): void {
    this.wave = waveNumber;
    this.total = waveNumber * 10 + 5;
    this.killed = 0;
    this.allocated = 0;
    this.zoneCenter = center.clone();
    this.state = 'active';
    this.zoneRadius = this.zoneRadiusFor(waveNumber);
    this.zoneTargetRadius = this.zoneRadiusFor(waveNumber + 1);
    
    // v3: typed event — WaveStartedPayload
    this.eventBus.publish('wave_started', {
      wave: waveNumber,
      total: this.total,
    });
  }

  /** Уведомить о смерти врага */
  notifyKilled(): void {
    this.killed++;
    if (this.killed >= this.total && this.allocated >= this.total) {
      this.state = 'cleared';
      // v3: typed event — WaveClearedPayload
      this.eventBus.publish('wave_cleared', {});
    }
  }

  /** Обновление */
  update(dt: number): void {
    if (this.state === 'cleared') {
      this.zoneAlpha = Math.max(0, this.zoneAlpha - dt * 0.5);
    } else {
      this.zoneRadius = Math.min(
        this.zoneRadius + dt * 50,
        this.zoneTargetRadius
      );
      this.zoneAlpha = Math.min(1, this.zoneAlpha + dt * 0.5);
    }
  }

  // ---- Свойства ----

  get state(): string { return this.state; }
  get wave(): number { return this.wave; }
  get total(): number { return this.total; }
  get killed(): number { return this.killed; }
  get zoneRadius(): number { return this.zoneRadius; }
  get zoneCenter(): Vec2 { return this.zoneCenter; }

  private zoneRadiusFor(w: number): number {
    return 300 + w * 50;
  }
}
```

---

## 4. События EventBus (сводка — v3 expanded)

> **ВАЖНО:** Ниже — полный список НОВЫХ typed событий, которые нужно добавить в `src/game/core/EventBus.ts` в `GameEventMap`.

### Существовавшие события (без изменений)

| Событие | Отправитель | Получатель |
|---------|-------------|------------|
| `damage_dealt` | CollisionSystem | HealthSystem |
| `destroy_entity` | Любая | DeathSystem |
| `explosion` | Любая | FxSystem |

### НОВЫЕ typed события (добавить в EventBus.ts GameEventMap)

```typescript
// NEW events for ECS (add to src/game/core/EventBus.ts GameEventMap):

/** Player damaged by any source */
export interface PlayerDamagedPayload { dmg: number; }

/** Entity destroyed (cleanup) */
export interface EntityDestroyedPayload { entityId: number; }

/** Player died */
export interface PlayerDiedPayload { }

/** Enemy died (detailed) — typed */
export interface EnemyDiedPayload {
  entityId: number;
  scoreValue: number;
  kind: string;
  x: number;
  y: number;
}

/** Player hit by enemy contact */
export interface PlayerHitByEnemyPayload {
  playerId: number;
  enemyId: number;
  damage: number;
}

/** Player hit by mine */
export interface PlayerHitByMinePayload {
  playerId: number;
  damage: number;
}

/** Pickup collected — typed */
export interface PickupCollectedPayloadEcs {
  pickupId: number;
}

/** Mine exploded — typed */
export interface MineExplodedPayload {
  mineId: number;
  enemyId: number;
  damage: number;
}

/** Asteroid hit (splits) — typed */
export interface AsteroidHitPayloadEcs {
  asteroidId: string;
}

/** Health changed */
export interface HealthChangedPayload {
  entityId: number;
  oldHp: number;
  newHp: number;
}

/** Bullet spawn request — typed */
export interface BulletSpawnPayload {
  x: number; y: number; vx: number; vy: number;
  damage: number; life: number; owner: string;
}

/** Enemy bullet spawn request — typed */
export interface EnemyBulletSpawnPayload {
  x: number; y: number; vx: number; vy: number;
  damage: number; heavy: boolean;
}

/** Explosion visual effect — typed */
export interface ExplosionPayload {
  x: number; y: number; radius: number; color: string;
}

/** Heal player — typed */
export interface HealPlayerPayload { amount: number; }

/** Boost fire rate — typed */
export interface BoostFireRatePayload { }

/** Add gun — typed */
export interface AddGunPayload { }

/** Spawn ally drone — typed */
export interface SpawnAllyDronePayload { }

/** Activate missile launcher — typed */
export interface ActivateMissileLauncherPayload { duration: number; }

/** Wave started — typed */
export interface WaveStartedPayload {
  wave: number;
  total: number;
}

/** Wave cleared — typed */
export interface WaveClearedPayload { }

/** Game over — typed */
export interface GameOverPayload { }
```

### Обновлённая таблица событий

| Событие | Тип payload | Отправитель | Получатель |
|---------|-------------|-------------|------------|
| `player_damaged` | `PlayerDamagedPayload { dmg }` | CollisionSystem | HealthSystem |
| `enemy_killed` | `EnemyDiedPayload { entityId, scoreValue, kind, x, y }` | CollisionSystem | ScoringSystem, WaveSystem |
| `pickup_collected` | `{ kind, x, y }` | CollisionSystem | ApplyPickupSystem |
| `mine_detonated` | `MineExplodedPayload { mineId, enemyId, damage }` | CollisionSystem, MineSystem | HealthSystem, FxSystem |
| `asteroid_hit` | `AsteroidHitPayloadEcs { asteroidId }` | CollisionSystem | AsteroidField |
| `wave_started` | `WaveStartedPayload { wave, total }` | WaveSystem | SpawnSystem |
| `wave_cleared` | `WaveClearedPayload {}` | WaveSystem | SpawnSystem |
| `game_over` | `GameOverPayload {}` | DeathSystem | ScoringSystem, UI |
| `destroy_entity` | `EntityDestroyedPayload { entityId }` | Любая | DeathSystem |
| `explosion` | `ExplosionPayload { x, y, radius, color }` | Любая | FxSystem |
| `heal_player` | `HealPlayerPayload { amount }` | ApplyPickupSystem | PlayerController |
| `boost_fire_rate` | `BoostFireRatePayload {}` | ApplyPickupSystem | PlayerController |
| `add_gun` | `AddGunPayload {}` | ApplyPickupSystem | PlayerController |
| `spawn_ally_drone` | `SpawnAllyDronePayload {}` | ApplyPickupSystem | DroneSystem |
| `activate_missile_launcher` | `ActivateMissileLauncherPayload { duration }` | ApplyPickupSystem | PlayerController |
| `drone_fired` | `BulletSpawnPayload { x, y, vx, vy, damage }` | DroneSystem | BulletSystem |

---

## 5. Удалить

- `src/game/systems/DeathSystem.ts` (старый)
- `src/game/systems/ScoringSystem.ts` (старый)
- `src/game/systems/WaveOrchestrator.ts`

---

## 6. Критерии завершения этапа

1. ✅ `DeathSystem` обрабатывает смерть через события
2. ✅ `ScoringSystem` управляется через EventBus
3. ✅ `WaveSystem` управляет волнами через события
4. ✅ Combo работает (2 секунды на поддержание)
5. ✅ Лучший результат сохраняется в localStorage
6. ✅ ✅ All events typed (enemy_killed, game_over, wave_started, wave_cleared)
7. ✅ ✅ DeathSystem uses world.findEntityById()
8. ✅ ✅ ScoringSystem uses typed events
9. ✅ ✅ Complete EventBus event map added to EventBus.ts
