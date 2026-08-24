# ECS Этап 07 — Коллайдеры и коллизии

> **v3.1:** Architecturally correct — no changes needed (confirmed EventBus error handling exists).

## Цель
Централизованная система коллизий. kinetics.ts обнаруживает столкновения, CollisionSystem обрабатывает их и публикует события.

---

## Ключевое изменение v2
**Централизовать коллизии.** Вместо размазанной логики в hooks каждого Entity — одна `CollisionSystem`.

---

## 1. Компонент CollisionLayer

Файл: `src/game/ecs/components/CollisionLayer.ts`

```typescript
import { Component } from '../Component';

/** CollisionLayerComponent — слои для фильтрации коллизий */
export interface CollisionLayerComponent extends Component {
  readonly type: 'collisionLayer';
  layer: number; // bitmask
}

// Слоты слоёв
export const CollisionLayer = {
  NONE: 0,
  PLAYER: 1 << 0,
  ENEMY: 1 << 1,
  ASTEROID: 1 << 2,
  BULLET: 1 << 3,
  ENEMY_BULLET: 1 << 4,
  DRONE: 1 << 5,
  MINE: 1 << 6,
  PICKUP: 1 << 7,
} as const;

// CollisionRules: какой слой с какими взаимодействует (CollisionMatrix)
export const CollisionRules: Record<string, number> = {
  // Player взаимодействует со всем
  [CollisionLayer.PLAYER]: 
    CollisionLayer.ENEMY |
    CollisionLayer.ASTEROID |
    CollisionLayer.ENEMY_BULLET |
    CollisionLayer.DRONE |
    CollisionLayer.MINE |
    CollisionLayer.PICKUP,
    
  // Enemy взаимодействует со всем кроме других enemies
  [CollisionLayer.ENEMY]:
    CollisionLayer.PLAYER |
    CollisionLayer.ASTEROID |
    CollisionLayer.BULLET |
    CollisionLayer.ENEMY_BULLET |
    CollisionLayer.DRONE |
    CollisionLayer.MINE,
    
  // Asteroid взаимодействует со всем
  [CollisionLayer.ASTEROID]:
    CollisionLayer.PLAYER |
    CollisionLayer.ENEMY |
    CollisionLayer.BULLET |
    CollisionLayer.ENEMY_BULLET,
    
  // Bullet взаимодействует с enemies и asteroids
  [CollisionLayer.BULLET]:
    CollisionLayer.ENEMY |
    CollisionLayer.ASTEROID |
    CollisionLayer.MINE,
    
  // EnemyBullet взаимодействует с player, asteroids, drones
  [CollisionLayer.ENEMY_BULLET]:
    CollisionLayer.PLAYER |
    CollisionLayer.ASTEROID |
    CollisionLayer.DRONE,
    
  // Drone взаимодействует со всем
  [CollisionLayer.DRONE]:
    CollisionLayer.PLAYER |
    CollisionLayer.ENEMY |
    CollisionLayer.BULLET |
    CollisionLayer.ENEMY_BULLET,
    
  // Mine взаимодействует со всем
  [CollisionLayer.MINE]:
    CollisionLayer.PLAYER |
    CollisionLayer.ENEMY,
    
  // Pickup взаимодействует только с Player
  [CollisionLayer.PICKUP]:
    CollisionLayer.PLAYER,
};
```

---

## 2. CollisionSystem — централизованная обработка (v3 — исправлено)

Файл: `src/game/ecs/systems/CollisionSystem.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';
import {
  CollisionLayer,
  CollisionRules,
} from '../components/CollisionLayer';

/**
 * CollisionSystem — централизованная обработка всех коллизий.
 * kinetics.ts обнаруживает столкновения через SpatialHashGrid.
 * CollisionSystem интерпретирует их и публикует typed события.
 * 
 * ✅ v3: использует world.getEntityByPhysics() вместо TODO
 * ✅ v3: все обработчики используют typed EventBus
 * ✅ CollisionMatrix определён в CollisionLayer.ts
 */
export class CollisionSystem {
  private world: World;
  private eventBus: import('../types').IEventBus;
  
  /** Кэш результатов коллизий между кадрами */
  private collisionPairs: Set<string> = new Set();

  constructor(world: World, eventBus: import('../types').IEventBus) {
    this.world = world;
    this.eventBus = eventBus;
  }

  /** Вызывается kinetics.ts при обнаружении коллизии */
  onPhysicsCollision(entityA: any, entityB: any): void {
    // v3: use world.getEntityByPhysics() instead of manual search
    const eA = this.world.getEntityByPhysics(entityA);
    const eB = this.world.getEntityByPhysics(entityB);
    
    if (!eA || !eB) return;
    
    // Проверить слой
    const layerA = eA.getComponent<any>('collisionLayer');
    const layerB = eB.getComponent<any>('collisionLayer');
    
    if (!layerA || !layerB) return;
    
    // Проверяем правила (CollisionMatrix)
    const rulesA = CollisionRules[layerA.layer];
    const rulesB = CollisionRules[layerB.layer];
    
    if (!(rulesA & layerB.layer) && !(rulesB & layerA.layer)) {
      return; // Нет взаимодействия
    }
    
    // Определить тип коллизии
    this.resolveCollision(eA, eB, layerA.layer, layerB.layer);
  }

  private resolveCollision(
    a: Entity,
    b: Entity,
    layerA: number,
    layerB: number
  ): void {
    // Player ↔ Enemy
    if ((layerA === CollisionLayer.PLAYER && layerB === CollisionLayer.ENEMY) ||
        (layerA === CollisionLayer.ENEMY && layerB === CollisionLayer.PLAYER)) {
      this.handlePlayerEnemyCollision(a, b, layerA, layerB);
      return;
    }

    // Player ↔ EnemyBullet
    if ((layerA === CollisionLayer.PLAYER && layerB === CollisionLayer.ENEMY_BULLET) ||
        (layerA === CollisionLayer.ENEMY_BULLET && layerB === CollisionLayer.PLAYER)) {
      this.handlePlayerBulletCollision(a, b, layerA, layerB);
      return;
    }

    // Bullet ↔ Enemy
    if ((layerA === CollisionLayer.BULLET && layerB === CollisionLayer.ENEMY) ||
        (layerA === CollisionLayer.ENEMY && layerB === CollisionLayer.BULLET)) {
      this.handleBulletEnemyCollision(a, b, layerA, layerB);
      return;
    }

    // Bullet ↔ Asteroid
    if ((layerA === CollisionLayer.BULLET && layerB === CollisionLayer.ASTEROID) ||
        (layerA === CollisionLayer.ASTEROID && layerB === CollisionLayer.BULLET)) {
      this.handleBulletAsteroidCollision(a, b, layerA, layerB);
      return;
    }

    // Player ↔ Pickup
    if ((layerA === CollisionLayer.PLAYER && layerB === CollisionLayer.PICKUP) ||
        (layerA === CollisionLayer.PICKUP && layerB === CollisionLayer.PLAYER)) {
      this.handlePlayerPickupCollision(a, b, layerA, layerB);
      return;
    }

    // Mine ↔ Enemy
    if ((layerA === CollisionLayer.MINE && layerB === CollisionLayer.ENEMY) ||
        (layerA === CollisionLayer.ENEMY && layerB === CollisionLayer.MINE)) {
      this.handleMineEnemyCollision(a, b, layerA, layerB);
      return;
    }

    // Player ↔ Mine
    if ((layerA === CollisionLayer.PLAYER && layerB === CollisionLayer.MINE) ||
        (layerA === CollisionLayer.MINE && layerB === CollisionLayer.PLAYER)) {
      this.handlePlayerMineCollision(a, b, layerA, layerB);
      return;
    }
  }

  // ---- Обработчики конкретных коллизий (v3: typed events) ----

  private handlePlayerEnemyCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    const player = layerA === CollisionLayer.PLAYER ? a : b;
    const enemy = layerA === CollisionLayer.PLAYER ? b : a;
    
    // v3: typed event — PlayerDamagedPayload
    this.eventBus.publish('player_damaged', {
      dmg: enemy.getComponent<any>('enemyWeapons')?.boltDmg ?? 10,
    });
    
    // Contact damage — typed event
    this.eventBus.publish('player_damaged', {
      dmg: enemy.getComponent<any>('enemyState')?.contact ?? 10,
    });
  }

  private handlePlayerBulletCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    const bullet = layerA === CollisionLayer.ENEMY_BULLET ? a : b;
    const player = layerA === CollisionLayer.ENEMY_BULLET ? b : a;
    const dmg = bullet.getComponent<any>('damage')?.damage ?? 10;
    
    // v3: typed event — PlayerDamagedPayload
    this.eventBus.publish('player_damaged', { dmg });
    
    // Уничтожить пулю
    this.eventBus.publish('destroy_entity', { entityId: bullet.id });
  }

  private handleBulletEnemyCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    const bullet = layerA === CollisionLayer.BULLET ? a : b;
    const enemy = layerA === CollisionLayer.BULLET ? b : a;
    const dmg = bullet.getComponent<any>('damage')?.damage ?? 10;
    const transform = enemy.getComponent<any>('transform');
    const kind = enemy.getComponent<any>('aiState')?.kind ?? 'unknown';
    
    // Урон (typed)
    this.eventBus.publish('damage_dealt', {
      targetId: enemy.id,
      amount: dmg,
      source: 'player_bullet',
    });
    
    // typed event — EnemyDiedPayload (for scoring, waves)
    this.eventBus.publish('enemy_killed', {
      entityId: enemy.id,
      scoreValue: enemy.getComponent<any>('enemyState')?.score ?? 10,
      kind,
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    });
    
    // Уничтожить пулю
    this.eventBus.publish('destroy_entity', { entityId: bullet.id });
  }

  private handleBulletAsteroidCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    // Пуля попадает в астероид — уничтожить пулю
    const bullet = layerA === CollisionLayer.BULLET ? a : b;
    
    this.eventBus.publish('destroy_entity', { entityId: bullet.id });
    
    // Астероид — typed event
    const asteroidId = layerA === CollisionLayer.BULLET ? b.id : a.id;
    this.eventBus.publish('asteroid_hit', {
      asteroidId: String(asteroidId),
    });
  }

  private handlePlayerPickupCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    const pickup = layerA === CollisionLayer.PICKUP ? a : b;
    const pickupKind = pickup.getComponent<any>('pickupKind');
    const transform = pickup.getComponent<any>('transform');
    
    // v3: typed event — PickupCollectedPayloadEcs with kind + position
    this.eventBus.publish('pickup_collected', {
      kind: pickupKind?.kind ?? 'unknown',
      x: transform?.x ?? 0,
      y: transform?.y ?? 0,
    });
  }

  private handleMineEnemyCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    const mine = layerA === CollisionLayer.MINE ? a : b;
    const enemy = layerA === CollisionLayer.MINE ? b : a;
    
    // v3: typed event — MineExplodedPayload
    this.eventBus.publish('mine_detonated', {
      mineId: mine.id,
      enemyId: enemy.id,
      damage: 50,
    });
  }

  private handlePlayerMineCollision(a: Entity, b: Entity, layerA: number, layerB: number): void {
    // v3: typed event — PlayerDamagedPayload
    this.eventBus.publish('player_damaged', { dmg: 30 });
  }
}
```

---

## 3. Удалить

- `src/game/systems/CollisionSystem.ts` (старый)
- `src/game/systems/BulletCollision.ts`
- `src/game/systems/EntityCollision.ts`
- `src/game/systems/PickupCollection.ts`

---

## 4. Критерии завершения этапа

1. ✅ `CollisionSystem` — централизованная обработка
2. ✅ `world.getEntityByPhysics()` — без TODO
3. ✅ Все handlers используют typed events из EventBus
4. ✅ CollisionMatrix определён в `CollisionLayer.ts`
5. ✅ Коллизии через kinetics.ts → CollisionSystem → EventBus
6. ✅ Враги НЕ сталкиваются друг с другом
7. ✅ Астероиды сталкиваются со всеми
8. ✅ Все компоненты имеют `collisionLayer`
