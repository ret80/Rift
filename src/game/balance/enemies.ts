/* ============================================================
   Enemy definitions — kinds, base speeds, per-weapon tuning.
   ============================================================ */

import {
  DRONE_BASE_SPEED,
  HUNTER_SPEED,
  FIGHTER_BASE_SPEED,
  CRUISER_BASE_SPEED,
  CARRIER_BASE_SPEED,
} from "./player";

/* ------------------------------- enemies ------------------------------- */

export enum EnemyKind {
  Drone = "drone",
  Hunter = "hunter",
  Fighter = "fighter",
  Cruiser = "cruiser",
  Carrier = "carrier",
}

/* Cruiser tuning */
export const CRUISER_FIRE_RANGE = 760; // range at which cruiser starts shooting (2× base)
export const CRUISER_BULLET_SPEED = 364; // 260 × 1.4 — 40% faster heavy bolts

/**
 * EnemyDef — static base stats for each enemy kind.
 * Dynamic stats (HP, contact dmg, bolt) are computed at runtime
 * using wave-dependent scaling from waves.ts.
 */
export interface EnemyDef {
  r: number;       // visual radius
  hp: number;      // wave-scaled HP
  speed: number;   // wave-scaled speed
  contact: number; // wave-scaled contact damage
  score: number;
  bolt: number;    // wave-scaled bolt damage (0 if no weapon)
  mass: number;
}

/**
 * Base definition — provides the template for wave-scaled values.
 * HP, contact, and bolt are scaled via hpScale()/dmgScale().
 */
export interface EnemyBaseDef {
  r: number;
  hpBase: number;
  speed: number;
  contactBase: number;
  score: number;
  boltBase: number;
  mass: number;
}

/**
 * Base templates for each enemy kind.
 * These are NOT used directly — enemyDefFor() scales them per wave.
 */
export const ENEMY_BASES: Record<EnemyKind, EnemyBaseDef> = {
  [EnemyKind.Drone]: {
    r: 10, hpBase: 12, speed: DRONE_BASE_SPEED,
    contactBase: 10, score: 10, boltBase: 0, mass: 0,
  },
  [EnemyKind.Hunter]: {
    r: 9, hpBase: 30, speed: HUNTER_SPEED,
    contactBase: 25, score: 40, boltBase: 0, mass: 0,
  },
  [EnemyKind.Fighter]: {
    r: 13, hpBase: 34, speed: FIGHTER_BASE_SPEED,
    contactBase: 9.1, score: 25, boltBase: 4.55, mass: 0,
  },
  [EnemyKind.Cruiser]: {
    r: 26, hpBase: 155, speed: CRUISER_BASE_SPEED,
    contactBase: 22, score: 60, boltBase: 15, mass: 0,
  },
  [EnemyKind.Carrier]: {
    r: 41, hpBase: 350, speed: CARRIER_BASE_SPEED,
    contactBase: 26, score: 100, boltBase: 0, mass: 0,
  },
};

/* ------------------------------ mass ------------------------------ */

export function massForRadius(r: number): number {
  return Math.max(1, Math.PI * r * r * 0.02);
}
