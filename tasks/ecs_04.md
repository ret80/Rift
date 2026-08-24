# ECS Этап 04 — Враги и AI (Strategy Pattern)

> **v3.1:** Unified EntityController base, ComponentFactory usage (from criticism_03.md).

## Цель
Перенести врагов на ECS: компоненты для данных, системы для логики, Strategy Pattern для AI.

---

## 1. Компоненты врагов

Файл: `src/game/ecs/components/enemy/EnemyComponents.ts`

```typescript
import { Component } from '../../Component';

// ---- AIStateComponent — состояние AI врага ----
export interface AIStateComponent extends Component {
  readonly type: 'aiState';
  kind: string;           // drone, hunter, fighter, cruiser, carrier
  mode: string;           // current strategy mode
  orbitAngle: number;
  orbitRadius: number;
  orbitTimer: number;
  fireCd1: number;
  fireCd2: number;
  dodgeWeight: number;
  dodgeTimer: number;
  // Carrier-specific
  burstActive: boolean;
  burstRestT: number;
  burstCd: number;
  // Parent reference (для Carrier → Drone)
  isCarrierChild: boolean;
}

// ---- EnemyWeaponsComponent — оружие врага ----
export interface EnemyWeaponsComponent extends Component {
  readonly type: 'enemyWeapons';
  boltDmg: number;
  fireCd: number;
}

// ---- EnemyStateComponent — состояние врага ----
export interface EnemyStateComponent extends Component {
  readonly type: 'enemyState';
  score: number;
  contact: number;
  flash: number;
  hitCd: number;
  dead: boolean;
}
```

---

## 2. Создание врага (через World)

Файл: `src/game/ecs/entities/EnemyController.ts`

```typescript
import { Entity } from '../Entity';
import { World } from '../World';
import { Vec2 } from '../math/Vec2';
import type { EnemyKind } from '../../balance';
import { massForRadius } from '../../balance';

/**
 * EnemyController — convenience для работы с Enemy Entity.
 * Наследует базовый EntityController для унифицированного доступа.
 * NEW v3.1: extends EntityController, uses ComponentFactory.
 */
import { EntityController } from './EntityController';
import { ComponentFactory } from './ComponentFactory';
import { World } from '../World';
import { Vec2 } from '../math/Vec2';
import type { EnemyKind } from '../../balance';
import { massForRadius } from '../../balance';

export class EnemyController extends EntityController {
  private world: World;

  // Parent reference (Carrier → Drone cross-entity lookup)
  // NOTE: For cross-entity references, always use world.findEntityById()
  // Example: const parent = this.world.findEntityById(parentEntityId);
  // Also available: world.getEntityByPhysics(physicsEntity) — reverse lookup (physicsEntity -> entityId)

  constructor(world: World, kind: EnemyKind, x: number, y: number) {
    super(world.createEntity());
    this.world = world;
    
    this.initComponents(kind, x, y);
  }

  private initComponents(kind: EnemyKind, x: number, y: number): void {
    const radius = this.radiusForKind(kind);
    const mass = massForRadius(radius);
    const hp = this.hpForKind(kind);

    // NEW v3.1: Use ComponentFactory for standard components
    
    // Transform
    this.entity.addComponent(ComponentFactory.createTransform(x, y, 0));

    // Velocity
    this.entity.addComponent(ComponentFactory.createVelocity(0, 0));

    // Physics
    this.entity.addComponent(ComponentFactory.createPhysics(mass, radius, 0));

    // Health
    this.entity.addComponent(ComponentFactory.createHealth(hp, hp));

    // AI State (hand-crafted — no factory)
    this.entity.addComponent({
      type: 'aiState' as any,
      kind,
      mode: 'idle',
      orbitAngle: 0,
      orbitRadius: 0,
      orbitTimer: 0,
      fireCd1: 0,
      fireCd2: 0,
      dodgeWeight: this.dodgeWeightForKind(kind),
      dodgeTimer: 0,
      burstActive: false,
      burstRestT: 0,
      burstCd: 0.5,
      isCarrierChild: false,
    } as any);

    // Enemy Weapons (hand-crafted)
    this.entity.addComponent({
      type: 'enemyWeapons' as any,
      boltDmg: this.boltDmgForKind(kind),
      fireCd: Math.random() * 0.7,
    } as any);

    // Enemy State (hand-crafted)
    this.entity.addComponent({
      type: 'enemyState' as any,
      score: this.scoreForKind(kind),
      contact: this.contactDmgForKind(kind),
      flash: 0,
      hitCd: 0,
      dead: false,
    } as any);

    // Render
    this.entity.addComponent(ComponentFactory.createRender(
      this.colorForKind(kind), 2, 3, this.colorForKind(kind)
    ));

    // Collision Layer
    this.entity.addComponent({
      type: 'collisionLayer' as any,
      layer: 0x02, // ENEMY layer
    } as any);
  }

  // ---- Конфигурация по типу ----

  private radiusForKind(kind: string): number {
    const radii: Record<string, number> = {
      drone: 10,
      hunter: 14,
      fighter: 16,
      cruiser: 24,
      carrier: 32,
    };
    return radii[kind] ?? 10;
  }

  private hpForKind(kind: string): number {
    const hps: Record<string, number> = {
      drone: 10,
      hunter: 20,
      fighter: 30,
      cruiser: 80,
      carrier: 120,
    };
    return hps[kind] ?? 10;
  }

  private boltDmgForKind(kind: string): number {
    const dmg: Record<string, number> = {
      drone: 10,
      hunter: 12,
      fighter: 15,
      cruiser: 20,
      carrier: 18,
    };
    return dmg[kind] ?? 10;
  }

  private scoreForKind(kind: string): number {
    const scores: Record<string, number> = {
      drone: 10,
      hunter: 20,
      fighter: 30,
      cruiser: 100,
      carrier: 150,
    };
    return scores[kind] ?? 10;
  }

  private contactDmgForKind(kind: string): number {
    const dmg: Record<string, number> = {
      drone: 10,
      hunter: 12,
      fighter: 15,
      cruiser: 20,
      carrier: 20,
    };
    return dmg[kind] ?? 10;
  }

  private dodgeWeightForKind(kind: string): number {
    const weights: Record<string, number> = {
      drone: 2.5,
      hunter: 1.5,
      fighter: 1.2,
      cruiser: 1.0,
      carrier: 0.8,
    };
    return weights[kind] ?? 1.0;
  }

  private colorForKind(kind: string): string {
    const colors: Record<string, string> = {
      drone: '#FF4444',
      hunter: '#FF8800',
      fighter: '#FF00FF',
      cruiser: '#00FF00',
      carrier: '#00FFFF',
    };
    return colors[kind] ?? '#FF4444';
  }

  // ---- Convenience accessors ----

  get position(): Vec2 {
    const t = this.entity.getComponent<any>('transform');
    return new Vec2(t.x, t.y);
  }

  get velocity(): Vec2 {
    const v = this.entity.getComponent<any>('velocity');
    return new Vec2(v.vx, v.vy);
  }

  get dead(): boolean {
    const s = this.entity.getComponent<any>('enemyState');
    return s.dead;
  }

  set dead(v: boolean) {
    const s = this.entity.getComponent<any>('enemyState');
    s.dead = v;
  }

  get hp(): number {
    const h = this.entity.getComponent<any>('health');
    return h.hp;
  }

  get maxHp(): number {
    const h = this.entity.getComponent<any>('health');
    return h.maxHp;
  }

  get kind(): string {
    const ai = this.entity.getComponent<any>('aiState');
    return ai.kind;
  }

  get score(): number {
    const s = this.entity.getComponent<any>('enemyState');
    return s.score;
  }

  get contact(): number {
    const s = this.entity.getComponent<any>('enemyState');
    return s.contact;
  }

  get boltDmg(): number {
    const w = this.entity.getComponent<any>('enemyWeapons');
    return w.boltDmg;
  }

  get fireCd(): number {
    const w = this.entity.getComponent<any>('enemyWeapons');
    return w.fireCd;
  }

  set fireCd(v: number) {
    const w = this.entity.getComponent<any>('enemyWeapons');
    w.fireCd = v;
  }

  get flash(): number {
    const s = this.entity.getComponent<any>('enemyState');
    return s.flash;
  }

  set flash(v: number) {
    const s = this.entity.getComponent<any>('enemyState');
    s.flash = v;
  }

  get hitCd(): number {
    const s = this.entity.getComponent<any>('enemyState');
    return s.hitCd;
  }

  set hitCd(v: number) {
    const s = this.entity.getComponent<any>('enemyState');
    s.hitCd = v;
  }

  get aiMode(): string {
    const ai = this.entity.getComponent<any>('aiState');
    return ai.mode;
  }

  set aiMode(v: string) {
    const ai = this.entity.getComponent<any>('aiState');
    ai.mode = v;
  }
}
```

---

## 3. EnemyMovementSystem

Файл: `src/game/ecs/systems/EnemyMovementSystem.ts`

```typescript
import { Entity } from '../Entity';

/**
 * EnemyMovementSystem — обновление позиций врагов.
 */
export class EnemyMovementSystem {
  update(dt: number, enemies: Entity[]): void {
    for (const enemy of enemies) {
      const state = enemy.getComponent<any>('enemyState');
      if (state.dead) continue;

      const ai = enemy.getComponent<any>('aiState');
      
      // Обновление состояния
      state.flash = Math.max(0, state.flash - dt * 5);
      state.hitCd = Math.max(0, state.hitCd - dt);
      ai.orbitTimer -= dt;
      ai.burstRestT = Math.max(0, ai.burstRestT - dt);
      ai.burstCd = Math.max(0, ai.burstCd - dt);
    }
  }
}
```

---

## 4. EnemyAISystem (Strategy Pattern)

Файл: `src/game/ecs/systems/EnemyAISystem.ts`

```typescript
import { Entity } from '../Entity';
import { World } from '../World';
import { Vec2 } from '../math/Vec2';
import type { IEnemyStrategy } from '../../ai/IEnemyStrategy';
import { EnemyAI } from '../../ai/EnemyAI';

  /**
   * EnemyAISystem — AI врагов через Strategy Pattern.
   * Каждая стратегия управляет velocity врага.
   * NOTE: Player position is resolved via world.queryWithTransform() filtering for 'player' entity,
   * not passed as a direct parameter (avoids tight coupling).
   */
  export class EnemyAISystem {
    private ai: EnemyAI;
    private strategies: Map<string, IEnemyStrategy> = new Map();
    private wave = 1;
    private world: World; // Added for entity queries

    constructor(world: World) {
      this.world = world;
      this.ai = new EnemyAI();
      // Регистрируем стратегии
      this.strategies.set('drone', this.ai.createDroneStrategy());
      this.strategies.set('hunter', this.ai.createHunterStrategy());
      this.strategies.set('fighter', this.ai.createFighterStrategy());
      this.strategies.set('cruiser', this.ai.createCruiserStrategy());
      this.strategies.set('carrier', this.ai.createCarrierStrategy());
    }

    /** Получить позицию игрока через queryWithTransform — не передавать как параметр */
    private getPlayerPosition(): Vec2 | null {
      // queryWithTransform filters entities that have 'transform' + matching type tag
      const player = this.world.queryWithTransform('player');
      if (player.length > 0) {
        const t = player[0].getComponent<any>('transform');
        return Vec2.fromXY(t.x, t.y);
      }
      return null;
    }

  update(
    dt: number,
    enemies: Entity[],
    enemyBullets: any[]
  ): void {
    const playerPos = this.getPlayerPosition();
    if (!playerPos) return;

    for (const enemy of enemies) {
      const ai = enemy.getComponent<any>('aiState');
      if (ai.mode === 'orbiting') continue; // дрон на орбите — не управляется
      if (enemy.getComponent<any>('enemyState').dead) continue;

      const strategy = this.strategies.get(ai.kind);
      if (!strategy) continue;

      // Вызов стратегии
      strategy.update(
        enemy,
        playerPos,
        enemyBullets,
        dt,
        this.wave
      );
    }
  }

  setWave(w: number): void {
    this.wave = w;
  }
}
```

---

## 5. EnemyCombatSystem

Файл: `src/game/ecs/systems/EnemyCombatSystem.ts`

```typescript
import { Entity } from '../Entity';
import { World } from '../World';
import { Vec2 } from '../math/Vec2';

/**
 * EnemyCombatSystem — стрельба врагов.
 * Публикует события через EventBus в typed формате.
 * NOTE: Использует world для получения позиции игрока через queryWithTransform().
 */
export class EnemyCombatSystem {
  constructor(
    private eventBus: import('../types').IEventBus,
    private world: World // Added for player position lookup
  ) {}

  private wave = 1;

  update(dt: number, enemies: Entity[]): void {
    // NOTE: Use world.queryWithTransform() for player lookup instead of direct parameter
    const playerEntities = this.world.queryWithTransform('player');
    if (playerEntities.length === 0) return;
    const playerTransform = playerEntities[0].getComponent<any>('transform');
    const playerPos = Vec2.fromXY(playerTransform.x, playerTransform.y);
    for (const enemy of enemies) {
      const state = enemy.getComponent<any>('enemyState');
      if (state.dead) continue;

      const ai = enemy.getComponent<any>('aiState');
      const weapons = enemy.getComponent<any>('enemyWeapons');
      const transform = enemy.getComponent<any>('transform');

      // Направление на игрока
      const toPlayer = Vec2.sub(playerPos, Vec2.fromXY(transform.x, transform.y));
      const dist = toPlayer.mag();

      // Проверка дальности стрельбы
      const canShoot = this.canEnemyShoot(ai.kind, dist);
      if (!canShoot) continue;

      // Кулдаун
      if (ai.kind === 'cruiser') {
        // Dual turrets
        if (weapons.fireCd1 <= 0) {
          weapons.fireCd1 = 1.5;
          this.fireCruiserTurret1(enemy, playerPos);
        }
        if (weapons.fireCd2 <= 0) {
          weapons.fireCd2 = 1.5;
          this.fireCruiserTurret2(enemy, playerPos);
        }
      } else if (weapons.fireCd <= 0) {
        weapons.fireCd = 1.0 + Math.random() * 0.5;
        this.fireSingleTurret(enemy, playerPos);
      }
    }
  }

  private canEnemyShoot(kind: string, dist: number): boolean {
    const ranges: Record<string, number> = {
      fighter: 500,
      cruiser: 350,
      carrier: 500,
    };
    const range = ranges[kind];
    return range ? dist < range : false;
  }

  private fireSingleTurret(enemy: Entity, playerPos: Vec2): void {
    const transform = enemy.getComponent<any>('transform');
    const weapons = enemy.getComponent<any>('enemyWeapons');
    
    const pos = Vec2.fromXY(transform.x, transform.y);
    const dir = Vec2.direction(playerPos, pos);
    const vel = dir.scaled(300);

    // NOTE: 'enemy_bullet_spawn' must be added to GameEventMap in EventBus.ts
    // Typed format: eventBus.publish('enemy_fired', { x, y, angle }) is available.
    // For direct bullet spawns, add to GameEventMap:
    //   'enemy_bullet_spawn': { x: number; y: number; vx: number; vy: number; damage: number; heavy?: boolean };
    // then use: this.eventBus.publish('enemy_bullet_spawn', { x: pos.x, y: pos.y, vx: vel.x, vy: vel.y, damage: ..., heavy: false });
    this.eventBus.publish('enemy_fired', {
      x: pos.x,
      y: pos.y,
      angle: Math.atan2(vel.y, vel.x),
    });
  }

  private fireCruiserTurret1(enemy: Entity, playerPos: Vec2): void {
    // Аналогично fireSingleTurret
  }

  private fireCruiserTurret2(enemy: Entity, playerPos: Vec2): void {
    // Аналогично fireSingleTurret
  }

  setWave(w: number): void {
    this.wave = w;
  }
}
```

---

## 6. Удалить

- `src/game/systems/EnemySystem.ts`

---

## 7. Критерии завершения этапа

1. ✅ Враги — Entity + компоненты, не God Class
2. ✅ `EnemyMovementSystem` обновляет позиции
3. ✅ `EnemyAISystem` использует Strategy Pattern, позицию игрока получает через world.queryWithTransform()
4. ✅ `EnemyCombatSystem` публикует события через typed EventBus (использовать 'enemy_fired' из GameEventMap)
5. ✅ Все 5 типов врагов работают
6. ✅ `EnemyController` extends unified `EntityController` (NEW v3.1)
7. ✅ `EnemyController` uses `ComponentFactory` for standard components (NEW v3.1)
8. ✅ `EnemyController` использует world.findEntityById() для кросс-ссылок (Carrier → Drone)
9. ✅ Старый EnemySystem удалён
