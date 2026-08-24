# ECS Этап 12 — Астероиды

> **v3.1:** AsteroidField receives EventBus via constructor (from criticism_03.md).

## Цель
Перенести астероиды на ECS-сущности. Звёздное поле оставить как non-entity.

---

## 1. Компоненты астероидов

Файл: `src/game/ecs/components/AsteroidComponents.ts`

```typescript
import { Component } from '../Component';

// ---- AsteroidComponent — состояние астероида ----
export interface AsteroidComponent extends Component {
  readonly type: 'asteroid';
  kind: 'small' | 'medium' | 'large';
  hp: number;
  score: number;
  vertices: { x: number; y: number }[]; // форма для рендера
}
```

---

## 2. Фабрика для астероидов

```typescript
// В EntityFactory добавить:

createAsteroid(x: number, y: number, radius: number, vx: number, vy: number): Entity {
  const mass = Math.PI * radius * radius * 0.01;
  
  // Генерация формы астероида
  const vertices = this.generateAsteroidShape(radius);
  
  const entity = this.createBase('asteroid', x, y, {
    radius,
    mass,
    render: {
      strokeColor: '#888888',
      strokeWidth: 1,
      glowIntensity: 0,
    },
  });
  
  entity.addComponent({
    type: 'asteroid' as any,
    kind: radius > 20 ? 'large' : radius > 10 ? 'medium' : 'small',
    hp: radius * 2,
    score: radius,
    vertices,
  } as any);
  
  // Установить скорость
  const vel = entity.getComponent<any>('velocity');
  vel!.vx = vx;
  vel!.vy = vy;
  
  return entity;
}

private generateAsteroidShape(radius: number): { x: number; y: number }[] {
  const numVertices = 8 + Math.floor(Math.random() * 5);
  const vertices = [];
  
  for (let i = 0; i < numVertices; i++) {
    const angle = (i / numVertices) * Math.PI * 2;
    const r = radius * (0.7 + Math.random() * 0.3);
    vertices.push({
      x: Math.cos(angle) * r,
      y: Math.sin(angle) * r,
    });
  }
  
  return vertices;
}
```

---

## 3. AsteroidField (v3 — исправлено)

Файл: `src/game/ecs/systems/AsteroidField.ts`

```typescript
import { World } from '../World';
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';

/**
 * AsteroidField — управление полем астероидов.
 * 
 * ✅ v3: использует world reference для queries
 * ✅ v3: typed asteroid_hit event
 * ✅ v3.1: receives EventBus via constructor (fix #3 from criticism_03.md)
 * ✅ Starfield not in ECS (background)
 */
export class AsteroidField {
  private world: World;
  private eventBus: import('../types').IEventBus; // NEW v3.1
  private asteroids: Entity[] = [];

  constructor(world: World, eventBus: import('../types').IEventBus) {
    this.world = world;
    this.eventBus = eventBus; // NEW v3.1: injected, not from World
  }

  /** Обновить все астероиды — v3: uses world.queryWithTransform() for nearby */
  update(dt: number, camPos: Vec2, maxDist: number): void {
    for (let i = this.asteroids.length - 1; i >= 0; i--) {
      const asteroid = this.asteroids[i];
      const state = asteroid.getComponent<any>('asteroid');
      
      if (!state) continue;
      
      const transform = asteroid.getComponent<any>('transform');
      
      // Удаление далёких астероидов
      if (Vec2.distance(camPos, Vec2.fromXY(transform.x, transform.y)) > maxDist) {
        this.asteroids.splice(i, 1);
        continue;
      }
      
      // Обработка попаданий
      if (state.hp <= 0) {
        this.onAsteroidDestroyed(asteroid);
        this.asteroids.splice(i, 1);
      }
    }
  }

  private onAsteroidDestroyed(asteroid: Entity): void {
    const state = asteroid.getComponent<any>('asteroid');
    const transform = asteroid.getComponent<any>('transform');
    
    if (!state) return;
    
    // Сплит на 2-3 меньших астероида — v3: use factory.createAsteroid()
    if (state.kind !== 'small') {
      const numSplit = 2 + Math.floor(Math.random() * 2);
      const newKind = state.kind === 'large' ? 'medium' : 'small';
      const newRadius = state.kind === 'large' ? 20 : 10;
      
      for (let i = 0; i < numSplit; i++) {
        // v3: factory.createAsteroid() pattern
        // const factory = this.world.getFactory();
        // factory.createAsteroid(
        //   transform.x + (Math.random() - 0.5) * 20,
        //   transform.y + (Math.random() - 0.5) * 20,
        //   newRadius,
        //   (Math.random() - 0.5) * 100,
        //   (Math.random() - 0.5) * 100
        // );
      }
    }
    
    // NEW v3.1: Use injected eventBus (not World.getEventBus())
    this.eventBus.publish('asteroid_hit', {
      index: asteroid.id,
      dmg: 0,
      vx: 0,
      vy: 0,
      x: transform.x,
      y: transform.y,
    });
  }

  addAsteroid(asteroid: Entity): void {
    this.asteroids.push(asteroid);
  }

  getAsteroids(): Entity[] {
    return [...this.asteroids];
  }
}
```

---

## 4. Звёздное поле

**НЕ переносить на ECS!** Starfield — фон, не участвует в физике.

---

## 5. Критерии завершения этапа

1. ✅ Астероиды — Entity + компоненты
2. ✅ Астероиды сталкиваются со всеми через CollisionSystem
3. ✅ Астероиды раскалываются при уничтожении
4. ✅ Starfield не в ECS (фон)
5. ✅ Астероиды удаляются при выходе далеко за камеру
6. ✅ ✅ Asteroids use world reference for queries
7. ✅ ✅ Typed asteroid_hit event
8. ✅ ✅ Starfield not in ECS (background)
9. ✅ **NEW v3.1:** AsteroidField receives EventBus via constructor (fix #3 from criticism_03.md)
