/* ============================================================
   Wave scaling — difficulty curves, total counts, zone radius,
   class weight functions, and pick logic.
   ============================================================ */

import { clamp, ramp01 } from "../math";
import { ENEMY_BASES, EnemyKind, massForRadius } from "./enemies";

/* ------------------------------ StarLayer type ------------------------------ */

export interface StarLayer {
  f: number; // parallax factor (0 = pinned to camera, 1 = world space)
  chunk: number; // chunk size in layer-space
  count: number; // stars per chunk
  sMin: number;
  sMax: number;
  aMin: number;
  aMax: number;
}

/* ------------------------------ wave boundaries ------------------------------ */

/** Wave boundaries for scaling segments */
export const WAVE_BOUNDARIES = [1, 10, 15, 20, 40] as const;

/** HP scaling segments: [start, end] pairs */
export const HP_SCALE_SEGMENTS = [[1, 15], [15, 40]] as const;

/** Damage scaling segments: [start, end] pairs */
export const DMG_SCALE_SEGMENTS = [[1, 10], [10, 20], [20, 40]] as const;

/* -------------- Two-segment difficulty curves -------------- */

/**
 * HP scaling: gentle waves 1–15, steep from 15 to 40.
 * Design intent — late-game pressure from armor, not headcount.
 */
export function hpScale(w: number): number {
  return 1 + 0.5 * ramp01(w, 1, 15) + 3.0 * ramp01(w, 15, 40);
}

/**
 * Damage scaling: 1x at wave 1, 1.5x at wave 10, 2.5x at wave 20, 3.5x at wave 40.
 * Design intent — errors become increasingly critical in late game.
 */
export function dmgScale(w: number): number {
  return 1 + 0.5 * ramp01(w, 1, 10) + 1.0 * ramp01(w, 10, 20) + 1.0 * ramp01(w, 20, 40);
}

/**
 * Compute wave-scaled enemy definition from base template.
 */
export function enemyDefFor(kind: EnemyKind, w: number): import("./enemies").EnemyDef {
  const hpS = hpScale(w);
  const dmgS = dmgScale(w);
  const base = ENEMY_BASES[kind];

  switch (kind) {
    case EnemyKind.Drone: {
      return {
        r: base.r,
        hp: base.hpBase * hpS,
        speed: base.speed + w * 4,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Hunter: {
      return {
        r: base.r,
        hp: base.hpBase * hpS,
        speed: base.speed,
        contact: base.contactBase,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Fighter: {
      return {
        r: base.r,
        hp: base.hpBase * hpS,
        speed: (base.speed + w * 3) * 0.8,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase * dmgS,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Cruiser: {
      return {
        r: base.r,
        hp: base.hpBase * hpS,
        speed: base.speed + w * 1.5,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase * dmgS,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Carrier: {
      return {
        r: base.r,
        hp: base.hpBase * hpS,
        speed: base.speed + w * 0.8,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
  }
}

/* ------------------------------- waves ------------------------------- */

/** 30 ships on wave 1, ~100 by wave 30 (hard cap at 100). */
export function waveTotalFor(w: number): number {
  return Math.min(100, Math.round(30 + (w - 1) * 2.4));
}

export function zoneRadiusFor(w: number): number {
  return clamp(380 + (w - 1) * 10, 380, 650);
}

/**
 * Weighted class mix; each class ramps in over its own window.
 * Returns array of [kind, weight] tuples for probabilistic selection.
 */
export function kindWeights(w: number): Array<[EnemyKind, number]> {
  return [
    [EnemyKind.Drone, 1],
    [EnemyKind.Hunter, 0.15 * ramp01(w, 3, 18)],
    [EnemyKind.Fighter, 0.55 * ramp01(w, 1, 12)],
    [EnemyKind.Cruiser, 0.45 * ramp01(w, 4, 15)],
    [EnemyKind.Carrier, 0.25 * ramp01(w, 8, 16)],
  ];
}

/**
 * Weighted class mix with optional enemy filter.
 * Disabled enemies get zero weight.
 */
export function kindWeightsForEnabled(
  w: number,
  enabledEnemies: EnemyKind[] | null
): Array<[EnemyKind, number]> {
  const base = kindWeights(w);
  if (!enabledEnemies || enabledEnemies.length === 0) return base;
  return base.filter(([kind]) => enabledEnemies.includes(kind));
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
  return EnemyKind.Drone;
}

/**
 * Pick enemy kind respecting the enabled enemies filter.
 */
export function pickKindForEnabled(
  w: number,
  enabledEnemies: EnemyKind[] | null
): EnemyKind {
  const weights = kindWeightsForEnabled(w, enabledEnemies);
  let total = 0;
  for (const [, wt] of weights) total += wt;
  if (total <= 0) return EnemyKind.Drone;
  let roll = Math.random() * total;
  for (const [kind, wt] of weights) {
    roll -= wt;
    if (roll <= 0) return kind;
  }
  return enabledEnemies?.[0] ?? EnemyKind.Drone;
}
