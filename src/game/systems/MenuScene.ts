/**
 * MenuScene - анимация меню: разломы, враги, астероиды.
 * Координирует визуальную составляющую экран меню без игрового процесса.
 */

import {
  EnemyKind,
  MENU_ASTEROID_COUNT,
  MENU_RIFT_OPEN_TIME,
  MENU_RIFT_SPAWN_DELAY,
  MENU_RIFT_SPAWN_TIME,
  MENU_RIFT_CLOSE_TIME,
  MENU_RIFT_MIN_INTERVAL,
  MENU_RIFT_MAX_INTERVAL,
  MENU_ENEMY_MIN_SPEED,
  MENU_ENEMY_MAX_SPEED,
  MENU_EDGE_MARGIN as MENU_EDGE_MARGIN_PX,
  massForRadius,
} from "../balance";
import { type Starfield } from "../starfield";
import { type AsteroidField } from "../asteroids";
import { type RiftField } from "../rifts";
import { type RendererSystem } from "./RendererSystem";
import type { Renderer } from "../render";
import type { Enemy } from "../types";

/* ===== Menu types ===== */

interface MenuRift {
  x: number;
  y: number;
  t: number;
  state: "opening" | "spawning" | "closing";
  queue: EnemyKind[];
  timer: number;
  seed: number;
  rot: number;
  size: number;
  nextSpawnT: number;
}

interface MenuEnemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: EnemyKind;
  angle: number;
  seed: number;
}

/* ===== MenuScene ===== */

export class MenuScene {
  private menuRifts: MenuRift[] = [];
  private menuEnemies: MenuEnemy[] = [];
  private menuNextRiftTimer = 0;
  private _menuAstSpawned = false;

  constructor(
    private starfield: Starfield,
    private asteroidField: AsteroidField,
    private riftField: RiftField,
    private rendererSystem: RendererSystem,
    private renderer: Renderer,
    camera: { dpr: number; webGLWidth: number; webGLHeight: number },
  ) {
    this.camera = camera;
  }

  private camera: { dpr: number; webGLWidth: number; webGLHeight: number };

  /** Update menu scene for one frame */
  update(dt: number) {
    this.starfield.update(dt, 0, 0, 1, 0, this.camera.webGLWidth / this.camera.dpr, this.camera.webGLHeight / this.camera.dpr);
    this.asteroidField.update(dt, {
      camX: 0,
      camY: 0,
      viewW: this.camera.webGLWidth / this.camera.dpr,
      viewH: this.camera.webGLHeight / this.camera.dpr,
      zone: null,
    } as any);

    // Ensure initial asteroids are spawned near the menu screen center
    if (this.asteroidField.list.length < MENU_ASTEROID_COUNT) {
      this.ensureMenuAsteroids();
    }

    this.updateMenuRifts(dt);
    this.updateMenuEnemies(dt);
  }

  /** Render the menu scene */
  render(renderer: Renderer) {
    this.rendererSystem.renderMenu(
      renderer,
      this.starfield,
      this.asteroidField,
      this.riftField,
      this.menuRifts,
      this.menuEnemies,
      this.camera.webGLWidth / this.camera.dpr,
      this.camera.webGLHeight / this.camera.dpr,
    );
  }

  /** Reset all menu state */
  reset() {
    this.riftField.reset();
    this.menuRifts = [];
    this.menuEnemies = [];
    this.menuNextRiftTimer = 2 + Math.random() * 3; // First rift appears quickly
    this._menuAstSpawned = false;
  }

  /** ===== Menu rift & enemy animation ===== */

  private updateMenuRifts(dt: number) {
    // Only one rift at a time — wait until it fully closes
    if (this.menuRifts.length === 0) {
      this.menuNextRiftTimer -= dt;
      if (this.menuNextRiftTimer <= 0) {
        this.spawnMenuRift();
        // Next rift only after 8-14 seconds
        this.menuNextRiftTimer = MENU_RIFT_MIN_INTERVAL + Math.random() * (MENU_RIFT_MAX_INTERVAL - MENU_RIFT_MIN_INTERVAL);
      }
    }

    // Update rifts (no sound)
    for (let i = this.menuRifts.length - 1; i >= 0; i--) {
      const rf = this.menuRifts[i];
      rf.t += dt;
      if (rf.state === "opening") {
        if (rf.t >= MENU_RIFT_OPEN_TIME) {
          rf.state = "spawning";
          rf.timer = MENU_RIFT_SPAWN_DELAY;
        }
      } else if (rf.state === "spawning") {
        rf.timer -= dt;
        if (rf.timer <= 0 && rf.queue.length > 0) {
          rf.timer = MENU_RIFT_SPAWN_TIME;
          const kind = rf.queue.shift()!;
          // Spawn enemy flying away from rift
          this.spawnMenuEnemy(kind, rf.x, rf.y);
        }
        // Only close if queue is truly empty and timer has expired
        if (rf.queue.length === 0 && rf.timer <= 0) {
          rf.state = "closing";
          rf.t = 0;
        }
      } else if (rf.state === "closing") {
        if (rf.t >= MENU_RIFT_CLOSE_TIME) {
          this.menuRifts.splice(i, 1);
        }
      }
    }
  }

  private spawnMenuRift() {
    // Rift spawns at random position (WebGL coords: center 0,0)
    const dpr = this.camera.dpr;
    const margin = 120;
    const w = this.camera.webGLWidth;
    const h = this.camera.webGLHeight;
    const x = -w / 2 + margin * dpr + Math.random() * (w - margin * 2 * dpr);
    const y = -h / 2 + margin * dpr + Math.random() * (h - margin * 2 * dpr);
    const count = 1 + Math.floor(Math.random() * 3); // 1-3 ships
    const kinds: EnemyKind[] = [];
    for (let i = 0; i < count; i++) {
      kinds.push(EnemyKind.Drone);
    }
    this.menuRifts.push({
      x, y,
      t: 0,
      state: "opening",
      queue: kinds,
      timer: 0.8,
      seed: Math.random() * 100,
      rot: Math.random() * Math.PI * 2,
      size: (40 + Math.random() * 20) * dpr,
      nextSpawnT: MENU_RIFT_MIN_INTERVAL + Math.random() * (MENU_RIFT_MAX_INTERVAL - MENU_RIFT_MIN_INTERVAL),
    });
  }

  private spawnMenuEnemy(kind: EnemyKind, x: number, y: number) {
    // Enemy flies away from screen center (toward nearest edge)
    const dpr = this.camera.dpr;
    const cx = 0; // screen center = world (0,0)
    const cy = 0;
    let dx = x - cx;
    let dy = y - cy;
    const len = Math.hypot(dx, dy);
    if (len < 0.01) {
      dx = 1; dy = 0;
    } else {
      dx /= len; dy /= len;
    }
    const speed = (MENU_ENEMY_MIN_SPEED + Math.random() * MENU_ENEMY_MAX_SPEED) * dpr;
    const angle = Math.atan2(dy, dx);
    this.menuEnemies.push({
      x: x + dx * 30,
      y: y + dy * 30,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      kind,
      angle,
      seed: Math.random() * 100,
    });
  }

  private updateMenuEnemies(dt: number) {
    const dpr = this.camera.dpr;
    const w = this.camera.webGLWidth;
    const h = this.camera.webGLHeight;
    const margin = MENU_EDGE_MARGIN_PX * dpr;

    for (const e of this.menuEnemies) {
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    // Remove enemies that are off screen (in WebGL coordinates)
    this.menuEnemies = this.menuEnemies.filter(e =>
      e.x > -w / 2 - margin && e.x < w / 2 + margin &&
      e.y > -h / 2 - margin && e.y < h / 2 + margin
    );
  }

  /** Spawn initial asteroids around the menu screen center with proper physics */
  private ensureMenuAsteroids(): void {
    if (this._menuAstSpawned) return;
    this._menuAstSpawned = true;

    // Create asteroids around the menu screen center with proper physics
    const count = MENU_ASTEROID_COUNT;
    const rng = (Math.random() * 200000) | 0;
    const mulberry = (seed: number) => {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      let t = Math.imul(seed ^ seed >>> 15, 1 | seed);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };

    for (let i = 0; i < count; i++) {
      const angle = mulberry(i * 7 + rng) * Math.PI * 2;
      const dist = 100 + mulberry(i * 13 + rng) * 500;
      const x = Math.cos(angle) * dist;
      const y = Math.sin(angle) * dist;

      // Random velocity - move across the screen
      const speed = 20 + mulberry(i * 17 + rng) * 80;
      const vAngle = mulberry(i * 23 + rng) * Math.PI * 2;
      const vx = Math.cos(vAngle) * speed;
      const vy = Math.sin(vAngle) * speed;

      // Random size - mix of all types
      const kindRoll = mulberry(i * 31 + rng);
      let kind: "small" | "medium" | "large" = "small";
      if (kindRoll < 0.2) kind = "large";
      else if (kindRoll < 0.5) kind = "medium";

      // Create asteroid directly in the list with all properties
      const r = kind === "large" ? 30 + mulberry(i * 37 + rng) * 10 :
                kind === "medium" ? 17 + mulberry(i * 41 + rng) * 6 :
                                   8 + mulberry(i * 43 + rng) * 4;
      const verts: number[] = [];
      const n = 9 + Math.floor(mulberry(i * 47 + rng) * 3);
      for (let j = 0; j < n; j++) verts.push(0.72 + mulberry(i * 53 + rng + j) * 0.3);

      const hp = kind === "large" ? 140 : kind === "medium" ? 60 : 22;

      this.asteroidField.list.push({
        id: `menu-${i}`,
        kind,
        x,
        y,
        vx,
        vy,
        r,
        angle: mulberry(i * 59 + rng) * Math.PI * 2,
        spin: (mulberry(i * 61 + rng) - 0.5) * 0.8,
        verts,
        hp,
        maxHp: hp,
        mass: massForRadius(r),
      });
    }
  }
}
