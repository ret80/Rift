# ECS Этап 08 — Подбираемые предметы (Pickups)

> **v3.1:** Architecturally correct — no changes needed.

## Цель
Перенести pickups на ECS: компоненты для данных, системы для дропа и применения.

---

## 1. Компоненты pickups

Файл: `src/game/ecs/components/PickupComponents.ts`

```typescript
import { Component } from '../Component';

// ---- PickupKindComponent — тип подбираемого предмета ----
export interface PickupKindComponent extends Component {
  readonly type: 'pickupKind';
  kind: 'health' | 'rate' | 'gun' | 'drone' | 'missile' | 'minerals';
}

// ---- PickupLifetimeComponent — время жизни pickup ----
export interface PickupLifetimeComponent extends Component {
  readonly type: 'pickupLifetime';
  life: number; // секунд до исчезновения
}
```

---

## 2. Фабрика для pickups

```typescript
// В EntityFactory добавить:

createPickup(x: number, y: number, kind: string): Entity {
  const colors: Record<string, string> = {
    health: '#00FF00',
    rate: '#FFFF00',
    gun: '#FF8800',
    drone: '#00BFFF',
    missile: '#00FF88',
    minerals: '#FFD700',
  };
  
  const entity = this.createBase('pickup', x, y, {
    radius: 12,
    mass: 0,
    static: true,
    angularSpeed: 0.5,
    rotate: true,
    render: {
      strokeColor: colors[kind] ?? '#FFFFFF',
      strokeWidth: 2,
      glowIntensity: 4,
      glowColor: colors[kind] ?? '#FFFFFF',
    },
  });
  
  // Добавить компоненты
  entity.addComponent({
    type: 'pickupKind' as any,
    kind: kind as any,
  } as any);
  
  entity.addComponent({
    type: 'pickupLifetime' as any,
    life: 15, // 15 секунд
  } as any);
  
  // Collision Layer — Pickup
  entity.addComponent({
    type: 'collisionLayer' as any,
    layer: 0x80, // PICKUP layer
  } as any);
  
  return entity;
}
```

---

## 3. PickupDropSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/PickupDropSystem.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';

/**
 * PickupDropSystem — дроп предметов при смерти врагов.
 * 
 * ✅ v3: имеет world: World для findEntityById
 * ✅ v3: использует typed event enemy_killed
 */
export class PickupDropSystem {
  private world: World;
  private factory: import('../EntityFactory').EntityFactory;
  private eventBus: import('../types').IEventBus;
  private activePickups: Entity[] = [];

  constructor(
    world: World,
    factory: import('../EntityFactory').EntityFactory,
    eventBus: import('../types').IEventBus
  ) {
    this.world = world;
    this.factory = factory;
    this.eventBus = eventBus;
    
    // Подписаться на события смерти
    this.setupListeners();
  }

  private setupListeners(): void {
    // v3: typed event — EnemyDiedPayload
    this.eventBus.subscribe('enemy_killed', (event) => {
      const payload = event.payload; // Typed! { entityId, scoreValue, kind, x, y }
      
      // В реальной реализации — найти врага по ID и создать дроп
      this.tryDropFromEnemy(payload.entityId);
    });
  }

  /** Попробовать создать дроп из мёртвого врага */
  private tryDropFromEnemy(enemyId: number): void {
    // Шанс дропа 15%
    if (Math.random() > 0.15) return;
    
    // v3: find entity by ID for position
    const enemy = this.world.findEntityById(enemyId);
    if (!enemy) return;
    
    const transform = enemy.getComponent<any>('transform');
    if (!transform) return;
    
    // Выбор типа предмета
    const kinds: Array<'health' | 'rate' | 'gun' | 'drone' | 'missile'> = [
      'health', 'rate', 'gun', 'drone', 'missile',
    ];
    const kind = kinds[Math.floor(Math.random() * kinds.length)];
    
    // Позиция — позиция мёртвого врага
    const pos = Vec2.fromXY(transform.x, transform.y);
    
    // Создать pickup
    const pickup = this.factory.createPickup(pos.x, pos.y, kind);
    this.activePickups.push(pickup);
  }

  /** Обновить все активные pickups */
  update(dt: number): void {
    for (const pickup of this.activePickups) {
      const lifetime = pickup.getComponent<any>('pickupLifetime');
      if (lifetime) {
        lifetime.life -= dt;
      }
    }
    
    // Удалить истёкшие
    this.activePickups = this.activePickups.filter(p => {
      const lifetime = p.getComponent<any>('pickupLifetime');
      return lifetime ? lifetime.life > 0 : true;
    });
  }

  getPickups(): Entity[] {
    return [...this.activePickups];
  }
}
```

---

## 4. ApplyPickupSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/ApplyPickupSystem.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';

/**
 * ApplyPickupSystem — применение подбираемых предметов.
 * 
 * ✅ v3: использует world.findEntityById() для поиска pickup
 * ✅ v3: все события typed
 */
export class ApplyPickupSystem {
  private world: World;
  private eventBus: import('../types').IEventBus;

  constructor(
    world: World,
    eventBus: import('../types').IEventBus
  ) {
    this.world = world;
    this.eventBus = eventBus;
    this.setupListeners();
  }

  private setupListeners(): void {
    // v3: typed event — PickupCollectedPayloadEcs
    this.eventBus.subscribe('pickup_collected', (event) => {
      const payload = event.payload; // Typed! { kind: string; x: number; y: number; }
      // Note: kind and position available, entity lookup done in handler
      // This system processes the event by kind, not by entity ID
      this.applyFromEvent(payload);
    });
  }

  /** Обработать событие из typed payload */
  private applyFromEvent(payload: { kind: string; x: number; y: number }): void {
    // Note: pickup entity is already removed by this point (collision triggered event)
    // We apply effects based on kind, not entity lookup
    switch (payload.kind) {
      case 'health':
        this.healPlayer();
        break;
      case 'rate':
        this.boostRate();
        break;
      case 'gun':
        this.addGun();
        break;
      case 'drone':
        this.spawnAllyDrone();
        break;
      case 'missile':
        this.activateMissileLauncher();
        break;
      case 'minerals':
        this.addMinerals();
        break;
    }
  }

  /**
   * Применить pickup по ID (для случаев где нужен entity lookup).
   * v3: uses world.findEntityById() to find pickup entity.
   */
  apply(pickupId: number): void {
    // v3: world.findEntityById for entity lookup
    const pickup = this.world.findEntityById(pickupId);
    if (!pickup) return;
    
    const kind = pickup.getComponent<any>('pickupKind');
    if (!kind) return;

    switch (kind.kind) {
      case 'health':
        this.healPlayer();
        break;
      case 'rate':
        this.boostRate();
        break;
      case 'gun':
        this.addGun();
        break;
      case 'drone':
        this.spawnAllyDrone();
        break;
      case 'missile':
        this.activateMissileLauncher();
        break;
      case 'minerals':
        this.addMinerals();
        break;
    }

    // Уничтожить pickup — typed event
    this.eventBus.publish('destroy_entity', { entityId: pickup.id });
  }

  private healPlayer(): void {
    // v3: typed event — HealPlayerPayload
    this.eventBus.publish('heal_player', { amount: 0.25 }); // 25% max HP
  }

  private boostRate(): void {
    // v3: typed event — BoostFireRatePayload
    this.eventBus.publish('boost_fire_rate', {});
  }

  private addGun(): void {
    // v3: typed event — AddGunPayload
    this.eventBus.publish('add_gun', {});
  }

  private spawnAllyDrone(): void {
    // v3: typed event — SpawnAllyDronePayload
    this.eventBus.publish('spawn_ally_drone', {});
  }

  private activateMissileLauncher(): void {
    // v3: typed event — ActivateMissileLauncherPayload
    this.eventBus.publish('activate_missile_launcher', { duration: 15 });
  }

  private addMinerals(): void {
    // TODO: добавить валюту
  }
}
```

---

## 5. Удалить

- `src/game/systems/PickupSystem.ts` (старый)
- `src/game/systems/PickupDropSystem.ts` (старый)
- `src/game/systems/PickupCollection.ts`

---

## 6. Критерии завершения этапа

1. ✅ Pickups — Entity + компоненты
2. ✅ `PickupDropSystem` создаёт дроп при смерти
3. ✅ `ApplyPickupSystem` применяет эффекты
4. ✅ Pickups имеют lifetime (15 секунд)
5. ✅ ✅ Pickups use `world.findEntityById()` for lookups
6. ✅ ✅ All events typed (enemy_killed, pickup_collected)
7. ✅ ✅ PickupDropSystem has world reference
8. ✅ Все старые системы pickups удалены
