/* Infinite asteroid belt, chunk-generated like the starfield.
   Big rocks always split, mediums sometimes do, smalls never.
   Every rock can drop a mineral. The wave zone repels rocks. */

import type { Renderer } from "./render";
import type { AudioEngine } from "./audio";
import type { Fx } from "./fx";
import { TAU, rand, clamp, mulberry32, rgba } from "./math";
import type { AsteroidKind, PickupKind } from "./balance";
import { massForRadius } from "./balance";

export interface Asteroid {
  id: string;
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

export interface AsteroidEnv {
  camX: number;
  camY: number;
  viewW: number;
  viewH: number;
  /** active wave zone, or null when there is none */
  zone: { x: number; y: number; r: number } | null;
}

export interface AsteroidHooks {
  addScore(n: number): void;
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void;
  fx: Fx;
  audio: AudioEngine;
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
  id: string,
  kind: AsteroidKind,
  x: number,
  y: number,
  rnd: () => number,
  vx: number,
  vy: number
): Asteroid {
  const d = astDef(kind);
  const r = d.rMin + rnd() * (d.rMax - d.rMin);
  const verts: number[] = [];
  const n = 9 + Math.floor(rnd() * 3);
  for (let i = 0; i < n; i++) verts.push(0.72 + rnd() * 0.3);
  return {
    id,
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
  readonly list: Asteroid[] = [];

  private chunks = new Map<string, Asteroid[]>();
  private gone = new Set<string>();
  private boundsKey = "";
  private fragSeq = 0;

  constructor(private h: AsteroidHooks) {}

  private genChunk(cx: number, cy: number): Asteroid[] {
    const seed = (Math.imul(cx, 91733) ^ Math.imul(cy, 46511) ^ 0x5eed) >>> 0;
    const rnd = mulberry32(seed || 0x9e3779b9);
    const out: Asteroid[] = [];
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
    const alive = new Set<string>();
    for (const a of this.list) alive.add(a.id);
    for (const chunk of this.chunks.values()) {
      for (const seedAst of chunk) {
        if (!alive.has(seedAst.id) && !this.gone.has(seedAst.id)) {
          this.list.push(seedAst);
          alive.add(seedAst.id);
        }
      }
    }

    for (let i = this.list.length - 1; i >= 0; i--) {
      const a = this.list[i];
      a.x += a.vx * dt;
      a.y += a.vy * dt;
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
        this.list.splice(i, 1);
      }
    }

    // Asteroid-asteroid collisions (soft body physics with mass)
    const astCount = this.list.length;
    for (let i = 0; i < astCount; i++) {
      const a1 = this.list[i];
      for (let j = i + 1; j < astCount; j++) {
        const a2 = this.list[j];
        const dx = a2.x - a1.x;
        const dy = a2.y - a1.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a1.r + a2.r;
        
        if (dist < minDist && dist > 0.01) {
          // Soft collision resolution (same as CollisionSystem)
          const nx = dx / dist;
          const ny = dy / dist;
          const dvx = a1.vx - a2.vx;
          const dvy = a1.vy - a2.vy;
          const dvn = dvx * nx + dvy * ny;
          
          if (dvn > 0) {
            const totalMass = a1.mass + a2.mass;
            const e = 0.15;
            const j = -(1 + e) * dvn / (1 / a1.mass + 1 / a2.mass);
            
            const newAvx = a1.vx + (j / a1.mass) * nx;
            const newAvy = a1.vy + (j / a1.mass) * ny;
            const newBvx = a2.vx - (j / a2.mass) * nx;
            const newBvy = a2.vy - (j / a2.mass) * ny;
            
            a1.vx = Math.max(-200, Math.min(200, newAvx));
            a1.vy = Math.max(-200, Math.min(200, newAvy));
            a2.vx = Math.max(-200, Math.min(200, newBvx));
            a2.vy = Math.max(-200, Math.min(200, newBvy));
          }
        }
      }
    }
    if (this.list.length > CAP) this.list.length = CAP;
  }

  /** Bullet hit: damages the rock at `index`, destroying it at 0 hp. */
  damageAt(index: number, dmg: number, hx: number, hy: number) {
    const a = this.list[index];
    a.hp -= dmg;
    this.h.fx.burst(hx, hy, 3, "#b9c4d6", 100, 0.2);
    if (a.hp <= 0) {
      this.list.splice(index, 1);
      this.destroy(a);
    }
  }

  private destroy(a: Asteroid) {
    this.gone.add(a.id);
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
    this.h.audio.explode(a.kind === "large" ? 0.9 : 0.5);
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
      this.list.push(frag);
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

    // minerals tumble out of every rock type
    const dropChance = a.kind === "large" ? 0.7 : a.kind === "medium" ? 0.4 : 0.25;
    if (Math.random() < dropChance) {
      this.h.spawnPickup("mineral", a.x + rand(-10, 10), a.y + rand(-10, 10), rand(-40, 40), rand(-40, 40));
    }
  }

  draw(R: Renderer, time: number) {
    for (const a of this.list) {
      const n = a.verts.length;
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
    this.list.length = 0;
  }

  /** Hard reset (new run): wipe chunks and the destroyed ledger too. */
  hardReset() {
    this.list.length = 0;
    this.chunks.clear();
    this.gone.clear();
    this.boundsKey = "";
  }
}
