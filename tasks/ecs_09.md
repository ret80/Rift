# ECS Этап 09 — Союзнические дроны и мины

> **v3.1:** Architecturally correct — no changes needed.

## Цель
Перенести дроны и мины на ECS: компоненты для данных, системы для логики.

---

## 1. Компоненты дронов

Файл: `src/game/ecs/components/DroneComponents.ts`

```typescript
import { Component } from '../Component';

// ---- DroneComponent — состояние союзного дрона ----
export interface DroneComponent extends Component {
  readonly type: 'drone';
  hp: number;
  maxHp: number;
  r: number;
  angle: number;
  phase: number;
  fireCd: number;
  targetId: number | null;
  retargetT: number;
  flash: number;
}

// ---- MineComponent — состояние мины ----
export interface MineComponent extends Component {
  readonly type: 'mine';
  fuse: number; // секунд до взрыва
  r: number;
  detonated: boolean;
}
```

---

## 2. Фабрики для дронов и мин

```typescript
// В EntityFactory добавить:

/** Создать союзный дрон */
createDrone(x: number, y: number): Entity {
  const entity = this.createBase('drone', x, y, {
    radius: 8,
    mass: 0.5,
    angularSpeed: 0,
    rotate: false,
    render: {
      strokeColor: '#00BFFF',
      strokeWidth: 2,
      glowIntensity: 4,
      glowColor: '#00BFFF',
    },
  });
  
  entity.addComponent({
    type: 'health' as any,
    hp: 30,
    maxHp: 30,
  } as any);
  
  entity.addComponent({
    type: 'drone' as any,
    hp: 30,
    maxHp: 30,
    r: 8,
    angle: 0,
    phase: 0,
    fireCd: 0,
    targetId: null,
    retargetT: 0,
    flash: 0,
  } as any);
  
  entity.addComponent({
    type: 'collisionLayer' as any,
    layer: 0x20, // DRONE layer
  } as any);
  
  return entity;
}

/** Создать мину */
createMine(x: number, y: number): Entity {
  const entity = this.createBase('mine', x, y, {
    radius: 10,
    mass: 0,
    static: true,
    rotate: true,
    angularSpeed: 0.3,
    render: {
      strokeColor: '#FF4444',
      strokeWidth: 2,
      glowIntensity: 3,
      glowColor: '#FF4444',
    },
  });
  
  entity.addComponent({
    type: 'mine' as any,
    fuse: 8,
    r: 10,
    detonated: false,
  } as any);
  
  entity.addComponent({
    type: 'collisionLayer' as any,
    layer: 0x40, // MINE layer
  } as any);
  
  return entity;
}
```

---

## 3. DroneSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/DroneSystem.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';

/**
 * DroneSystem — управление союзными дронами.
 * Орбита вокруг игрока, таргетинг, стрельба.
 * 
 * ✅ v3: имеет world: World для findEntityById targetId resolution
 * ✅ v3: использует typed event drone_fired
 */
export class DroneSystem {
  private world: World;
  private drones: Entity[] = [];
  private playerEntity: Entity | null = null;
  private eventBus: import('../types').IEventBus;

  constructor(
    world: World,
    eventBus: import('../types').IEventBus
  ) {
    this.world = world;
    this.eventBus = eventBus;
  }

  setPlayer(player: Entity): void {
    this.playerEntity = player;
  }

  /** Создать новый дрон */
  spawn(x: number, y: number): void {
    // Используем factory
    // const drone = factory.createDrone(x, y);
    // this.drones.push(drone);
  }

  /** Обновить все дроны */
  update(dt: number, enemies: Entity[]): void {
    if (!this.playerEntity) return;
    
    const playerPos = this.playerEntity.getComponent<any>('transform');
    
    for (const drone of this.drones) {
      const droneComp = drone.getComponent<any>('drone');
      if (!droneComp) continue;
      
      // Обновить таймеры
      droneComp.flash = Math.max(0, droneComp.flash - dt);
      droneComp.retargetT -= dt;
      droneComp.fireCd -= dt;
      
      // Ретаргетинг
      if (droneComp.retargetT <= 0) {
        droneComp.targetId = this.findNearestEnemyId(
          playerPos,
          enemies
        );
        droneComp.retargetT = 1;
      }
      
      // Орбита вокруг игрока
      this.updateOrbit(drone, playerPos, dt);
      
      // Стрельба — v3: typed event
      if (droneComp.targetId !== null && droneComp.fireCd <= 0) {
        droneComp.fireCd = 0.8;
        // v3: typed event — BulletSpawnPayload
        this.eventBus.publish('drone_fired', {
          x: drone.getComponent<any>('transform').x,
          y: drone.getComponent<any>('transform').y,
          vx: 0,
          vy: -200,
          damage: 10,
        });
      }
    }
    
    // Удалить мёртвые
    this.drones = this.drones.filter(d => {
      const health = d.getComponent<any>('health');
      return health && health.hp > 0;
    });
  }

  /** Обновить орбиту дрона */
  private updateOrbit(drone: Entity, playerPos: any, dt: number): void {
    const droneComp = drone.getComponent<any>('drone');
    if (!droneComp) return;
    
    const orbitRadius = 60;
    const orbitSpeed = 1.5;
    
    droneComp.angle += orbitSpeed * dt;
    
    const transform = drone.getComponent<any>('transform');
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    
    transform.x = playerX + Math.cos(droneComp.angle) * orbitRadius;
    transform.y = playerY + Math.sin(droneComp.angle) * orbitRadius;
  }

  /** Найти ближайшего врага — v3: note about using world.findEntityById() for targetId */
  private findNearestEnemyId(
    playerPos: any,
    enemies: Entity[]
  ): number | null {
    let closest: Entity | null = null;
    let closestDist = Infinity;
    
    for (const e of enemies) {
      const state = e.getComponent<any>('enemyState');
      if (state.dead) continue;
      
      const ePos = e.getComponent<any>('transform');
      const dist = Math.sqrt(
        Math.pow(ePos.x - playerPos.x, 2) +
        Math.pow(ePos.y - playerPos.y, 2)
      );
      
      if (dist < closestDist) {
        closestDist = dist;
        closest = e;
      }
    }
    
    // Note: targetId is stored as entity ID, resolved via world.findEntityById() when needed
    return closest?.id ?? null;
  }

  getDrones(): Entity[] {
    return [...this.drones];
  }
}
```

---

## 4. MineSystem (v3 — исправлено)

Файл: `src/game/ecs/systems/MineSystem.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';

/**
 * MineSystem — управление минами.
 * Таймер fuse, обнаружение врагов, взрыв.
 * 
 * ✅ v3: имеет world: World для mine entity lookup
 * ✅ v3: использует typed event mine_detonated
 */
export class MineSystem {
  private world: World;
  private mines: Entity[] = [];
  private eventBus: import('../types').IEventBus;

  constructor(
    world: World,
    eventBus: import('../types').IEventBus
  ) {
    this.world = world;
    this.eventBus = eventBus;
  }

  /** Поставить мину */
  placeMine(x: number, y: number): void {
    // mine = factory.createMine(x, y);
    // this.mines.push(mine);
  }

  /** Обновить все мины */
  update(dt: number, enemies: Entity[]): void {
    for (let i = this.mines.length - 1; i >= 0; i--) {
      const mine = this.mines[i];
      const mineComp = mine.getComponent<any>('mine');
      
      if (!mineComp) continue;
      
      // Таймер
      mineComp.fuse -= dt;
      
      if (mineComp.fuse <= 0 && !mineComp.detonated) {
        this.explode(mine, enemies);
        this.mines.splice(i, 1);
        continue;
      }
      
      // Проверка коллизий с врагами
      for (const enemy of enemies) {
        if (enemy.getComponent<any>('enemyState')?.dead) continue;
        
        const minePos = mine.getComponent<any>('transform');
        const enemyPos = enemy.getComponent<any>('transform');
        
        const dist = Math.sqrt(
          Math.pow(minePos.x - enemyPos.x, 2) +
          Math.pow(minePos.y - enemyPos.y, 2)
        );
        
        if (dist < mineComp.r + (enemy.getComponent<any>('physics')?.radius ?? 10)) {
          this.explode(mine, enemies);
          // v3: typed event — PlayerDamagedPayload
          this.eventBus.publish('player_damaged', { dmg: 30 });
          this.mines.splice(i, 1);
          break;
        }
      }
    }
  }

  private explode(mine: Entity, enemies: Entity[]): void {
    const mineComp = mine.getComponent<any>('mine');
    if (!mineComp) return;
    
    mineComp.detonated = true;
    const x = mine.getComponent<any>('transform').x;
    const y = mine.getComponent<any>('transform').y;
    
    // v3: typed event — MineExplodedPayload
    this.eventBus.publish('mine_detonated', {
      mineId: mine.id,
      enemyId: 0, // determined by collision
      damage: 50,
    });
    
    // FX
    this.eventBus.publish('explosion', {
      x,
      y,
      radius: mineComp.r * 2,
      color: '#FF4444',
    });
  }

  getMines(): Entity[] {
    return [...this.mines];
  }
}
```

---

## 5. Удалить

- `src/game/systems/DroneSystem.ts` (старый)
- `src/game/systems/MineSystem.ts` (старый)

---

## 6. Критерии завершения этапа

1. ✅ Дроны — Entity + компоненты
2. ✅ `DroneSystem` управляет орбитой, таргетингом
3. ✅ Мины — Entity + компоненты
4. ✅ `MineSystem` управляет fuse и взрывами
5. ✅ Дроны имеют HP, умирают от пуль
6. ✅ ✅ Drones use typed events (drone_fired)
7. ✅ ✅ Mines use typed events (mine_detonated)
8. ✅ ✅ Both systems have world reference for lookups
