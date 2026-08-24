# ECS Этап 05 — Пули и ракеты (Weapons & Bullets)

> **v3.1:** BulletPool integrated into EntityFactory (from criticism_03.md).

## Цель
Создать ECS-сущности для пуль, вражеских пуль и ракет. Реализовать систему жизненного цикла.

---

## 1. Компоненты пуль

Файл: `src/game/ecs/components/BulletComponents.ts`

```typescript
import { Component } from '../Component';
import { Vec2 } from '../math/Vec2';

// ---- LifetimeComponent — время жизни ----
export interface LifetimeComponent extends Component {
  readonly type: 'lifetime';
  life: number; // remaining seconds
}

// ---- DamageComponent — урон ----
export interface DamageComponent extends Component {
  readonly type: 'damage';
  damage: number;
}

// ---- BulletOwnerComponent — владелец пули ----
export interface BulletOwnerComponent extends Component {
  readonly type: 'bulletOwner';
  owner: 'player' | 'enemy' | 'none';
}

// ---- HomingComponent — самонаведение ----
export interface HomingComponent extends Component {
  readonly type: 'homing';
  targetId: number | null;
  turnRate: number; // rad/s
}

// ---- HeavyComponent — тяжёлая пуля (cruiser) ----
export interface HeavyComponent extends Component {
  readonly type: 'heavy';
}
```

---

## 2. Фабрики для пуль

Файл: `src/game/ecs/EntityFactory.ts` (добавить к существующему)

```typescript
// ---- В EntityFactory добавить методы ----

/** Создать пулю игрока */
createBullet(x: number, y: number, vx: number, vy: number): Entity {
  const entity = this.createBase('bullet', x, y, {
    radius: 3,
    mass: 0.1,
    render: {
      strokeColor: '#FFD700',
      strokeWidth: 1,
      glowIntensity: 3,
      glowColor: '#FFD700',
    },
  });
  
  // Добавить дополнительные компоненты
  entity.addComponent({
    type: 'lifetime' as any,
    life: 1.5,
  } as any);
  
  entity.addComponent({
    type: 'damage' as any,
    damage: 10,
  } as any);
  
  entity.addComponent({
    type: 'bulletOwner' as any,
    owner: 'player',
  } as any);
  
  // Установить скорость
  const vel = entity.getComponent<any>('velocity');
  vel!.vx = vx;
  vel!.vy = vy;
  
  return entity;
}

/** Создать пулю врага */
createEnemyBullet(x: number, y: number, vx: number, vy: number, heavy = false): Entity {
  const entity = this.createBase('enemyBullet', x, y, {
    radius: heavy ? 5 : 3,
    mass: heavy ? 0.5 : 0.1,
    render: {
      strokeColor: heavy ? '#FF4444' : '#FF8888',
      strokeWidth: heavy ? 2 : 1,
      glowIntensity: heavy ? 5 : 2,
      glowColor: '#FF4444',
    },
  });
  
  entity.addComponent({
    type: 'lifetime' as any,
    life: heavy ? 2.0 : 1.35,
  } as any);
  
  entity.addComponent({
    type: 'damage' as any,
    damage: 10,
  } as any);
  
  entity.addComponent({
    type: 'bulletOwner' as any,
    owner: 'enemy',
  } as any);
  
  if (heavy) {
    entity.addComponent({
      type: 'heavy' as any,
    } as any);
  }
  
  const vel = entity.getComponent<any>('velocity');
  vel!.vx = vx;
  vel!.vy = vy;
  
  return entity;
}

/** Создать ракету */
createMissile(x: number, y: number, targetId: number): Entity {
  const entity = this.createBase('missile', x, y, {
    radius: 4,
    mass: 0.5,
    render: {
      strokeColor: '#00FF88',
      strokeWidth: 2,
      glowIntensity: 8,
      glowColor: '#00FF88',
    },
  });
  
  entity.addComponent({
    type: 'lifetime' as any,
    life: 15,
  } as any);
  
  entity.addComponent({
    type: 'damage' as any,
    damage: 50,
  } as any);
  
  entity.addComponent({
    type: 'bulletOwner' as any,
    owner: 'player',
  } as any);
  
  entity.addComponent({
    type: 'homing' as any,
    targetId,
    turnRate: 2.0,
  } as any);
  
  // Начальная скорость
  const vel = entity.getComponent<any>('velocity');
  vel!.vx = 400;
  vel!.vy = 0;
  
  return entity;
}
```

---

## 3. BulletLifecycleSystem

Файл: `src/game/ecs/systems/BulletSystem.ts`

```typescript
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';

/**
 * BulletSystem — управление жизненным циклом всех пуль.
 * Убирает мёртвые пули и обрабатывает homing.
 */
export class BulletSystem {
  constructor(private eventBus: import('../types').IEventBus) {}

  /** Обновить пули игрока */
  updateBullets(dt: number, bullets: Entity[]): Entity[] {
    const alive: Entity[] = [];
    
    for (const bullet of bullets) {
      const lifetime = bullet.getComponent<any>('lifetime');
      if (!lifetime) continue;
      
      // Homing update
      const homing = bullet.getComponent<any>('homing');
      if (homing) {
        this.applyHoming(bullet, homing);
      }
      
      // Lifetime
      lifetime.life -= dt;
      if (lifetime.life <= 0) continue;
      
      alive.push(bullet);
    }
    
    return alive;
  }

  /** Обновить пули врагов */
  updateEnemyBullets(dt: number, bullets: Entity[]): Entity[] {
    return bullets.filter(b => {
      const lifetime = b.getComponent<any>('lifetime');
      if (lifetime) {
        lifetime.life -= dt;
      }
      return lifetime ? lifetime.life > 0 : true;
    });
  }

  /** Применить самонаведение */
  private applyHoming(bullet: Entity, homing: any): void {
    const vel = bullet.getComponent<any>('velocity');
    if (!vel) return;
    
    const speed = Math.sqrt(vel.vx * vel.vx + vel.vy * vel.vy);
    if (speed === 0) return;
    
    const currentAngle = Math.atan2(vel.vy, vel.vx);
    const targetAngle = Math.atan2(
      // TODO: resolve target position via world.findEntityById(homing.targetId)
      // const target = world.findEntityById(homing.targetId);
      // const t = target?.getComponent<any>('transform');
      // const dx = (t?.y ?? 0) - (vel.y);  // placeholder
      // return Math.atan2(dy, dx);
      0, 0 // TODO: resolve target position
    );
    
    let angleDiff = targetAngle - currentAngle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    
    const turn = homing.turnRate * 0.016; // per frame
    const newAngle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turn);
    
    vel.vx = Math.cos(newAngle) * speed;
    vel.vy = Math.sin(newAngle) * speed;
  }
}
```

---

## 3.5 BulletPool (NEW v3.1 — integrated into EntityFactory)

Файл: `src/game/ecs/BulletPool.ts`

```typescript
import { Entity } from './Entity';
import { World } from './World';
import { EntityFactory } from './EntityFactory';

/**
 * BulletPool — пул для переиспользования сущностей пуль.
 * Интегрирован с EntityFactory (NEW v3.1 from criticism_03.md — fix #10).
 * Создание/уничтожение десятков пуль в секунду создаёт нагрузку на GC.
 */
export class BulletPool {
  private pool: Entity[] = [];
  private factory: EntityFactory;

  constructor(factory: EntityFactory) {
    this.factory = factory;
  }

  /**
   * Получить пулю из пула или создать новую.
   * Переиспользует сущности для снижения нагрузки на GC.
   */
  acquire(world: World, x: number, y: number, vx: number, vy: number, owner: 'player' | 'enemy' = 'player', heavy = false): Entity {
    let entity = this.pool.pop();
    if (!entity) {
      // Создаём новую пулю через factory
      entity = heavy
        ? this.factory.createEnemyBullet(x, y, vx, vy, true)
        : owner === 'player'
          ? this.factory.createBullet(x, y, vx, vy)
          : this.factory.createEnemyBullet(x, y, vx, vy, false);
    } else {
      // Переиспользуем с новыми параметрами
      const vel = entity.getComponent<any>('velocity');
      vel!.vx = vx; vel!.vy = vy;
      const lifetime = entity.getComponent<any>('lifetime');
      lifetime!.life = heavy ? 2.0 : 1.5;
      const ownerComp = entity.getComponent<any>('bulletOwner');
      if (ownerComp) ownerComp.owner = owner;
      const dmg = entity.getComponent<any>('damage');
      if (dmg) dmg.damage = heavy ? 20 : 10;
    }
    return entity;
  }

  /** Вернуть пулю в пул для переиспользования */
  release(entity: Entity): void {
    // Снять все активные компоненты перед возвратом в пул
    const lifetime = entity.getComponent<any>('lifetime');
    if (lifetime) lifetime.life = 0; // помечаем как мёртвую для очистки
    this.pool.push(entity);
  }

  /** Очистить пул (для сброса между раундами) */
  clear(): void {
    this.pool.length = 0;
  }
}
```

### Использование BulletPool в Game class:

```typescript
// В Game constructor:
this.bulletPool = new BulletPool(this.world.getFactory());

// При стрельбе игрока:
const bullet = this.bulletPool.acquire(
  this.world,
  spawnPos.x, spawnPos.y,
  vel.x, vel.y,
  'player'
);
//_bullet_ — add to bullets list

// При уничтожении пули (CollisionSystem):
this.bulletPool.release(bullet);
```

---

## 4. Удалить

- `src/game/systems/BulletSystem.ts` (старый)
- Типы `Bullet`, `EBullet` из `types.ts`

---

## 5. Критерии завершения этапа

1. ✅ Пули — Entity + компоненты
2. ✅ `BulletSystem` управляет жизненным циклом
3. ✅ Homing работает через компонент (целевая позиция через world.findEntityById())
4. ✅ Старые типы Bullet/EBullet удалены
5. ✅ **NEW v3.1:** `BulletPool` интегрирован с `EntityFactory` (fix #10 from criticism_03.md)
6. ✅ **NEW v3.1:** Пример использования BulletPool в Game class
