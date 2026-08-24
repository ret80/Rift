# ECS Этап 03 — Игрок (Player)

> **v3.1:** Unified EntityController base class, ComponentFactory usage (from criticism_03.md).

## Цель
Перенести игрока на ECS: компоненты для данных, системы для логики.

---

## 1. Компоненты игрока

Файл: `src/game/ecs/components/player/PlayerComponents.ts`

```typescript
import { Component } from '../../Component';
import { Vec2 } from '../../math/Vec2';

// ---- TransformComponent уже определён (этап 01) ----
// ---- VelocityComponent уже определён (этап 01) ----

// ---- HealthComponent — здоровье игрока ----
export interface HealthComponent extends Component {
  readonly type: 'health';
  hp: number;
  maxHp: number;
}

// ---- WeaponsComponent — оружие игрока ----
export interface WeaponsComponent extends Component {
  readonly type: 'weapons';
  guns: number;          // количество пушек
  rateMult: number;      // множитель скорострельности
  fireCd: number;        // кулдаун стрельбы
  extraGuns: number;     // бонусные пушки
  extraGunsT: number;    // время действия бонуса
}

// ---- PlayerInputComponent — ввод игрока ----
export interface PlayerInputComponent extends Component {
  readonly type: 'input';
  aimAngle: number | null;
  isFiring: boolean;
  thrustAngle: number | null;
}

// ---- PlayerStateComponent — игровое состояние ----
export interface PlayerStateComponent extends Component {
  readonly type: 'state';
  invuln: number;        // неуязвимость (таймер)
  rateT: number;         // таймер бонуса скорости
  dashT: number;         // таймер рывка
}

// ---- CollisionLayerComponent — слой коллизий ----
export interface CollisionLayerComponent extends Component {
  readonly type: 'collisionLayer';
  layer: number;
}
```

---

## 1.5 Unified EntityController Base (NEW v3.1 from criticism_03.md)

Файл: `src/game/ecs/EntityController.ts`

```typescript
import { Entity } from './Entity';
import { TransformComponent, VelocityComponent } from './Component';
import { Vec2 } from './math/Vec2';

/**
 * EntityController — базовый класс для всех EntityController'ов.
 * Убирает дублирование доступа к компонентам.
 * 
 * NEW v3.1 from criticism_03.md — fix #4.
 */
export class EntityController {
  constructor(public entity: Entity) {}

  get position(): Vec2 {
    const t = this.entity.getComponent<TransformComponent>('transform');
    return t ? Vec2.fromXY(t.x, t.y) : Vec2.zero();
  }

  get velocity(): Vec2 {
    const v = this.entity.getComponent<VelocityComponent>('velocity');
    return v ? Vec2.fromXY(v.vx, v.vy) : Vec2.zero();
  }

  /** Универсальный доступ к любому компоненту */
  getComponent<T>(type: string): T | undefined {
    return this.entity.getComponent<T>(type);
  }
}
```

---

## 2. Создание PlayerEntity (через World)

Файл: `src/game/ecs/entities/PlayerEntity.ts`

```typescript
import { Entity } from '../Entity';
import { World } from '../World';
import { Vec2 } from '../math/Vec2';
import { PlayerEntityType } from '../types';

/**
 * PlayerController — convenience-обёртка для работы с компонентами игрока.
 * Наследует базовый EntityController для унифицированного доступа.
 * 
 * NEW v3.1: extends EntityController, uses ComponentFactory.
 */
import { EntityController } from './EntityController';
import { ComponentFactory } from './ComponentFactory';

export class PlayerController extends EntityController {
  private world: World;
  private entityType: PlayerEntityType;

  constructor(world: World, entityType: PlayerEntityType = 'player') {
    super(world.createEntity());
    this.world = world;
    this.entityType = entityType;
    
    this.initComponents();
  }

  private initComponents(): void {
    // NEW v3.1: Use ComponentFactory for type-safe component creation
    
    // Transform
    this.entity.addComponent(ComponentFactory.createTransform(0, 0, 0));

    // Velocity
    this.entity.addComponent(ComponentFactory.createVelocity(0, 0));

    // Health
    this.entity.addComponent(ComponentFactory.createHealth(100, 100));

    // Weapons (hand-crafted — no factory for custom component)
    this.entity.addComponent({
      type: 'weapons' as any,
      guns: 1,
      rateMult: 1,
      fireCd: 0,
      extraGuns: 0,
      extraGunsT: 0,
    } as any);

    // Input (hand-crafted)
    this.entity.addComponent({
      type: 'input' as any,
      aimAngle: null,
      isFiring: false,
      thrustAngle: null,
    } as any);

    // State (hand-crafted)
    this.entity.addComponent({
      type: 'state' as any,
      invuln: 2,
      rateT: 0,
      dashT: 0,
    } as any);

    // Collision Layer
    this.entity.addComponent({
      type: 'collisionLayer' as any,
      layer: 0x01, // PLAYER layer
    } as any);

    // Render
    this.entity.addComponent(ComponentFactory.createRender(
      '#00BFFF', 2, 5, '#00BFFF'
    ));

    // Physics
    this.entity.addComponent(ComponentFactory.createPhysics(10, 12, 0));
  }

  // ---- Cross-entity references ----
  // NOTE: For cross-entity lookups, always use world.findEntityById()
  // Example: const other = this.world.findEntityById(otherId);
  // Also available: world.getEntityByPhysics(physicsEntity) — reverse lookup (physicsEntity -> entityId)

  // ---- Convenience accessors ----

  get position(): Vec2 {
    const t = this.entity.getComponent<any>('transform');
    return new Vec2(t.x, t.y);
  }

  get velocity(): Vec2 {
    const v = this.entity.getComponent<any>('velocity');
    return new Vec2(v.vx, v.vy);
  }

  get angle(): number {
    const t = this.entity.getComponent<any>('transform');
    return t.angle;
  }

  set angle(v: number) {
    const t = this.entity.getComponent<any>('transform');
    t.angle = v;
  }

  get hp(): number {
    const h = this.entity.getComponent<any>('health');
    return h.hp;
  }

  get maxHp(): number {
    const h = this.entity.getComponent<any>('health');
    return h.maxHp;
  }

  set hp(v: number) {
    const h = this.entity.getComponent<any>('health');
    h.hp = v;
  }

  get guns(): number {
    const w = this.entity.getComponent<any>('weapons');
    return w.guns + w.extraGuns;
  }

  get rateMult(): number {
    const w = this.entity.getComponent<any>('weapons');
    return w.rateMult;
  }

  set rateMult(v: number) {
    const w = this.entity.getComponent<any>('weapons');
    w.rateMult = v;
  }

  get fireCd(): number {
    const w = this.entity.getComponent<any>('weapons');
    return w.fireCd;
  }

  set fireCd(v: number) {
    const w = this.entity.getComponent<any>('weapons');
    w.fireCd = v;
  }

  get invuln(): number {
    const s = this.entity.getComponent<any>('state');
    return s.invuln;
  }

  set invuln(v: number) {
    const s = this.entity.getComponent<any>('state');
    s.invuln = v;
  }

  get aimAngle(): number | null {
    const i = this.entity.getComponent<any>('input');
    return i.aimAngle;
  }

  set aimAngle(v: number | null) {
    const i = this.entity.getComponent<any>('input');
    i.aimAngle = v;
  }

  get isFiring(): boolean {
    const i = this.entity.getComponent<any>('input');
    return i.isFiring;
  }

  set isFiring(v: boolean) {
    const i = this.entity.getComponent<any>('input');
    i.isFiring = v;
  }

  get extraGunsT(): number {
    const w = this.entity.getComponent<any>('weapons');
    return w.extraGunsT;
  }

  get dashT(): number {
    const s = this.entity.getComponent<any>('state');
    return s.dashT;
  }
}
```

---

## 3. PlayerMovementSystem

Файл: `src/game/ecs/systems/PlayerMovementSystem.ts`

```typescript
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';
import {
  PLAYER_ACCELERATION,
  FRICTION_EXP,
  DASH_ACCEL_MULT,
  DASH_SPEED_MULT,
  PLAYER_MAX_SPEED,
} from '../../balance';
import { TAU, lerpAngle } from '../../math';

/**
 * PlayerMovementSystem — движение игрока.
 * Чистая физика: input → velocity, friction, speed cap, angle.
 */
export class PlayerMovementSystem {
  update(
    dt: number,
    player: Entity,
    inputX: number,
    inputY: number
  ): void {
    const transform = player.getComponent<any>('transform');
    const velocity = player.getComponent<any>('velocity');
    const state = player.getComponent<any>('state');
    const weapons = player.getComponent<any>('weapons');

    // Dash
    const dashing = state.dashT > 0;

    // Input → velocity (Vec2)
    const input = Vec2.fromXY(inputX, inputY);
    const inputLen = input.mag();

    if (inputLen > 0) {
      input.normalize();
      const accel = PLAYER_ACCELERATION * (dashing ? DASH_ACCEL_MULT : 1);
      velocity.vx += input.x * accel * dt;
      velocity.vy += input.y * accel * dt;
    }

    // Friction
    const fr = Math.exp(-FRICTION_EXP * dt);
    velocity.vx *= fr;
    velocity.vy *= fr;

    // Speed cap
    const speed = Math.sqrt(velocity.vx * velocity.vx + velocity.vy * velocity.vy);
    const cap = PLAYER_MAX_SPEED * (dashing ? DASH_SPEED_MULT : 1);
    if (speed > cap) {
      const scale = cap / speed;
      velocity.vx *= scale;
      velocity.vy *= scale;
    }

    // Angle follows velocity
    if (speed > 20) {
      const targetAngle = Math.atan2(velocity.vy, velocity.vx);
      transform.angle = lerpAngle(
        transform.angle,
        targetAngle,
        1 - Math.exp(-10 * dt)
      );
    }
  }
}
```

---

## 4. PlayerCombatSystem

Файл: `src/game/ecs/systems/PlayerCombatSystem.ts`

```typescript
import { Entity } from '../Entity';
import { Vec2 } from '../math/Vec2';
import { PLAYER_FIRE_CD } from '../../balance';

/**
 * PlayerCombatSystem — стрельба игрока.
 * Создаёт пули и публикует событие через EventBus.
 */
export class PlayerCombatSystem {
  constructor(private eventBus: import('../types').IEventBus) {}

  update(dt: number, player: Entity): void {
    const weapons = player.getComponent<any>('weapons');
    const state = player.getComponent<any>('state');

    weapons.fireCd = Math.max(0, weapons.fireCd - dt);
    state.invuln = Math.max(0, state.invuln - dt);
    state.rateT = Math.max(0, state.rateT - dt);
    state.dashT = Math.max(0, state.dashT - dt);
    weapons.extraGunsT = Math.max(0, weapons.extraGunsT - dt);

    if (weapons.extraGunsT <= 0) {
      weapons.extraGuns = 0;
    }
  }

  fire(player: Entity, spawnPos: Vec2): void {
    const weapons = player.getComponent<any>('weapons');
    const input = player.getComponent<any>('input');
    
    if (weapons.fireCd > 0) return;
    if (input.aimAngle === null) return;

    const fireRate = PLAYER_FIRE_CD / weapons.rateMult;
    weapons.fireCd = fireRate;

    const guns = weapons.guns;
    const dir = Vec2.fromXY(
      Math.cos(input.aimAngle),
      Math.sin(input.aimAngle)
    );

    // Публикуем событие — BulletSystem обработает
    for (let i = 0; i < guns; i++) {
      const offset = (i - (guns - 1) / 2) * 8;
      const perp = Vec2.fromXY(-dir.y, dir.x).scaled(offset);
      const bulletSpawnPos = Vec2.add(spawnPos, dir.scaled(12)).add(perp);
      const bulletVel = dir.scaled(600);

      // eventBus.publish('bullet_spawn', { x, y, vx, vy, damage, life, owner })
      // NOTE: 'bullet_spawn' must be added to GameEventMap in EventBus.ts
      this.eventBus.publish('player_fired', {
        x: bulletSpawnPos.x,
        y: bulletSpawnPos.y,
        angle: input.aimAngle!,
      });

      // BulletSystem / BulletFactory should listen to 'player_fired' and spawn bullets.
      // For direct bullet creation, add 'bullet_spawn' to GameEventMap:
      //   'bullet_spawn': { x: number; y: number; vx: number; vy: number; damage: number; life: number; owner: string };
      // then use: this.eventBus.publish('bullet_spawn', { x: ..., y: ..., vx: ..., vy: ..., damage: 10, life: 1.5, owner: 'player' });
    }
  }
}
```

---

## 5. HealthSystem (для игрока)

Файл: `src/game/ecs/systems/HealthSystem.ts`

```typescript
import { Entity } from '../Entity';

/**
 * HealthSystem — обработка урона и лечения.
 * Подписывается на события через EventBus.
 */
export class HealthSystem {
  constructor(private eventBus: import('../types').IEventBus) {
    // Подписка на события урона
    this.setupListeners();
  }

  private setupListeners(): void {
    // Subscribe using typed EventBus format: subscribe<T>(type: T, handler: (payload: GameEventMap[T]) => void)
    this.eventBus.subscribe('player_damaged', (event) => {
      const payload = event.payload; // typed as { dmg: number }
      // В реальной реализации — найти target по ID через world.findEntityById(targetId)
      // this.handleDamage(target, payload.dmg);
    });
  }

  /** Проверить смерть и опубликовать событие */
  onTick(dt: number, player: Entity): void {
    const health = player.getComponent<any>('health');
    const state = player.getComponent<any>('state');
    
    if (health.hp <= 0 && state.invuln <= 0) {
      // 'game_over' — existing event in GameEventMap (typed: Record<string, never>)
      this.eventBus.publish('game_over', {});
    }
  }
}
```

---

## 6. Action methods (convenience)

```typescript
// В PlayerController добавить:

hit(dmg: number): void {
  const health = this.entity.getComponent<any>('health');
  if (health.hp <= 0) return; // уже мёртв
  if (this.invuln > 0) return; // неуязвим
  health.hp -= dmg;
}

heal(amount: number): void {
  const health = this.entity.getComponent<any>('health');
  health.hp = Math.min(health.maxHp, health.hp + amount);
}

boostRate(): void {
  const weapons = this.entity.getComponent<any>('weapons');
  weapons.rateMult = Math.min(1.0, weapons.rateMult + 0.2);
  const state = this.entity.getComponent<any>('state');
  state.rateT = 10;
}

addGun(): void {
  const weapons = this.entity.getComponent<any>('weapons');
  weapons.guns++;
}

activateMissileLauncher(duration: number): void {
  const state = this.entity.getComponent<any>('state');
  state.dashT = duration;
}
```

---

## 7. Удалить

- `src/game/systems/PlayerSystem.ts`
- `src/game/systems/PlayerState.ts`
- `src/game/systems/PlayerMovement.ts`
- `src/game/systems/PlayerCombat.ts`

---

## 8. Критерии завершения этапа

1. ✅ Игрок — это Entity + компоненты, не God Class
2. ✅ `PlayerMovementSystem` управляет движением
3. ✅ `PlayerCombatSystem` публикует события через typed EventBus (использовать 'player_fired' из GameEventMap)
4. ✅ `HealthSystem` обрабатывает HP через typed события ('player_damaged', 'game_over')
5. ✅ `PlayerController` extends unified `EntityController` (NEW v3.1)
6. ✅ `PlayerController` uses `ComponentFactory` for standard components (NEW v3.1)
7. ✅ `PlayerController` uses world.findEntityById() для кросс-ссылок
8. ✅ Все старые Player-системы удалены
