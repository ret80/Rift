/* Shared type definitions extracted from fx.ts, rifts.ts, and game.ts.
   All subsystems import from here to avoid duplication. */

import type { RGBA } from "./render";

/* ---- Effect types (from fx.ts) ---- */

export interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  c: RGBA;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  c: RGBA;
  size: number;
}

/* ---- Rift types (from rifts.ts) ---- */

import type { EnemyKind } from "./balance";

export interface Rift {
  x: number;
  y: number;
  t: number;
  state: "opening" | "spawning" | "closing";
  queue: EnemyKind[];
  timer: number;
  seed: number;
  rot: number;
  size: number;
}
