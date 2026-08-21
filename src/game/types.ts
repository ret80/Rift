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

/* ---- Entity types (from game.ts) ---- */

import type { PickupKind } from "./balance";

export interface Enemy {
  kind: EnemyKind;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  hp: number; maxHp: number;
  r: number; speed: number;
  contact: number; score: number;
  boltDmg: number; fireCd: number;
  mode: number; modeT: number;
  strafeDir: number; seed: number;
  spawnCd: number; flash: number; hitCd: number;
  dead: boolean; parent: Enemy | null;
  mass: number;
  dodgeWeight: number;
  dodgeDir: number; dodgeTimer: number;
  burstSpawned: number;
  burstActive: boolean;
  burstRestT: number;
  burstCd: number;
}

export interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  life: number; dmg: number;
}

export interface EBullet {
  x: number; y: number;
  vx: number; vy: number;
  life: number; dmg: number;
  heavy: boolean;
  cruiser: boolean;
}

export interface Pickup {
  kind: PickupKind;
  x: number; y: number;
  vx: number; vy: number;
  life: number; seed: number;
  r: number;
}

export interface Mine {
  x: number; y: number;
  fuse: number; seed: number;
}

export interface AllyDrone {
  x: number; y: number;
  r: number;
  angle: number;
  fireCd: number; phase: number;
  hp: number; maxHp: number;
  target: Enemy | null;
  retargetT: number; flash: number;
}
