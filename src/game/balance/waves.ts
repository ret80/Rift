/* ============================================================
   Wave scaling — difficulty curves, total counts, zone radius,
   class weight functions, and pick logic.
   ============================================================ */

import type { RandomSource } from "../math";
import { ramp01 } from "../math";
import { BOSS_WAVE_INTERVAL, ENEMY_BASES, EnemyKind, massForRadius } from "./enemies";
import { DEFAULT_PARAMS, type GameParams } from "./params/GameParams";
import { arenaRadius, enemySpeed } from "./params/derived";

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
export function enemyDefFor(
  kind: EnemyKind,
  w: number,
  params: GameParams = DEFAULT_PARAMS,
): import("./enemies").EnemyDef {
  // «Бесконечный скейл»: после 40-й волны обе кривые перестают плато и
  // продолжают расти — иначе поздний забег упирается в потолок сложности.
  const endless =
    params.ascension.endlessScaling && w > ENDLESS_SCALING_WAVE ? w - ENDLESS_SCALING_WAVE : 0;
  const hpS = hpScale(w) * (1 + ENDLESS_HP_PER_WAVE * endless);
  const dmgS = dmgScale(w) * (1 + ENDLESS_DMG_PER_WAVE * endless);
  const base = ENEMY_BASES[kind];

  // Корпус и скорость берутся из профиля параметров: правка одного числа
  // (например `player.maxSpeed`) сразу меняет и связанные значения.
  const hp = params.enemy.hpBase[kind] * hpS;
  const speed = enemySpeed(params, kind);
  // Прирост скорости по волнам масштабируется вместе с базовой скоростью:
  // отладочный сдвиг иначе «размывался» бы постоянной добавкой за волну.
  const growthScale = params.player.maxSpeed / DEFAULT_PARAMS.player.maxSpeed;

  switch (kind) {
    case EnemyKind.Drone: {
      return {
        r: base.r,
        hp,
        speed: speed + w * 4 * growthScale,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Hunter: {
      return {
        r: base.r,
        hp,
        // Таран должен оставаться быстрее игрока и на поздних волнах,
        // когда скорость поднята апгрейдами (до +40%).
        speed: speed + w * 2 * growthScale,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Fighter: {
      return {
        r: base.r,
        hp,
        speed: (speed + w * 3 * growthScale) * 0.8,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase * dmgS,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Cruiser: {
      return {
        r: base.r,
        hp,
        speed: speed + w * 1.5 * growthScale,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase * dmgS,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Carrier: {
      return {
        r: base.r,
        hp,
        speed: speed + w * 0.8 * growthScale,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Miner: {
      return {
        r: base.r,
        hp,
        // Медленнее игрока: он угрожает пространством, а не погоней.
        speed: speed + w * 1.2 * growthScale,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Boss: {
      return {
        r: base.r,
        hp,
        // Босс медленнее игрока: его давление — залпы, а не погоня.
        speed: speed + w * 0.5 * growthScale,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase * dmgS,
        mass: massForRadius(base.r),
      };
    }
    case EnemyKind.Mine: {
      return {
        r: base.r,
        hp,
        speed: 0,
        contact: base.contactBase * dmgS,
        score: 0,
        bolt: 0,
        mass: massForRadius(base.r),
      };
    }
    default: {
      return {
        r: base.r,
        hp,
        speed,
        contact: base.contactBase * dmgS,
        score: base.score,
        bolt: base.boltBase * dmgS,
        mass: massForRadius(base.r),
      };
    }
  }
}

/* ------------------------------- waves ------------------------------- */

/** С какой волны «бесконечный скейл» снова наращивает давление. */
export const ENDLESS_SCALING_WAVE = 40;
/** Прирост корпуса врагов за волну сверх 40-й (доля), только с модификатором. */
export const ENDLESS_HP_PER_WAVE = 0.06;
/** Прирост урона врагов за волну сверх 40-й (доля), только с модификатором. */
export const ENDLESS_DMG_PER_WAVE = 0.04;

/**
 * Врагов на волне: 24 на первой, рост медленнее прежнего, потолок 64
 * плюс отдельный босс на каждой 10-й волне.
 *
 * Прежние 100 врагов заполняли арену и не оставляли места для манёвра;
 * давление теперь идёт от состава (минёр, тяжёлые цели), а не от массы.
 */
export function waveTotalFor(w: number, bossInterval: number = BOSS_WAVE_INTERVAL): number {
  return Math.min(64, Math.round(24 + (w - 1) * 1.35)) + bossCountForWave(w, bossInterval);
}

/**
 * Волна босса: каждая 10-я, начиная с 10-й.
 * Модификатор «боссы чаще» меняет интервал до 5 волн.
 */
export function isBossWave(w: number, bossInterval: number = BOSS_WAVE_INTERVAL): boolean {
  return w > 0 && w % bossInterval === 0;
}

/** Добавка к обычному составу волны: один босс. */
export function bossCountForWave(w: number, bossInterval: number = BOSS_WAVE_INTERVAL): number {
  return isBossWave(w, bossInterval) ? 1 : 0;
}

export function zoneRadiusFor(w: number, params: GameParams = DEFAULT_PARAMS): number {
  // Базовые 380…715 увеличиваются общим масштабом арены. Верхний предел
  // поднят на 10% от прежних 650, чтобы поздние волны не упирались в потолок.
  return arenaRadius(params, w);
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
    // Минёр — угроза пространству: появляется с 9-й, ~8 %
    [EnemyKind.Miner, 0.08 * ramp01(w, 9, 18)],
    // Новые архетипы Mechanic 3: каждый входит своим окном, чтобы
    // игрок успевал выучить угрозу до следующей.
    [EnemyKind.Splitter, 0.15 * ramp01(w, 5, 14)],
    [EnemyKind.Needle, 0.1 * ramp01(w, 6, 16)],
    [EnemyKind.Harpooner, 0.12 * ramp01(w, 7, 17)],
    [EnemyKind.Shieldbearer, 0.1 * ramp01(w, 8, 18)],
    [EnemyKind.Jammer, 0.06 * ramp01(w, 11, 22)],
    [EnemyKind.Vortex, 0.07 * ramp01(w, 12, 24)],
    [EnemyKind.HiveMother, 0.02 * ramp01(w, 18, 30)],
    // Тягач — угроза от астероида: входит с 10-й волны, реже прочих.
    [EnemyKind.Tractor, 0.14 * ramp01(w, 10, 22)],
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
