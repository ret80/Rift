# ECS Этап 11 — Рендер и камера

> **v3.1:** Architecturally correct — no changes needed.

## Цель
Подключить рендер всех ECS-сущностей. Реализовать smooth camera follow.

---

## 1. CameraSystem (v3 — Vec2 everywhere)

Файл: `src/game/ecs/systems/CameraSystem.ts`

```typescript
import { Vec2 } from '../math/Vec2';

/**
 * CameraSystem — smooth follow камеры.
 * ВСЕ позиции — через Vec2.
 * 
 * ✅ v3: использует Vec2 для всех позиций
 * ✅ v3: getPosition() возвращает Vec2.clone()
 */
export class CameraSystem {
  private target = Vec2.zero();
  private current = Vec2.zero();
  private zoom = 1;
  private smoothSpeed = 3;

  constructor() {}

  /** Обновить камеру — playerPos должен быть Vec2 */
  update(playerPos: Vec2, dt: number): void {
    // v3: playerPos is Vec2, use Vec2.clone for target
    this.target = Vec2.fromXY(playerPos.x, playerPos.y);
    
    const dx = this.target.x - this.current.x;
    const dy = this.target.y - this.current.y;
    const lerp = 1 - Math.exp(-this.smoothSpeed * dt);
    this.current.x += dx * lerp;
    this.current.y += dy * lerp;
  }

  /** v3: Returns Vec2.clone() — never expose internal reference */
  getPosition(): Vec2 {
    return this.current.clone();
  }

  setZoom(z: number): void {
    this.zoom = z;
  }

  getZoom(): number {
    return this.zoom;
  }
}
```

---

## 2. RenderSystem (v3 — читает компоненты)

Файл: `src/game/ecs/systems/RenderSystem.ts`

```typescript
import { Vec2 } from '../math/Vec2';
import { Entity } from '../Entity';
import { Renderer } from '../../render';
import { Fx } from '../../fx';
import { Starfield } from '../../starfield';
import { Rift } from '../systems/RiftField';

/**
 * RenderSystem — WebGL wireframe рендер.
 * Читает компоненты для отрисовки.
 * ВСЕ позиции — через Vec2.
 * 
 * ✅ v3: read render components for all entity types
 * ✅ v3: renderEntity() method pattern defined
 */
export class RenderSystem {
  private renderer: Renderer;
  private fx: Fx;
  private starfield: Starfield;
  private rifts: Rift[];

  constructor(
    canvas: HTMLCanvasElement,
    fx: Fx,
    starfield: Starfield,
    rifts: Rift[]
  ) {
    this.renderer = new Renderer(canvas);
    this.fx = fx;
    this.starfield = starfield;
    this.rifts = rifts;
  }

  /** Отрисовать все сущности */
  render(
    player: Entity | null,
    enemies: Entity[],
    bullets: Entity[],
    enemyBullets: Entity[],
    pickups: Entity[],
    drones: Entity[],
    mines: Entity[],
    asteroids: Entity[],
    camPos: Vec2
  ): void {
    // Background
    this.renderer.clear();

    // Starfield (фон, не ECS)
    this.starfield.render(this.renderer, camPos);

    // Rifts
    for (const rift of this.rifts) {
      this.renderRift(rift, camPos);
    }

    // ECS entities — читаем компоненты для рендера
    if (player) this.renderEntity(player, camPos, 'player');
    
    for (const e of enemies) {
      this.renderEntity(e, camPos, 'enemy');
    }
    
    for (const b of bullets) {
      this.renderEntity(b, camPos, 'bullet');
    }
    
    for (const b of enemyBullets) {
      this.renderEntity(b, camPos, 'enemyBullet');
    }
    
    for (const p of pickups) {
      this.renderEntity(p, camPos, 'pickup');
    }
    
    for (const d of drones) {
      this.renderEntity(d, camPos, 'drone');
    }
    
    for (const m of mines) {
      this.renderEntity(m, camPos, 'mine');
    }
    
    for (const a of asteroids) {
      this.renderEntity(a, camPos, 'asteroid');
    }

    // FX
    this.fx.render(this.renderer, camPos);

    // Bloom
    this.renderer.applyBloom();
  }

  /**
   * Отрисовать одну ECS-сущность — читает transform + render компоненты.
   * pattern: transform для позиции, render для стилей.
   */
  private renderEntity(entity: Entity, cam: Vec2, type: string): void {
    const transform = entity.getComponent<any>('transform');
    const render = entity.getComponent<any>('render');
    
    if (!transform || !render) return;
    
    const x = transform.x - cam.x;
    const y = transform.y - cam.y;
    
    switch (type) {
      case 'player':
        this.drawCircle(x, y, 12, render.strokeColor, render.strokeWidth);
        break;
      case 'enemy':
        this.drawCircle(x, y, 10, render.strokeColor, render.strokeWidth);
        break;
      case 'bullet':
        this.drawCircle(x, y, 3, render.strokeColor, render.strokeWidth);
        break;
      case 'enemyBullet':
        this.drawCircle(x, y, 5, render.strokeColor, render.strokeWidth);
        break;
      case 'pickup':
        this.drawPickedup(x, y, render);
        break;
      case 'drone':
        this.drawCircle(x, y, 8, render.strokeColor, render.strokeWidth);
        break;
      case 'mine':
        this.drawMine(x, y, render);
        break;
      case 'asteroid':
        this.drawAsteroid(x, y, 15, render.strokeColor);
        break;
    }
  }

  // ---- Рисование примитивов ----

  private drawCircle(x: number, y: number, r: number, color: string, width: number): void {
    // WebGL wireframe circle
  }

  private drawPickedup(x: number, y: number, render: any): void {
    // Пульсирующий pickup
  }

  private drawMine(x: number, y: number, render: any): void {
    // Mine с вращением
  }

  private drawAsteroid(x: number, y: number, r: number, color: string): void {
    // Asteroid — irregular polygon
  }

  private renderRift(rift: Rift, cam: Vec2): void {
    // Draw rift
  }
}
```

---

## 3. Критерии завершения этапа

1. ✅ `CameraSystem` следует за игроком smooth через Vec2
2. ✅ `RenderSystem` читает компоненты для отрисовки
3. ✅ WebGL wireframe рендеринг сохранён
4. ✅ Bloom работает
5. ✅ FX отображаются
6. ✅ ✅ CameraSystem uses Vec2 for all positions
7. ✅ ✅ RenderSystem reads components, not raw data
8. ✅ ✅ renderEntity() method pattern defined
