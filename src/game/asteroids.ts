/* Infinite asteroid belt, chunk-generated like the starfield.
   Big rocks always split, mediums sometimes do, smalls never.
   The wave zone repels rocks.

   Астероиды — ECS-сущности из базовых (Position/Velocity/Radius/Life) + узкого
   AsteroidComponent (маркер). Пояс (этот класс) генерирует чанки-затравки и спавнит
   астероиды в engine; физика, коллизии, зона и рендер читают/пишут компоненты через
   AsteroidRef. Позицию астероида может интегрировать физический движок (Planck) —
   тогда игровой код не двигает её. */

import type { IRenderer } from "./render/index";
import type { AudioManager } from "./systems/AudioManager";
import type { Fx } from "./fx";
import type { EventBus } from "./core/EventBus";
import { softResolveCollision } from "./systems/EntityCollision";
import { TAU, clamp, mulberry32, rgba } from "./math";
import type { AsteroidKind, PickupKind } from "./balance";
import { massForRadius } from "./balance";
import type { EcsWorld, AsteroidRef } from "./ecs";

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

/** Затравка чанка — plain-данные, из которых при спавне собирается ECS-сущность. */
interface AstSeed {
  key: string;
  kind: AsteroidKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  angle: number;
  spin: number;
  verts: number[];
  hp: number;
  maxHp: number;
  mass: number;
}

const CHUNK = 1000;
const CAP = 220;
const CULL_DIST = 2800;

function astDef(kind: AsteroidKind) {
  switch (kind) {
    case "small":
      return { rMin: 8, rMax: 12, hp: 22, score: 6 };
    case "medium":
      return { rMin: 17, rMax: 23, hp: 60, score: 15 };
    case "large":
      return { rMin: 30, rMax: 40, hp: 140, score: 30 };
  }
}

function makeSeed(
  key: string,
  kind: AsteroidKind,
  x: number,
  y: number,
  rnd: () => number,
  vx: number,
  vy: number
): AstSeed {
  const d = astDef(kind);
  const r = d.rMin + rnd() * (d.rMax - d.rMin);
  const verts: number[] = [];
  const n = 9 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) verts.push(0.72 + rnd() * 0.3);
  return {
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
  };
}

export class AsteroidField {
  /** Живые астероиды пояса — связки компонентов (та же правда, что у физики/рендера). */
  get asteroidList(): AsteroidRef[] {
    return this.h.ecs.asteroids();
  }

  private chunks = new Map<string, AstSeed[]>();
  private gone = new Set<string>();
  private boundsKey = "";
  private fragSeq = 0;

  constructor(private h: AsteroidHooks, eventBus?: EventBus) {
    if (eventBus) {
      eventBus.subscribe('asteroid_hit', (event) => {
        this.damageAt(event.payload.index, event.payload.dmg, event.payload.x ?? 0, event.payload.y ?? 0);
      });
    }
  }

  private genChunk(cx: number, cy: number): AstSeed[] {
    const seed = (Math.imul(cx, 91733) ^ Math.imul(cy, 46511) ^ 0x5eed) >>> 0;
    const rnd = mulberry32(seed || 0x9e3779b9);
    const out: AstSeed[] = [];
    const count = 9 + Math.floor(rnd() * 5);
    for (let i = 0; i < count; i++) {
      const roll = rnd();
      const kind: AsteroidKind = roll < 0.18 ? "large" : roll < 0.52 ? "medium" : "small";
      const x = cx * CHUNK + rnd() * CHUNK;
      const y = cy * CHUNK + rnd() * CHUNK;
      const va = rnd() * TAU;
      const vs = 4 + rnd() * 14;
      out.push(makeSeed(`${cx},${cy}:${i}`, kind, x, y, rnd, Math.cos(va) * vs, Math.sin(va) * vs));
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
    const alive = new Map<string, AsteroidRef>();
    for (const a of this.asteroidList) alive.set(a.marker.key, a);
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
          alive.set(seedAst.key, this.asteroidByKey(seedAst.key));
        }
      }
    }

    // integrate pos if custom physics; cull far rocks; shove out of the zone
    for (let i = this.asteroidList.length - 1; i >= 0; i--) {
      const a = this.asteroidList[i];
      const { marker, position, velocity, radius } = a;
      // В режиме Planck позицию астероида интегрирует физический движок.
      if (env.physicsIntegrates !== false) {
        position.x += velocity.vx * dt;
        position.y += velocity.vy * dt;
      }
      marker.angle += marker.spin * dt;

      // the wave zone is sacred ground — shove rocks out and keep them out
      if (env.zone) {
        const zdx = position.x - env.zone.x;
        const zdy = position.y - env.zone.y;
        const zd = Math.hypot(zdx, zdy) || 1;
        const lim = env.zone.r + radius.r + 26;
        if (zd < lim) {
          const push = 260 * dt;
          velocity.vx += (zdx / zd) * push * 8;
          velocity.vy += (zdy / zd) * push * 8;
          position.x = env.zone.x + (zdx / zd) * lim;
          position.y = env.zone.y + (zdy / zd) * lim;
        }
      }

      // cull anything far behind the camera
      if (Math.hypot(position.x - env.camX, position.y - env.camY) > CULL_DIST) {
        this.removeByKey(marker.key);
      }
    }

    // Asteroid-asteroid collisions (soft body physics with mass)
    // В режиме Planck контакты астероидов решает физический движок (тела
    // зарегистрированы в PhysicsSystem), поэтому дублирование убираем.
    const astList = this.asteroidList;
    if (!env.physicsResolves) {
      const astCount = astList.length;
      for (let i = 0; i < astCount; i++) {
        const a1 = astList[i];
        for (let j = i + 1; j < astCount; j++) {
          const a2 = astList[j];
          const dx = a2.position.x - a1.position.x;
          const dy = a2.position.y - a1.position.y;
          const dist = Math.hypot(dx, dy);
          const minDist = a1.radius.r + a2.radius.r;

          if (dist < minDist && dist > 0.01) {
            const result = softResolveCollision(
              a1.position.x, a1.position.y, a1.marker.mass, a1.velocity.vx, a1.velocity.vy,
              a2.position.x, a2.position.y, a2.marker.mass, a2.velocity.vx, a2.velocity.vy,
              1.2
            );
            a1.velocity.vx = result.na.vx;
            a1.velocity.vy = result.na.vy;
            a2.velocity.vx = result.nb.vx;
            a2.velocity.vy = result.nb.vy;
          }
        }
      }
    }
    if (astList.length > CAP) {
      for (let i = CAP; i < astList.length; i++) this.removeByKey(astList[i].marker.key);
    }
  }

  /** Bullet hit: damages the rock at `index`, destroying it at 0 hp. */
  damageAt(index: number, dmg: number, hx: number, hy: number) {
    const a = this.asteroidList[index];
    if (!a) return;
    a.life.remaining -= dmg;
    this.h.fx.burst(hx, hy, 3, "#b9c4d6", 100, 0.2);
    if (a.life.remaining <= 0) {
      this.destroy(a);
    }
  }

  /** Впрыснуть готовый астероид в пояс (напр. меню-сценой) как ECS-сущность. */
  spawn(state: Parameters<EcsWorld["spawnAsteroid"]>[0]): void {
    this.h.ecs.spawnAsteroid(state);
  }

  /** Снять астероид с ECS-мира и пометить как уничтоженный (осколки/счёт/звук). */
  private destroy(a: AsteroidRef) {
    const { marker, position, velocity, radius } = a;
    this.gone.add(marker.key);
    this.removeByKey(marker.key);
    const d = astDef(marker.kind);
    this.h.addScore(d.score);
    this.h.fx.burst(
      position.x,
      position.y,
      marker.kind === "large" ? 26 : marker.kind === "medium" ? 16 : 9,
      "#b9c4d6",
      marker.kind === "large" ? 300 : 200,
      0.5
    );
    this.h.audio.playExplosion(marker.kind === "large" ? 0.9 : 0.5);
    this.h.fx.addShake(marker.kind === "large" ? 4 : marker.kind === "medium" ? 2.5 : 1);

    const spawnFrag = (kind: AsteroidKind) => {
      const ang = Math.random() * TAU;
      const dist = radius.r * 0.5;
      this.fragSeq++;
      const frag = makeSeed(
        `f${this.fragSeq}`,
        kind,
        position.x + Math.cos(ang) * dist,
        position.y + Math.sin(ang) * dist,
        Math.random,
        velocity.vx + Math.cos(ang) * (40 + Math.random() * 60),
        velocity.vy + Math.sin(ang) * (40 + Math.random() * 60)
      );
      this.h.ecs.spawnAsteroid({
        key: frag.key, kind: frag.kind, x: frag.x, y: frag.y,
        vx: frag.vx, vy: frag.vy, r: frag.r, angle: frag.angle,
        spin: frag.spin, verts: frag.verts, hp: frag.hp, maxHp: frag.maxHp,
        mass: frag.mass, dead: false,
      });
    };

    if (marker.kind === "large") {
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
    } else if (marker.kind === "medium" && Math.random() < 0.7) {
      spawnFrag("small");
      spawnFrag("small");
    }
  }

  /** Удалить астероид по строковой идентичности пояса. */
  private removeByKey(key: string): void {
    this.h.ecs.removeAsteroidByKey(key);
  }

  private asteroidByKey(key: string): AsteroidRef {
    return this.h.ecs.asteroidByKey(key)!;
  }

  draw(R: IRenderer, time: number) {
    for (const a of this.asteroidList) {
      const { marker, position, radius, life } = a;
      if (marker.dead) continue;
      const n = marker.verts.length;
      if (n === 0) continue;
      const pts: Array<[number, number]> = [];
      for (let i = 0; i < n; i++) {
        const ang = marker.angle + (i / n) * TAU;
        const rr = radius.r * marker.verts[i];
        pts.push([position.x + Math.cos(ang) * rr, position.y + Math.sin(ang) * rr]);
      }
      R.polyline(pts, true, rgba("#8d9ab0", 0.85));
      R.pushLine(
        position.x - radius.r * 0.3,
        position.y - radius.r * 0.2,
        position.x + radius.r * 0.25,
        position.y + radius.r * 0.35,
        rgba("#8d9ab0", 0.3)
      );
      if (life.remaining < life.max) {
        const f = clamp(life.remaining / life.max, 0, 1);
        const seg = Math.max(3, Math.round(8 * f));
        R.dashedCircle(position.x, position.y, radius.r + 5, rgba("#ffbf66", 0.4), seg, time, 0.4);
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