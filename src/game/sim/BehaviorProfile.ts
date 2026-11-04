/**
 * BehaviorProfile — извлечение поведенческого профиля из сэмплов.
 *
 * Профиль описывает игрока, а не траекторию: время реакции, ошибку прицела,
 * предпочитаемую дистанцию, долю огня, поведение у края зоны и частоту
 * способности. Одни признаки — распределения (есть много наблюдений),
 * другие — ставки (одно число на всю запись).
 *
 * Профиль хранит **измеренные** значения. Shrinkage к дефолтам применяется
 * только при калибровке, иначе сравнение записи с агентом было бы нечестным.
 */

import { FIXED_DT } from "../core/SimulationClock";
import type { BehaviorSample } from "../core/SessionRecord";

/** Уровень доверия к признаку. */
export type Confidence = "low" | "medium" | "high";

/** Признак-распределение: перцентили по независимым наблюдениям. */
export interface DistributionFeature {
  p25: number;
  p50: number;
  p75: number;
  p90: number;
  n: number;
  confidence: Confidence;
}

/** Признак-ставка: одно значение и число наблюдений. */
export interface RateFeature {
  value: number;
  n: number;
  confidence: Confidence;
}

/** Поведенческий профиль записи или агента. */
export interface BehaviorProfile {
  sourceSessionId: string;
  reactionTime: DistributionFeature; // секунды
  aimError: DistributionFeature; // радианы
  preferredRange: DistributionFeature; // px
  fireRatio: RateFeature; // 0..1
  zoneEdgeRatio: RateFeature; // 0..1
  abilityPerMinute: RateFeature;
  moveIntensity: RateFeature; // справочно
  manualAim: boolean;
  warnings: string[];
}

/** Порог угрозы для детектора реакции: время до сближения. */
export const REACTION_TTC = 0.6;
/** Порог угрозы для детектора реакции: промах. */
export const REACTION_MISS = 80;
/** Максимальная засчитываемая реакция, секунды. */
export const REACTION_MAX = 1.0;

/** Порог изменения курса: 45°. */
const REACTION_DOT = Math.cos(Math.PI / 4);

function confidenceFor(n: number, medium: number, high: number): Confidence {
  if (n >= high) return "high";
  if (n >= medium) return "medium";
  return "low";
}

const EMPTY_DISTRIBUTION: DistributionFeature = {
  p25: 0,
  p50: 0,
  p75: 0,
  p90: 0,
  n: 0,
  confidence: "low",
};

const EMPTY_RATE: RateFeature = { value: 0, n: 0, confidence: "low" };

/** Перцентиль по уже отсортированному массиву (метод ближайшего ранга). */
function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(
    sorted.length - 1,
    Math.max(0, Math.round((p / 100) * (sorted.length - 1))),
  );
  return sorted[index];
}

function distribution(values: number[], medium: number, high: number): DistributionFeature {
  if (values.length === 0) return { ...EMPTY_DISTRIBUTION };
  const sorted = [...values].sort((a, b) => a - b);
  return {
    p25: percentile(sorted, 25),
    p50: percentile(sorted, 50),
    p75: percentile(sorted, 75),
    p90: percentile(sorted, 90),
    n: sorted.length,
    confidence: confidenceFor(sorted.length, medium, high),
  };
}

/** Нормализовать угол в [-π, π]. */
function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}

/**
 * Извлечь профиль из сэмплов.
 *
 * @param samples — сэмплы по тикам (обычно 60 Гц).
 * @param sourceSessionId — id записи для отчёта.
 */
export function extractProfile(
  samples: readonly BehaviorSample[],
  sourceSessionId: string,
): BehaviorProfile {
  const warnings: string[] = [];
  if (samples.length === 0) {
    warnings.push("нет сэмплов: профиль заполнен дефолтами с confidence=low");
    return {
      sourceSessionId,
      reactionTime: { ...EMPTY_DISTRIBUTION },
      aimError: { ...EMPTY_DISTRIBUTION },
      preferredRange: { ...EMPTY_DISTRIBUTION },
      fireRatio: { ...EMPTY_RATE },
      zoneEdgeRatio: { ...EMPTY_RATE },
      abilityPerMinute: { ...EMPTY_RATE },
      moveIntensity: { ...EMPTY_RATE },
      manualAim: false,
      warnings,
    };
  }

  const reactionTimes: number[] = [];
  const aimErrors: number[] = [];
  const ranges: number[] = [];

  let aliveTicks = 0;
  let firingTicks = 0;
  let zoneTicks = 0;
  let zoneEdgeTicks = 0;
  let abilityEvents = 0;
  let moveSum = 0;
  let manualAim = false;

  // Детектор реакции: событие начинается при появлении близкой угрозы,
  // заканчивается первым заметным поворотом оси. После события нужен
  // «чистый» промежуток, иначе длинная угроза считалась бы много раз.
  let reactionOnset: number | null = null;
  let reactionAxis: { x: number; y: number } | null = null;
  let threatWasImminent = false;

  for (const sample of samples) {
    if (sample.player.hp <= 0) {
      threatWasImminent = false;
      reactionOnset = null;
      continue;
    }
    aliveTicks++;

    if (sample.firing) firingTicks++;
    if (sample.ability) abilityEvents++;

    const move = Math.hypot(sample.axis.x, sample.axis.y);
    moveSum += Math.min(1, move);

    if (sample.zone && sample.zone.active && sample.zone.radius > 0) {
      zoneTicks++;
      if (sample.zone.dist > sample.zone.radius * 0.9) zoneEdgeTicks++;
    }

    if (sample.aimAngle !== null) manualAim = true;

    if (
      sample.firing &&
      sample.aimAngle !== null &&
      sample.nearestEnemy &&
      sample.nearestEnemy.dist > 1e-6
    ) {
      const targetAngle = Math.atan2(sample.nearestEnemy.dy, sample.nearestEnemy.dx);
      aimErrors.push(Math.abs(wrapAngle(sample.aimAngle - targetAngle)));
      ranges.push(sample.nearestEnemy.dist);
    }

    const imminent =
      sample.threat !== null &&
      sample.threat.ttc < REACTION_TTC &&
      sample.threat.missDistance < REACTION_MISS;

    if (imminent && !threatWasImminent) {
      reactionOnset = sample.tick;
      const len = Math.hypot(sample.axis.x, sample.axis.y);
      reactionAxis = len < 1e-6 ? null : { x: sample.axis.x / len, y: sample.axis.y / len };
    }

    if (imminent && reactionOnset !== null && reactionAxis) {
      const len = Math.hypot(sample.axis.x, sample.axis.y);
      if (len > 1e-6) {
        const dot =
          (sample.axis.x / len) * reactionAxis.x +
          (sample.axis.y / len) * reactionAxis.y;
        const elapsed = (sample.tick - reactionOnset) * FIXED_DT;
        if (dot < REACTION_DOT && elapsed <= REACTION_MAX) {
          reactionTimes.push(elapsed);
          reactionOnset = null;
          reactionAxis = null;
        } else if (elapsed > REACTION_MAX) {
          reactionOnset = null;
          reactionAxis = null;
        }
      }
    }

    threatWasImminent = imminent;
  }

  if (!manualAim) {
    warnings.push(
      "ручной прицел ни разу не записан: aimError/предпочитаемая дистанция недостоверны (автоприцел не подставлялся)",
    );
  }
  if (samples.length !== aliveTicks) {
    warnings.push(`часть сэмплов после смерти исключена: ${samples.length - aliveTicks}`);
  }

  const reactionTime = distribution(reactionTimes, 10, 30);
  const aimError = distribution(aimErrors, 90, 300);
  const preferredRange = distribution(ranges, 90, 300);

  const fireRatio: RateFeature = {
    value: aliveTicks > 0 ? firingTicks / aliveTicks : 0,
    n: aliveTicks,
    confidence: confidenceFor(aliveTicks, 90, 300),
  };
  const zoneEdgeRatio: RateFeature = {
    value: zoneTicks > 0 ? zoneEdgeTicks / zoneTicks : 0,
    n: zoneTicks,
    confidence: confidenceFor(zoneTicks, 90, 300),
  };
  const aliveSeconds = aliveTicks * FIXED_DT;
  const abilityPerMinute: RateFeature = {
    value: aliveSeconds > 0 ? (abilityEvents / aliveSeconds) * 60 : 0,
    n: abilityEvents,
    // Способность — редкое событие: за 120 с её может быть 4–10 раз.
    confidence: confidenceFor(abilityEvents, 4, 10),
  };
  const moveIntensity: RateFeature = {
    value: aliveTicks > 0 ? Math.min(1, moveSum / aliveTicks) : 0,
    n: aliveTicks,
    confidence: confidenceFor(aliveTicks, 90, 300),
  };

  for (const [name, feature] of [
    ["reactionTime", reactionTime],
    ["aimError", aimError],
    ["preferredRange", preferredRange],
    ["fireRatio", fireRatio],
    ["zoneEdgeRatio", zoneEdgeRatio],
    ["abilityPerMinute", abilityPerMinute],
  ] as const) {
    if (feature.n === 0) warnings.push(`${name}: нет наблюдений, значение 0`);
  }

  return {
    sourceSessionId,
    reactionTime,
    aimError,
    preferredRange,
    fireRatio,
    zoneEdgeRatio,
    abilityPerMinute,
    moveIntensity,
    manualAim,
    warnings,
  };
}
