/* ============================================================
   Wave scaling — difficulty curves, total counts, zone radius,
   class weight functions, and pick logic.
   ============================================================ */

import type { RandomSource } from "../math";
import { clamp, ramp01 } from "../math";
import { ENEMY_BASES, EnemyKind, massForRadius } from "./enemies";

/** Состав тестовой волны: вид → количество. */
export type WaveCompositionOverride = Partial<Record<EnemyKind, number>>;

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
  return 1 + 0.5 * ramp01(w, 1, 15) + 1.0 * ramp01(w, 15, 40);
}

/**
 * Damage scaling: 1x at wave 1, 1.5x at wave 10, 1.95x at wave 20, 2.95x at wave 40.
 * Design intent — errors become increasingly critical in late game.
 */
export function dmgScale(w: number): number {
  return 1 + 0.5 * ramp01(w, 1, 10) + 0.45 * ramp01(w, 10, 20) + 1.0 * ramp01(w, 20, 40);
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
        // Таран должен оставаться быстрее игрока и на поздних волнах,
        // когда скорость поднята апгрейдами (до +40%).
        speed: base.speed + w * 2,
        contact: base.contactBase * dmgS,
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

/** 30 ships on wave 1, ~91 by wave 30 (hard cap at 100). */
export function waveTotalFor(w: number): number {
  return Math.min(100, Math.round(30 + (w - 1) * 2.1));
}

export function zoneRadiusFor(w: number): number {
  return clamp(380 + (w - 1) * 10, 380, 650);
}

/**
 * Weighted class mix; each class ramps in over its own window.
 * Returns array of [kind, weight] tuples for probabilistic selection.
 *
 * После дифференциации ролей:
 *   Дрон — рой (массовый, основа волны)
 *   Хантер — редкая угроза (камикадзе)
 *   Файтер — «перчик» (дуэлянт, средняя частота)
 *   Крейсер — событие волны (тяжеловес, таран)
 *   Носитель — редкое событие (матка, управляет полем)
 */
export function kindWeights(w: number): Array<[EnemyKind, number]> {
  return [
    // Дрон — основа роя: высокая доля всегда
    [EnemyKind.Drone, 1.0],
    // Хантер — редкий камикадзе: 3–16 волна, ~5%
    [EnemyKind.Hunter, w < 3 ? 0 : 0.05 + 0.05 * ramp01(w, 3, 16)],
    // Файтер — «перчик» (дуэлянт): появляется с 5-й, пик к 15-й
    [EnemyKind.Fighter, 0.45 * ramp01(w, 5, 15)],
    // Крейсер — тяжёловес (событие волны): 8–20 волна
    [EnemyKind.Cruiser, 0.18 * ramp01(w, 8, 20)],
    // Носитель — матка (редкое событие): 12–25 волна
    [EnemyKind.Carrier, 0.05 * ramp01(w, 12, 25)],
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

export function pickKindFor(w: number, random: RandomSource): EnemyKind {
  const weights = kindWeights(w);
  let total = 0;
  for (const [, wt] of weights) total += wt;
  let roll = random() * total;
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
  enabledEnemies: EnemyKind[] | null,
  random: RandomSource
): EnemyKind {
  const weights = kindWeightsForEnabled(w, enabledEnemies);
  let total = 0;
  for (const [, wt] of weights) total += wt;
  if (total <= 0) return EnemyKind.Drone;
  let roll = random() * total;
  for (const [kind, wt] of weights) {
    roll -= wt;
    if (roll <= 0) return kind;
  }
  return enabledEnemies?.[0] ?? EnemyKind.Drone;
}
