/**
 * ProfileDistance — насколько профиль агента близок к профилю записи.
 *
 * Сравниваются распределения поведения, а не траектории: запись ломается
 * при смене баланса, профиль — нет. Расстояние нормировано в 0..1:
 *   • распределения — по `p50` (70%) и `p90` (30%);
 *   • ставки — по единственному `value`.
 *
 * Веса и шкалы зафиксированы до эксперимента. Менять их «под результат»
 * нельзя: тогда метрика перестаёт что-либо доказывать.
 */

import type {
  BehaviorProfile,
  DistributionFeature,
  RateFeature,
} from "./BehaviorProfile";

export interface ProfileDistanceWeights {
  reactionTime: { weight: number; scale: number };
  aimError: { weight: number; scale: number };
  fireRatio: { weight: number; scale: number };
  preferredRange: { weight: number; scale: number };
  zoneEdgeRatio: { weight: number; scale: number };
  abilityPerMinute: { weight: number; scale: number };
}

/** Веса и шкалы из плана (сумма весов = 1). */
export const PROFILE_DISTANCE_WEIGHTS: ProfileDistanceWeights = {
  reactionTime: { weight: 0.2, scale: 0.2 },
  aimError: { weight: 0.2, scale: 0.15 },
  fireRatio: { weight: 0.15, scale: 1 },
  preferredRange: { weight: 0.15, scale: 200 },
  zoneEdgeRatio: { weight: 0.15, scale: 1 },
  abilityPerMinute: { weight: 0.15, scale: 4 },
};

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(1, value));
}

function distributionDistance(
  a: DistributionFeature,
  b: DistributionFeature,
  scale: number,
): number {
  if (scale <= 0) return 0;
  const d50 = clamp01(Math.abs(a.p50 - b.p50) / scale);
  const d90 = clamp01(Math.abs(a.p90 - b.p90) / scale);
  return 0.7 * d50 + 0.3 * d90;
}

function rateDistance(a: RateFeature, b: RateFeature, scale: number): number {
  if (scale <= 0) return 0;
  return clamp01(Math.abs(a.value - b.value) / scale);
}

/** Расстояние между профилями в 0..1 (0 — идентичны). */
export function profileDistance(a: BehaviorProfile, b: BehaviorProfile): number {
  const w = PROFILE_DISTANCE_WEIGHTS;
  const parts = [
    {
      weight: w.reactionTime.weight,
      d: distributionDistance(a.reactionTime, b.reactionTime, w.reactionTime.scale),
    },
    {
      weight: w.aimError.weight,
      d: distributionDistance(a.aimError, b.aimError, w.aimError.scale),
    },
    {
      weight: w.fireRatio.weight,
      d: rateDistance(a.fireRatio, b.fireRatio, w.fireRatio.scale),
    },
    {
      weight: w.preferredRange.weight,
      d: distributionDistance(
        a.preferredRange,
        b.preferredRange,
        w.preferredRange.scale,
      ),
    },
    {
      weight: w.zoneEdgeRatio.weight,
      d: rateDistance(a.zoneEdgeRatio, b.zoneEdgeRatio, w.zoneEdgeRatio.scale),
    },
    {
      weight: w.abilityPerMinute.weight,
      d: rateDistance(
        a.abilityPerMinute,
        b.abilityPerMinute,
        w.abilityPerMinute.scale,
      ),
    },
  ];
  const totalWeight = parts.reduce((sum, part) => sum + part.weight, 0);
  if (totalWeight <= 0) return 0;
  return clamp01(
    parts.reduce((sum, part) => sum + part.weight * part.d, 0) / totalWeight,
  );
}
