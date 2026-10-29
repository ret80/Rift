/* Infinite asteroid belt, chunk-generated like the starfield.
   Big rocks always split, mediums sometimes do, smalls never.
   The wave zone repels rocks.

   Астероиды — ECS-сущности с AsteroidComponent (единственный источник правды).
   Пояс (этот класс) генерирует чанки и спавнит астероиды в engine; физика,
   коллизии, зона и рендер читают/пишут компоненты. Позицию астероида может
   интегрировать физический движок (Planck) — тогда игровой код не двигает её. */

import type { IRenderer } from "./render/index";
import type { AudioManager } from "./systems/AudioManager";
import type { Fx } from "./fx";
import type { EventBus } from "./core/EventBus";
import { softResolveCollision } from "./systems/EntityCollision";
import { TAU, clamp, mulberry32, rgba } from "./math";
import type { AsteroidKind, PickupKind } from "./balance";
import { massForRadius } from "./balance";
import type { EcsWorld } from "./ecs";
import { AsteroidComponent } from "./ecs/components/AsteroidComponent";

export interface AsteroidEnv {
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  /** active wave zone, or null when there is none */
  zone: { x: number; y: number; r: number } | null;
  /** Позиции интегрирует физический движок (Planck) — игровой код не двигает. */
  physicsIntegrates?: boolean;
  /** Физический бэкенд сам решает контакты астероид-астероид (Planck). */
  physicsResolves?: boolean;
}

export interface AsteroidHooks {
  addScore(n: number): void;
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void;
  fx: Fx;
  audio: AudioManager;
  /** ECS-мир: пояс спавнит астероиды сюда как сущности. */
  ecs: EcsWorld;
}

const CHUNK = 1000;
const CAP = 220;
const CULL_DIST = 2800;

function astDef(kind: AsteroidKind) {
  switch (kind) {
    case "small":
      return { rMin: 8, rMax: 12, hp: 22, score: 6, mass: 0 }; // mass calculated dynamically
    case "medium":
      return { rMin: 17, rMax: 23, hp: 60, score: 15, mass: 0 };
    case "large":
      return { rMin: 30, rMax: 40, hp: 140, score: 30, mass: 0 };
  }
}

function makeAst(
  key: string,
  kind: AsteroidKind,
  x: number,
  y: number,
  rnd: () => number,
  vx: number,
  vy: number
): AsteroidComponent {
  const d = astDef(kind);
  const r = d.rMin + rnd() * (d.rMax - d.rMin);
  const verts: number[] = [];
  const n = 9 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) verts.push(0.72 + rnd() * 0.3);
  return new AsteroidComponent({
    key,
    kind,
    x,
    y,
    vx,
    vy,
    r,
    angle: rnd() * TAU,
    spin: (rnd() - 0.5) * 0.6,
    verts,
    hp: d.hp,
    maxHp: d.hp,
    mass: massForRadius(r),
    dead: false,
  });
}

export class AsteroidField {
  /** Живые астероиды пояса — читаются из ECS (те же компоненты, что физика/рендер). */
  get asteroidList(): AsteroidComponent[] {
    return this.h.ecs.asteroids();
  }

  private chunks = new Map<string, AsteroidComponent[]>();
  private gone = new Set<string>();
  private boundsKey = "";
  private fragSeq = 0;

  constructor(private h: AsteroidHooks, eventBus?: EventBus) {
    if (eventBus) {
      // Subscribe to asteroid hit events
      eventBus.subscribe('asteroid_hit', (event) => {
        this.damageAt(event.payload.index, event.payload.dmg, event.payload.x ?? 0, event.payload.y ?? 0);
      });
    }
  }

  private genChunk(cx: number, cy: number): AsteroidComponent[] {
    const seed = (Math.imul(cx, 91733) ^ Math.imul(cy, 46511) ^ 0x5eed) >>> 0;
    const rnd = mulberry32(seed || 0x9e3779b9);
    const out: AsteroidComponent[] = [];
    const count = 9 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) {
      const roll = rnd();
      const kind: AsteroidKind = roll < 0.18 ? "large" : roll < 0.52 ? "medium" : "small";
      const x = cx * CHUNK + rnd() * CHUNK;
      const y = cy * CHUNK + rnd() * CHUNK;
      const va = rnd() * TAU;
      const vs = 4 + rnd() * 14;
      out.push(makeAst(`${cx},${cy}:${i}`, kind, x, y, rnd, Math.cos(va) * vs, Math.sin(va) * vs));
    }
    return out;
  }

  update(dt: number, env: AsteroidEnv) {
    const x0 = Math.floor((env.camX - env.viewW / 2) / CHUNK) - 1;
    const x1 = Math.floor((env.camX + env.viewW / 2) / CHUNK) + 1;
    const y0 = Math.floor((env.camY - env.viewH / 2) / CHUNK) - 1;
    const y1 = Math.floor((env.camY + env.viewH / 2) / CHUNK) + 1;
    const key = `${x0},${x1},${y0},${y1}`;

    if (key !== this.boundsKey) {
      this.boundsKey = key;
      const keep = new Set<string>();
      for (let cx = x0; cx <= x1; cx++) {
        for (let cy = y0; cy <= y1; cy++) {
          const k = `${cx},${cy}`;
          keep.add(k);
          if (!this.chunks.has(k)) this.chunks.set(k, this.genChunk(cx, cy));
        }
      }
      for (const k of Array.from(this.chunks.keys())) {
        if (!keep.has(k)) {
          this.chunks.delete(k);
          // forget destroyed asteroids in evicted chunks so the field regrows
          for (const g of Array.from(this.gone)) if (g.startsWith(k + ":")) this.gone.delete(g);
        }
      }
    }

    // spawn any seeded asteroids that are not alive or destroyed
    const alive = new Map<string, AsteroidComponent>();
    for (const a of this.asteroidList) alive.set(a.key, a);
    for (const chunk of this.chunks.values()) {
      for (const seedAst of chunk) {
        if (!alive.has(seedAst.key) && !this.gone.has(seedAst.key)) {
          this.h.ecs.spawnAsteroid({
            key: seedAst.key,
            kind: seedAst.kind,
            x: seedAst.x,
            y: seedAst.y,
            vx: seedAst.vx,
            vy: seedAst.vy,
            r: seedAst.r,
            angle: seedAst.angle,
            spin: seedAst.spin,
            verts: seedAst.verts,
            hp: seedAst.hp,
            maxHp: seedAst.maxHp,
            mass: seedAst.mass,
            dead: false,
          });
          alive.set(seedAst.key, seedAst);
        }
      }
    }

    // cull anything far behind the camera; integrate pos if custom physics
    for (let i = this.asteroidList.length - 1; i >= 0; i--) {
      const a = this.asteroidList[i];
      // В режиме Planck позицию астероида интегрирует физический движок.
      if (env.physicsIntegrates !== false) {
        a.x += a.vx * dt;
        a.y += a.vy * dt;
      }
      a.angle += a.spin * dt;

      // the wave zone is sacred ground — shove rocks out and keep them out
      if (env.zone) {
        const zdx = a.x - env.zone.x;
        const zdy = a.y - env.zone.y;
        const zd = Math.hypot(zdx, zdy) || 1;
        const lim = env.zone.r + a.r + 26;
        if (zd < lim) {
          const push = 260 * dt;
          a.vx += (zdx / zd) * push * 8;
          a.vy += (zdy / zd) * push * 8;
          a.x = env.zone.x + (zdx / zd) * lim;
          a.y = env.zone.y + (zdy / zd) * lim;
        }
      }

      // cull anything far behind the camera
      if (Math.hypot(a.x - env.camX, a.y - env.camY) > CULL_DIST) {
        this.removeByKey(a.key);
      }
    }

    // Asteroid-asteroid collisions (soft body physics with mass)
    // В режиме Planck контакты астероидов решает физический движок
    // (тела зарегистрированы в PhysicsSystem), поэтому дублирование
    // убираем, чтобы не накладывать два импульса.
    const astList = this.asteroidList;
    if (!env.physicsResolves) {
      const astCount = astList.length;
      for (let i = 0; i < astCount; i++) {
        const a1 = astList[i];
        for (let j = i + 1; j < astCount; j++) {
          const a2 = astList[j];
          const dx = a2.x - a1.x;
          const dy = a2.y - a1.y;
          const dist = Math.hypot(dx, dy);
          const minDist = a1.r + a2.r;

          if (dist < minDist && dist > 0.01) {
            const result = softResolveCollision(
              a1.x, a1.y, a1.mass, a1.vx, a1.vy,
              a2.x, a2.y, a2.mass, a2.vx, a2.vy,
              1.2
            );
            a1.vx = result.na.vx;
            a1.vy = result.na.vy;
            a2.vx = result.nb.vx;
            a2.vy = result.nb.vy;
          }
        }
      }
    }
    if (astList.length > CAP) {
      for (let i = CAP; i < astList.length; i++) this.removeByKey(astList[i].key);
    }
  }

  /** Bullet hit: damages the rock at `index`, destroying it at 0 hp. */
  damageAt(index: number, dmg: number, hx: number, hy: number) {
    const a = this.asteroidList[index];
    if (!a) return;
    a.hp -= dmg;
    this.h.fx.burst(hx, hy, 3, "#b9c4d6", 100, 0.2);
    if (a.hp <= 0) {
      this.destroy(a);
    }
  }

  /** Впрыснуть готовый астероид в пояс (напр. меню-сценой) как ECS-сущность. */
  spawn(state: Partial<AsteroidComponent>): void {
    this.h.ecs.spawnAsteroid(state);
  }

  /** Снять астероид с ECS-мира и пометить как уничтоженный (осколки/счёт/звук). */
  private destroy(a: AsteroidComponent) {
    this.gone.add(a.key);
    this.removeByKey(a.key);
    const d = astDef(a.kind);
    this.h.addScore(d.score);
    this.h.fx.burst(
      a.x,
      a.y,
      a.kind === "large" ? 26 : a.kind === "medium" ? 16 : 9,
      "#b9c4d6",
      a.kind === "large" ? 300 : 200,
      0.5
    );
    this.h.audio.playExplosion(a.kind === "large" ? 0.9 : 0.5);
    this.h.fx.addShake(a.kind === "large" ? 4 : a.kind === "medium" ? 2.5 : 1);

    const spawnFrag = (kind: AsteroidKind) => {
      const ang = Math.random() * TAU;
      const dist = a.r * 0.5;
      this.fragSeq++;
      const frag = makeAst(
        `f${this.fragSeq}`,
        kind,
        a.x + Math.cos(ang) * dist,
        a.y + Math.sin(ang) * dist,
        Math.random,
        a.vx + Math.cos(ang) * (40 + Math.random() * 60),
        a.vy + Math.sin(ang) * (40 + Math.random() * 60)
      );
      this.h.ecs.spawnAsteroid({
        key: frag.key, kind: frag.kind, x: frag.x, y: frag.y,
        vx: frag.vx, vy: frag.vy, r: frag.r, angle: frag.angle,
        spin: frag.spin, verts: frag.verts, hp: frag.hp, maxHp: frag.maxHp,
        mass: frag.mass, dead: false,
      });
    };

    if (a.kind === "large") {
      const roll = Math.random();
      if (roll < 0.5) {
        spawnFrag("medium");
        spawnFrag("small");
        spawnFrag("small");
      } else if (roll < 0.75) {
        spawnFrag("medium");
        spawnFrag("medium");
      } else {
        spawnFrag("small");
        spawnFrag("small");
        spawnFrag("small");
      }
    } else if (a.kind === "medium" && Math.random() < 0.7) {
      spawnFrag("small");
      spawnFrag("small");
    }
  }

  /** Удалить астероид по строковой идентичности пояса. */
  private removeByKey(key: string): void {
    this.h.ecs.removeAsteroidByKey(key);
  }

  draw(R: IRenderer, time: number) {
    for (const a of this.asteroidList) {
      if (a.dead) continue;
      const n = a.verts.length;
      if (n === 0) continue;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const ang = a.angle + (i / n) * TAU;
        const rr = a.r * a.verts[i];
        pts.push([a.x + Math.cos(ang) * rr, a.y + Math.sin(ang) * rr]);
      }
      R.polyline(pts, true, rgba("#8d9ab0", 0.85));
      R.pushLine(
        a.x - a.r * 0.3,
        a.y - a.r * 0.2,
        a.x + a.r * 0.25,
        a.y + a.r * 0.35,
        rgba("#8d9ab0", 0.3)
      );
      if (a.hp < a.maxHp) {
        const f = clamp(a.hp / a.maxHp, 0, 1);
        R.dashedCircle(a.x, a.y, a.r + 5, rgba("#ffbf66", 0.4), Math.max(3, Math.round(8 * f)), time, 0.4);
      }
    }
  }

  /** Soft reset (back to menu): the belt regrows from its chunks. */
  reset() {
    this.h.ecs.clearAsteroids();
  }

  /** Hard reset (new run): wipe chunks and the destroyed ledger too. */
  hardReset() {
    this.h.ecs.clearAsteroids();
    this.chunks.clear();
    this.gone.clear();
    this.boundsKey = "";
    this.fragSeq = 0;
  }
}