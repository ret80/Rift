/* ============================================================
   Single source of truth for every tunable number in the game.
   Pure functions only — no engine state, easy to reason about
   and rebalance without touching simulation code.
   ============================================================ */

import { clamp, ramp01 } from "./math";

/* ------------------------------ palette ------------------------------ */

export const C = {
  player: "#5ef2ff",
  mint: "#9dffe8",
  bullet: "#9dffe8",
  drone: "#ff5d7e",
  hunter: "#d8ff3e",
  fighter: "#ff8c42",
  cruiser: "#b06bff",
  carrier: "#ff5da2",
  rift: "#c06bff",
  riftCore: "#e6c8ff",
  zone: "#ff3b52",
  heal: "#7dffb8",
  white: "#eaffff",
  enemyBullet: "#ff8080",
  dash: "#ffd23e",
  mine: "#ff7a45",
};

/* --------------------------- player & limits --------------------------- */

export const PLAYER_RADIUS = 13;
export const PLAYER_MAX_SPEED = 310;
/** Thrust applied per second while the player holds a direction. */
export const PLAYER_ACCEL = 1500;
/** Zone expansion is this multiplier × PLAYER_MAX_SPEED. Must be > 1 so the player can never catch it. */
export const ZONE_EXPAND_SPEED_MULT = 1.7;
/** The zone wall always outpaces the ship, so it can never be caught. */
export const ZONE_EXPAND_SPEED = PLAYER_MAX_SPEED * ZONE_EXPAND_SPEED_MULT;

/* ------------------------- zone constants ------------------------- */

/** Wall overdraw for entities clipped to zone boundary. */
export const ZONE_WALL_OVERDRIVE = 56;
/** Hysteresis distance for zone edge detection. */
export const ZONE_EDGE_HYSTERESIS = 26;
/** Distance at which pickups are magnetically attracted to the player. */
export const ZONE_PICKUP_MAGNET = 150;

/* ------------------------- player turret ------------------------- */

export const PLAYER_BULLET_SPEED = 560;
export const PLAYER_BULLET_LIFE = 0.85;
export const PLAYER_BULLET_DMG = 14;

/* ------------------------- ally drones ------------------------- */

export const ALLY_DRONE_ORBIT = 58; // orbit radius around the ship
export const ALLY_DRONE_RANGE = 430; // target acquisition / hold radius
export const ALLY_DRONE_DMG = 8;
export const ALLY_DRONE_FIRE_CD = 0.5; // seconds between shots

export const MAX_GUNS = 5;
export const MAX_ALLY_DRONES = 8;
export const GUN_OFFS = [0, 9, -9, 17, -17];

export const RATE_BOOST_TIME = 20; // seconds of a fire-rate bonus

/* ------------------------------ dash bonus ------------------------------ */

export const DASH_TIME = 3; // seconds of overdrive
export const DASH_ACCEL = 2.1; // acceleration multiplier while dashing
export const DASH_SPEED = 1.6; // max-speed multiplier while dashing
export const DASH_DMG = 16; // ram damage per hit (throttled)

/* ------------------------------ mine bonus ------------------------------ */

export const MINE_DELAY = 2; // seconds after pickup before the mine drops
export const MINE_RADIUS = 95; // blast radius; leaving it arms the detonation
export const MINE_DMG = 110; // center damage, falls off to ~40% at the edge
export const MINE_LIFE = 12; // failsafe fuse

/* ------------------------------ starfield ------------------------------ */

export interface StarLayer {
  f: number; // parallax factor (0 = pinned to camera, 1 = world space)
  chunk: number; // chunk size in layer-space
  count: number; // stars per chunk
  sMin: number;
  sMax: number;
  aMin: number;
  aMax: number;
}

export const STAR_LAYERS: StarLayer[] = [
  { f: 0.12, chunk: 2600, count: 300, sMin: 0.5, sMax: 1.1, aMin: 0.14, aMax: 0.48 },
  { f: 0.35, chunk: 2000, count: 180, sMin: 0.7, sMax: 1.5, aMin: 0.18, aMax: 0.6 },
  { f: 0.6, chunk: 1600, count: 110, sMin: 1.0, sMax: 2.0, aMin: 0.24, aMax: 0.78 },
  { f: 0.9, chunk: 1300, count: 60, sMin: 1.4, sMax: 2.6, aMin: 0.31, aMax: 0.9 },
];

/* ------------------------------- enemies ------------------------------- */

export type EnemyKind = "drone" | "hunter" | "fighter" | "cruiser" | "carrier";

/* -------------- mass based on radius (mass = π·r², scaled) -------------- */
export function massForRadius(r: number): number {
  return Math.max(1, Math.PI * r * r * 0.02);
}

/* ------------------------------- pickups ------------------------------- */

export type PickupKind =
  | "heal25"
  | "heal50"
  | "heal100"
  | "rate20"
  | "rate40"
  | "rate60"
  | "gun"
  | "drone"
  | "dash"
  | "miner"
  | "mineral"
  | "hp"
  | "rate"
  | "mine";

/* ------------------------------ asteroids ------------------------------ */

export type AsteroidKind = "small" | "medium" | "large";

export interface EnemyDef {
  r: number;
  hp: number;
  speed: number;
  contact: number;
  score: number;
  bolt: number;
  mass: number;
}

/**
 * Two-segment difficulty curves: gentle waves 1–15, steep from 15 on.
 * Late-game pressure comes from armor & firepower, not headcount.
 */
export function hpScale(w: number) {
  return 1 + 0.5 * ramp01(w, 1, 15) + 3.0 * ramp01(w, 15, 40);
}
export function dmgScale(w: number) {
  return 1 + 0.25 * ramp01(w, 1, 15) + 1.0 * ramp01(w, 15, 40);
}

export function enemyDefFor(kind: EnemyKind, w: number): EnemyDef {
  const hpS = hpScale(w);
  const dmgS = dmgScale(w);
  switch (kind) {
    case "drone": {
      const r = 10;
      return { r, hp: 12 * hpS, speed: 150 + w * 4, contact: 10 * dmgS, score: 10, bolt: 0, mass: massForRadius(r) };
    }
    case "hunter": {
      const r = 9;
      return { r: 9, hp: 30 * hpS, speed: 285, contact: 25, score: 40, bolt: 0, mass: massForRadius(r) };
    }
    case "fighter": {
      const r = 13;
      return {
        r: 13,
        hp: 34 * hpS,
        speed: (195 + w * 3) * 0.8,
        contact: 9.1 * dmgS,
        score: 25,
        bolt: 4.55 * dmgS,
        mass: massForRadius(r),
      };
    }
    case "cruiser": {
      const r = 26;
      return { r: 26, hp: 155 * hpS, speed: 50 + w * 1.5, contact: 22 * dmgS, score: 60, bolt: 15 * dmgS, mass: massForRadius(r) };
    }
    case "carrier": {
      const r = 41;
      return { r: 41, hp: 350 * hpS, speed: 32 + w * 0.8, contact: 26 * dmgS, score: 100, bolt: 0, mass: massForRadius(r) };
    }
  }
}

/* ------------------------------- waves ------------------------------- */

/** 30 ships on wave 1, ~100 by wave 30 (hard cap). */
export function waveTotalFor(w: number) {
  return Math.min(100, Math.round(30 + (w - 1) * 2.4));
}

export function zoneRadiusFor(w: number) {
  return clamp(380 + (w - 1) * 10, 380, 650);
}

/** Weighted class mix; each class ramps in over its own window. */
export function kindWeights(w: number): Array<[EnemyKind, number]> {
  return [
    ["drone", 1],
    ["hunter", 0.15 * ramp01(w, 3, 18)],
    ["fighter", 0.55 * ramp01(w, 1, 12)],
    ["cruiser", 0.45 * ramp01(w, 4, 15)],
    ["carrier", 0.25 * ramp01(w, 8, 16)],
  ];
}

export function pickKindFor(w: number): EnemyKind {
  const weights = kindWeights(w);
  let total = 0;
  for (const [, wt] of weights) total += wt;
  let roll = Math.random() * total;
  for (const [kind, wt] of weights) {
    roll -= wt;
    if (roll <= 0) return kind;
  }
  return "drone";
}

/* --------------------------- drop chances --------------------------- */

/** Chance that destroying this enemy drops any bonus at all. */
/* ------------------------------ death animation ------------------------------ */

export const DEATH_ANIMATION_DURATION = 1.2; // seconds
export const DEATH_EXPLOSION_PARTICLES = 60;
export const DEATH_EXPLOSION_MIN_SPEED = 50;
export const DEATH_EXPLOSION_MAX_SPEED = 300; // 50 + 250
export const DEATH_EXPLOSION_MIN_LIFE = 0.3;
export const DEATH_EXPLOSION_MAX_LIFE = 1.1; // 0.3 + 0.8

/* ------------------------------ zone constants ------------------------------ */

export const ZONE_INITIAL_RADIUS = 17.25;
export const ZONE_EDGE_MARGIN = 40;
export const ZONE_EDGE_WARNING_DELAY = 0.3; // seconds before warning
export const ZONE_EDGE_DAMAGE_INTERVAL = 0.5; // seconds between damage ticks
export const ZONE_EDGE_DAMAGE_AMOUNT = 10; // damage per tick
export const ZONE_EDGE_SHAKE_STRENGTH = 4; // shake intensity
export const ZONE_EARLY_DAMAGE_THRESHOLD = 0.3; // don't damage before zone reaches 30% target

export const ZONE_CLEAR_BANNER_DELAY = 1.5; // seconds before showing wave clear banner
export const ZONE_CLEAR_EXPAND_START = 2.0; // seconds before starting zone expansion
export const ZONE_CLEAR_NEXT_WAVE = 3.0; // seconds before next wave
export const ZONE_CLEAR_EXPAND_DURATION = 1.0; // seconds for zone to expand during clear
export const ZONE_CLEAR_EXPAND_MULTIPLIER = 1.5; // zone expands to 1.5x target

export const ZONE_ASTEROID_PUSH_FORCE = 15; // force multiplier for pushing asteroids out
export const ZONE_ENEMY_PUSH_FORCE_COEFF = 8; // coefficient for enemy push force
export const ZONE_ENEMY_PUSH_FORCE_MAX = 200; // max push force for enemies

export const ZONE_GUN_RANGE = 420; // range for auto-fire guns

/* ------------------------------ menu animation ------------------------------ */

export const MENU_ASTEROID_COUNT = 30;
export const MENU_RIFT_OPEN_TIME = 0.6;
export const MENU_RIFT_SPAWN_DELAY = 0.35;
export const MENU_RIFT_SPAWN_TIME = 0.28;
export const MENU_RIFT_CLOSE_TIME = 0.5;
export const MENU_RIFT_MIN_INTERVAL = 8;
export const MENU_RIFT_MAX_INTERVAL = 14;
export const MENU_ENEMY_MIN_SPEED = 80;
export const MENU_ENEMY_MAX_SPEED = 60; // additional speed range
export const MENU_EDGE_MARGIN = 150; // in DPR-scaled pixels

/* ------------------------------ camera ------------------------------ */

export const CAMERA_SMOOTHING = 8; // camera follow smoothing factor

/* ------------------------------ fps ------------------------------ */

export const FPS_SMOOTHING_FACTOR = 0.08; // EMA smoothing for FPS

/* ------------------------------ drop chances ------------------------------ */

export function dropChanceFor(kind: EnemyKind) {
  switch (kind) {
    case "drone":
      return 0.07;
    case "hunter":
      return 0.25;
    case "fighter":
      return 0.1;
    case "cruiser":
      return 0.25;
    case "carrier":
      return 0.7;
  }
}
