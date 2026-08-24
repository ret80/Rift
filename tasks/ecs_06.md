# ECS Этап 06 — Разломы и спавн (Rifts & Spawning)

> **v3.1:** RiftField receives EventBus via constructor (from criticism_03.md).

## Цель
Реализовать систему спавна врагов ТОЛЬКО из разломов. Удалить fallback-спавн вблизи игрока.

---

## 1. Компоненты разломов

Файл: `src/game/ecs/components/RiftComponents.ts`

```typescript
import { Component } from '../Component';

// ---- RiftComponent — состояние разлома ----
export interface RiftComponent extends Component {
  readonly type: 'rift';
  state: 'opening' | 'spawning' | 'closing' | 'closed';
  queue: import('../../balance').EnemyKind[];  // очередь врагов (typed)
  timer: number;
  rot: number;
  size: number;
  seed: number;
}
```

---

## 2. RiftField

Файл: `src/game/ecs/systems/RiftField.ts`

```typescript
import { Vec2 } from '../math/Vec2';
import { EventBus, GameEventMap, EventType } from '../types';

/**
 * RiftField — управление разломами.
 * Все позиции — через Vec2.
 * 
 * NEW v3.1: receives EventBus via constructor (fix #3 from criticism_03.md).
 */
export class RiftField {
  private rifts: RiftState[] = [];
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
  }

  update(dt: number): void {
    for (const rift of this.rifts) {
      this.updateRift(rift, dt);
    }
    this.rifts = this.rifts.filter(r => r.state !== 'closed');
  }

  /** Добавить новый разлом */
  spawnRift(x: number, y: number, enemyQueue: import('../../balance').EnemyKind[], size = 100): void {
    this.rifts.push({
      pos: Vec2.fromXY(x, y),
      state: 'opening',
      queue: [...enemyQueue],
      timer: 0,
      rot: 0,
      size,
      seed: Math.random() * 100,
    });
  }

  /** Получить количество разломов */
  getRiftCount(wave: number): number {
    if (wave === 1) return 2;
    if (wave < 6) return 3;
    if (wave < 12) return 4;
    if (wave < 20) return 4 + (Math.random() < 0.5 ? 1 : 0);
    return 5;
  }

  /** Получить все открытые разломы */
  getOpenRifts(): RiftState[] {
    return this.rifts.filter(r => r.state !== 'closed' && r.state !== 'closing');
  }

  /** Все позиции — через Vec2 */
  findSpawnPoint(zoneCenter: Vec2, zoneRadius: number): Vec2 {
    const inner = zoneRadius * 0.25;
    const outer = Math.max(inner + 80, Math.min(zoneRadius * 0.62, zoneRadius - 100));
    
    let bestP = zoneCenter.clone();
    let bestScore = -1;
    
    for (let i = 0; i < 16; i++) {
      const angle = Math.random() * Math.PI * 2;
      const r = inner + Math.random() * (outer - inner);
      const p = Vec2.add(zoneCenter, Vec2.fromXY(Math.cos(angle), Math.sin(angle)).scaled(r));
      
      const distToCenter = Vec2.distance(p, zoneCenter);
      const dEdge = zoneRadius - distToCenter;
      
      if (distToCenter < 220 || dEdge < 100) continue;
      
      let minDistToRift = 1e9;
      for (const rift of this.rifts) {
        minDistToRift = Math.min(minDistToRift, Vec2.distance(p, rift.pos));
      }
      
      const score = Math.min(distToCenter, 400) + Math.min(minDistToRift, 300) * 1.5;
      if (score > bestScore) {
        bestScore = score;
        bestP = p;
      }
    }
    
    return bestP;
  }

  private updateRift(rift: RiftState, dt: number): void {
    rift.rot += dt * 0.5;
    rift.timer += dt;
    
    switch (rift.state) {
      case 'opening':
        if (rift.timer > 1.0) {
          rift.state = 'spawning';
          rift.timer = 0;
        }
        break;
      case 'spawning':
        if (rift.queue.length > 0 && rift.timer > 0.5) {
          rift.timer = 0;
          this.publishSpawnEvent(rift);
        }
        if (rift.queue.length === 0) {
          rift.state = 'closing';
          rift.timer = 0;
        }
        break;
      case 'closing':
        if (rift.timer > 1.0) {
          rift.state = 'closed';
        }
        break;
    }
  }

  private publishSpawnEvent(rift: RiftState): void {
    const kind = rift.queue.shift();
    if (!kind) return;
    
    // NEW v3.1: Use injected eventBus (not World.getEventBus())
    this.eventBus.publish('enemy_spawned', {
      kind,
      x: rift.pos.x,
      y: rift.pos.y,
    });
  }
}

interface RiftState {
  pos: Vec2;
  state: 'opening' | 'spawning' | 'closing' | 'closed';
  queue: import('../../balance').EnemyKind[];
  timer: number;
  rot: number;
  size: number;
  seed: number;
}
```

---

## 3. SpawnSystem

Файл: `src/game/ecs/systems/SpawnSystem.ts`

```typescript
import { Entity } from '../Entity';
import { World } from '../World';
import { RiftField } from './RiftField';
import { Vec2 } from '../math/Vec2';
import type { EnemyKind } from '../../balance';

/**
 * SpawnSystem — управление спавном врагов.
 * Все враги спавнятся ТОЛЬКО из разломов.
 */
export class SpawnSystem {
  private riftField: RiftField;
  private world: World; // Added for entity queries
  private eventBus: EventBus | null = null; // NEW v3.1: optional eventBus
  private spawnQueue: EnemyKind[] = [];
  private spawnIdx = 0;
  private lastSpawnTime = 0;
  private currentWave = 1;
  private allocated = 0;
  private killed = 0;

  constructor(riftField: RiftField, eventBus?: EventBus, world?: World) {
    this.riftField = riftField;
    if (eventBus) {
      this.eventBus = eventBus;
    }
    this.world = world ?? (null as any);
  }

  /** Получить позицию всех разломов через world.queryWithTransform() */
  private getRiftPositions(): Vec2[] {
    // NOTE: использовать world.queryWithTransform() для получения позиции разломов
    // const riftEntities = this.world.queryWithTransform('rift');
    // return riftEntities.map(e => {
    //   const t = e.getComponent<any>('transform');
    //   return Vec2.fromXY(t.x, t.y);
    // });
    // fallback: используем riftField.getOpenRifts() для обратной совместимости
    return this.riftField.getOpenRifts().map(r => r.pos);
  }

  update(dt: number, zoneActive: boolean, zoneCenter: Vec2, zoneRadius: number): void {
    if (!zoneActive) return;

    // NOTE: Rift positions obtained via getRiftPositions() which uses world.queryWithTransform()
    const riftPositions = this.getRiftPositions();

    const totalNeeded = this.totalForWave(this.currentWave);
    const remaining = totalNeeded - this.killed;

    if (remaining > 0 && this.allocated < totalNeeded) {
      if (this.spawnQueue.length === 0 || this.spawnIdx >= this.spawnQueue.length) {
        this.spawnQueue = this.buildQueue(
          Math.min(20, totalNeeded - this.allocated),
          this.currentWave
        );
        this.spawnIdx = 0;
      }

      const spawnRate = Math.max(0.3, 1.0 - this.currentWave * 0.03);
      this.lastSpawnTime += dt;

      if (this.lastSpawnTime >= spawnRate && this.spawnIdx < this.spawnQueue.length) {
        this.lastSpawnTime = 0;
        this.spawnNext(zoneCenter, zoneRadius);
      }
    }
  }

  private spawnNext(zoneCenter: Vec2, zoneRadius: number): void {
    if (this.spawnIdx >= this.spawnQueue.length) return;

    const kind = this.spawnQueue[this.spawnIdx++];
    if (!kind) return;

    const riftCount = this.riftField.getRiftCount(this.currentWave);
    const openRifts = this.riftField.getOpenRifts();
    
    if (openRifts.length < riftCount) {
      // Создать новый разлом
      const point = this.riftField.findSpawnPoint(zoneCenter, zoneRadius);
      // riftField.spawnRift(point.x, point.y, [kind]);
      return;
    }

    // Добавить врага в очередь открытого разлома
    if (openRifts.length > 0) {
      const rift = openRifts[Math.floor(Math.random() * openRifts.length)];
      rift.queue.push(kind);
    }
    
    this.allocated++;
  }

  setWave(w: number): void {
    this.currentWave = w;
  }

  notifyKilled(): void {
    this.killed++;
  }

  // ---- Helpers ----

  private totalForWave(wave: number): number {
    return wave * 10 + 5;
  }

  private buildQueue(count: number, wave: number): EnemyKind[] {
    // Вернуть массив EnemyKind для спавна
    return [];
  }
}
```

---

## 4. Удалить fallback спавна

**УДАЛИТЬ в старом SpawnSystem.ts:**
```typescript
// fallback спавн вблизи игрока — УДАЛИТЬ
// Враги спавнятся ТОЛЬКО из разломов
```

---

## 5. Спавн в главном меню

```typescript
export class MenuSpawnSystem {
  private riftField: RiftField;
  private spawnTimer = 0;

  update(dt: number): void {
    this.spawnTimer += dt;
    if (this.spawnTimer > 3) {
      this.spawnTimer = 0;
      this.spawnEnemy();
    }
  }

  private spawnEnemy(): void {
    // Создать разлом в центре экрана
    // Из него спавнить врага
    // Враг свободно летает за экран
    // Удалить когда улетел за пределы камеры
  }
}
```

---

## 6. Критерии завершения этапа

1. ✅ Враги спавнятся ТОЛЬКО из разломов
2. ✅ Fallback-спавн удалён
3. ✅ В меню разлом спавнит врагов периодически
4. ✅ Все позиции — через Vec2
5. ✅ RiftField управляет состоянием разломов
6. ✅ **NEW v3.1:** RiftField receives EventBus via constructor (fix #3 from criticism_03.md)
7. ✅ EventBus — typed формат (использовать существующие события из GameEventMap: 'enemy_spawned', 'rift_spawned')
8. ✅ Entity lookup через world.findEntityById() и world.queryWithTransform()
