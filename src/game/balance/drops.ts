/* ============================================================
   Drop chances — per-enemy-kind pickup probability.
   ============================================================ */

import { EnemyKind } from "./enemies";
import { bossCountForWave, kindWeights, waveTotalFor } from "./waves";

/* ------------------------------- pickup kinds ------------------------------- */

export type PickupKind =
  | "heal"
  | "rate20"
  | "rate40"
  | "rate60"
  | "gun"
  | "drone"
  | "shield"
  | "rate"
  | "missile"
  | "laser"
  | "quantum_swap";

/** All possible pickup kinds in display order */
export const ALL_PICKUP_KINDS: PickupKind[] = [
  "heal",
  "rate20",
  "rate40",
  "rate60",
  "gun",
  "drone",
  "shield",
  "rate",
  "missile",
  "laser",
  "quantum_swap",
];

/* ------------------------------- drop chances ------------------------------- */

/** Chance that destroying this enemy drops any bonus at all. */
export function dropChanceFor(kind: EnemyKind): number {
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
    case "miner":
      return 0.3;
    case "boss":
      return 0.9;
    case "mine":
      return 0;
    /* c8 ignore next 2 */
    default:
      return 0;
  }
}

/* ------------------------------- asteroid kinds ------------------------------- */

/* ------------------------------- economy ------------------------------- */

/** Бонус за зачистку волны: база и прибавка за номер волны. */
export const WAVE_CLEAR_PARTS_BASE = 15;
export const WAVE_CLEAR_PARTS_PER_WAVE = 6;
/**
 * Множитель бонуса зачистки, если волна закрыта без единого полученного удара.
 *
 * Награда должна зависеть от того, как игрок сыграл, а не от того, сколько
 * времени он провёл в бою: раньше за простой платила «страховка за выживание»,
 * теперь — только чистая работа.
 */
export const WAVE_CLEAN_CLEAR_MULT = 1.5;
/** Сколько касаний (graze) дают одну деталь. */
export const GRAZE_PARTS_PER_COIN = 5;
/** Потолок деталей за graze на одной волне. */
export const GRAZE_PARTS_WAVE_CAP = 20;
/** Прибавка к деталям за убийство за каждую ступень комбо. */
export const KILL_PARTS_COMBO_STEP = 0.15;
/** Потолок множителя деталей за комбо. */
export const KILL_PARTS_COMBO_CAP = 2;

/**
 * Множитель деталей за убийство по текущему комбо.
 *
 * Комбо считается от 1.0 (без серии) до 10.0: за серию платим до ×2, но не
 * больше, иначе один удачный рой перекрывает всю волну.
 */
export function killPartsMultiplier(comboMult: number): number {
  const steps = Math.max(0, comboMult - 1);
  return Math.min(KILL_PARTS_COMBO_CAP, 1 + steps * KILL_PARTS_COMBO_STEP);
}

/** Детали за зачистку волны. */
export function waveClearParts(wave: number): number {
  return WAVE_CLEAR_PARTS_BASE + WAVE_CLEAR_PARTS_PER_WAVE * Math.max(1, Math.floor(wave));
}

/** Детали за убийство врага (до множителей комбо и меты). */
const KILL_PARTS: Record<EnemyKind, number> = {
  [EnemyKind.Drone]: 3,
  [EnemyKind.Hunter]: 6,
  [EnemyKind.Fighter]: 7,
  [EnemyKind.Cruiser]: 16,
  [EnemyKind.Carrier]: 32,
  [EnemyKind.Boss]: 100,
  [EnemyKind.Mine]: 0,
  [EnemyKind.Miner]: 12,
  [EnemyKind.Needle]: 1,
  [EnemyKind.Shieldbearer]: 1,
  [EnemyKind.Harpooner]: 1,
  [EnemyKind.Splitter]: 1,
  [EnemyKind.Jammer]: 1,
  [EnemyKind.Vortex]: 1,
  [EnemyKind.HiveMother]: 1,
  [EnemyKind.Tractor]: 1,
};

/** Детали за убийство врага данного вида. */
export function killPartsFor(kind: EnemyKind): number {
  return KILL_PARTS[kind];
}

/** Средний множитель награды за волну: чистая зачистка и якоря — не всегда. */
const ESTIMATE_CLEAR_MULT = 1.15;
/** Доля потолка graze, которую игрок обычно выбирает. */
const ESTIMATE_GRAZE_SHARE = 0.5;

/**
 * Оценка деталей, которые игрок заработал бы, пройдя волны 1…`wave`.
 *
 * Считается по реальной экономике: убийства по весам состава волны,
 * бонус зачистки со средней надбавкой, босс и типичная доля graze.
 * Комбо и множители меты не учитываются — это оценка «снизу», чтобы
 * тестовый корабль соответствовал реальному забегу.
 *
 * @param wave волна, до которой дошёл игрок
 */
export function estimateRunParts(wave: number): number {
  const target = Math.max(1, Math.floor(wave));
  let total = 0;
  for (let w = 1; w <= target; w++) {
    const weights = kindWeights(w);
    let weightSum = 0;
    let partsSum = 0;
    for (const [kind, weight] of weights) {
      weightSum += weight;
      partsSum += weight * killPartsFor(kind);
    }
    const perKill = weightSum > 0 ? partsSum / weightSum : 0;
    const regular = waveTotalFor(w) - bossCountForWave(w);
    total += regular * perKill;
    total += bossCountForWave(w) * killPartsFor(EnemyKind.Boss);
    total += waveClearParts(w) * ESTIMATE_CLEAR_MULT;
    total += GRAZE_PARTS_WAVE_CAP * ESTIMATE_GRAZE_SHARE;
  }
  return Math.round(total / 50) * 50;
}

export type AsteroidKind = "small" | "medium" | "large";
