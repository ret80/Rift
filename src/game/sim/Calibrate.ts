/**
 * Calibrate — детерминированное отображение профиля в параметры EvadeAgent.
 *
 * Формулы — эвристика, но они объяснимы и зафиксированы: каждый параметр
 * ссылается на конкретный признак профиля. При низком доверии значение
 * стягивается к дефолту (`k=10`), чтобы одна шумная запись не выдавала себя
 * за точную настройку.
 *
 * Калибровка не применяется автоматически: это инструмент решения.
 */

import type { BehaviorProfile, Confidence } from "./BehaviorProfile";

/** Параметры калиброванного агента (совместимы с EvadeAgentOptions). */
export interface CalibrationAgentParams {
  reactionTime: number;
  aimJitter: number;
  fireCone: number;
  fireRange: number;
  minRange: number;
  maxRange: number;
  zoneMargin: number;
  abilityChancePerTick: number;
}

/** Результат калибровки. */
export interface CalibrationResult {
  version: 1;
  sourceSessionId: string;
  profile: BehaviorProfile;
  agent: {
    kind: "evade";
    params: CalibrationAgentParams;
  };
  /** Какая связь «признак → параметр» использована. */
  rationale: Record<string, string>;
  /** Параметры, упёршиеся в границу диапазона. */
  clamped: Record<string, boolean>;
  warnings: string[];
}

/** Версия формул калибровки: меняется вместе с формулами. */
export const CALIBRATION_VERSION = 1;

/** Дефолты агента, к которым стягиваются ненадёжные признаки. */
export const CALIBRATION_DEFAULTS: CalibrationAgentParams = {
  reactionTime: 0.15,
  aimJitter: 0.02,
  fireCone: 0.28,
  fireRange: 640,
  minRange: 240,
  maxRange: 420,
  zoneMargin: 0.82,
  abilityChancePerTick: 0.02,
};

/** Сила shrinkage: эквивалент `k` фиктивных наблюдений дефолта. */
const SHRINK_K = 10;

function clamp(
  value: number,
  min: number,
  max: number,
): { value: number; clamped: boolean } {
  if (!Number.isFinite(value)) return { value: min, clamped: true };
  if (value < min) return { value: min, clamped: true };
  if (value > max) return { value: max, clamped: true };
  return { value, clamped: false };
}

/** Стянуть измеренное значение к дефолту при низком доверии. */
function shrink(
  measured: number,
  n: number,
  fallback: number,
  confidence: Confidence,
): number {
  if (confidence !== "low") return measured;
  return (n * measured + SHRINK_K * fallback) / (n + SHRINK_K);
}

/**
 * Калибровать EvadeAgent по профилю.
 *
 * @param profile — измеренный профиль записи.
 */
export function calibrate(profile: BehaviorProfile): CalibrationResult {
  const warnings: string[] = [];
  const clamped: Record<string, boolean> = {};

  const take = (key: string, value: { value: number; clamped: boolean }): number => {
    clamped[key] = value.clamped;
    return value.value;
  };

  const reaction = clamp(
    shrink(
      profile.reactionTime.p50,
      profile.reactionTime.n,
      CALIBRATION_DEFAULTS.reactionTime,
      profile.reactionTime.confidence,
    ),
    0.05,
    0.6,
  );

  const aimJitter = clamp(
    shrink(
      profile.aimError.p50 * 0.8,
      profile.aimError.n,
      CALIBRATION_DEFAULTS.aimJitter,
      profile.aimError.confidence,
    ),
    0.005,
    0.25,
  );

  const fireCone = clamp(
    shrink(
      Math.max(0.12, profile.aimError.p90 * 2 + 0.05),
      profile.aimError.n,
      CALIBRATION_DEFAULTS.fireCone,
      profile.aimError.confidence,
    ),
    0.1,
    0.6,
  );

  const fireRange = clamp(
    shrink(
      profile.preferredRange.p90 * 1.15,
      profile.preferredRange.n,
      CALIBRATION_DEFAULTS.fireRange,
      profile.preferredRange.confidence,
    ),
    180,
    900,
  );

  const minRange = clamp(
    shrink(
      profile.preferredRange.p25 * 0.8,
      profile.preferredRange.n,
      CALIBRATION_DEFAULTS.minRange,
      profile.preferredRange.confidence,
    ),
    80,
    600,
  );

  const maxRange = clamp(
    shrink(
      Math.max(
        minRange.value + 80,
        profile.preferredRange.p75 * 1.2,
      ),
      profile.preferredRange.n,
      CALIBRATION_DEFAULTS.maxRange,
      profile.preferredRange.confidence,
    ),
    160,
    900,
  );

  const zoneMargin = clamp(
    shrink(
      1 - profile.zoneEdgeRatio.value * 0.5,
      profile.zoneEdgeRatio.n,
      CALIBRATION_DEFAULTS.zoneMargin,
      profile.zoneEdgeRatio.confidence,
    ),
    0.65,
    0.92,
  );

  // Дискретное событие: дефолт исказил бы масштаб. Измеренное значение
  // используется даже при низком доверии, но с предупреждением.
  const abilityChancePerTick = clamp(
    profile.abilityPerMinute.n > 0
      ? profile.abilityPerMinute.value / 3600
      : CALIBRATION_DEFAULTS.abilityChancePerTick,
    0,
    0.1,
  );

  if (profile.abilityPerMinute.confidence === "low") {
    warnings.push(
      "abilityPerMinute: мало событий — частота способности оценена грубо, используется измеренное значение",
    );
  }
  for (const [name, feature] of [
    ["reactionTime", profile.reactionTime],
    ["aimError", profile.aimError],
    ["preferredRange", profile.preferredRange],
  ] as const) {
    if (feature.confidence === "low") {
      warnings.push(`${name}: confidence=low, значение стянуто к дефолту (k=${SHRINK_K})`);
    }
  }
  if (
    profile.fireRatio.value > 0.05 &&
    profile.aimError.confidence === "low"
  ) {
    warnings.push("fireRatio высокий, но aimError ненадёжен: fireCone оставлен близким к дефолту");
  }

  const params: CalibrationAgentParams = {
    reactionTime: take("reactionTime", reaction),
    aimJitter: take("aimJitter", aimJitter),
    fireCone: take("fireCone", fireCone),
    fireRange: take("fireRange", fireRange),
    minRange: take("minRange", minRange),
    maxRange: take("maxRange", maxRange),
    zoneMargin: take("zoneMargin", zoneMargin),
    abilityChancePerTick: take("abilityChancePerTick", abilityChancePerTick),
  };

  const clampedCount = Object.values(clamped).filter(Boolean).length;
  if (clampedCount > Object.keys(clamped).length / 2) {
    warnings.push(
      `больше половины параметров упёрлись в границы (${clampedCount}/${Object.keys(clamped).length})`,
    );
  }
  warnings.push(
    "не калибруются: decisionInterval, direction, threatHorizon, threatRadius, evadeWeight — зафиксированы",
  );
  for (const warning of profile.warnings) warnings.push(`профиль: ${warning}`);

  return {
    version: CALIBRATION_VERSION,
    sourceSessionId: profile.sourceSessionId,
    profile,
    agent: { kind: "evade", params },
    rationale: {
      reactionTime: `reactionTime.p50=${profile.reactionTime.p50.toFixed(3)} с → ${params.reactionTime.toFixed(3)} с`,
      aimJitter: `aimError.p50=${profile.aimError.p50.toFixed(3)} рад × 0.8 → ${params.aimJitter.toFixed(3)}`,
      fireCone: `aimError.p90=${profile.aimError.p90.toFixed(3)} рад × 2 + 0.05 → ${params.fireCone.toFixed(3)}`,
      fireRange:
        `preferredRange.p90=${profile.preferredRange.p90.toFixed(0)} px × 1.15 → ` +
        `${params.fireRange.toFixed(0)}`,
      minRange: `preferredRange.p25=${profile.preferredRange.p25.toFixed(0)} px × 0.8 → ${params.minRange.toFixed(0)}`,
      maxRange:
        `preferredRange.p75=${profile.preferredRange.p75.toFixed(0)} px × 1.2, ` +
        `не ближе minRange+80 → ${params.maxRange.toFixed(0)}`,
      zoneMargin: `zoneEdgeRatio=${profile.zoneEdgeRatio.value.toFixed(3)} → ${params.zoneMargin.toFixed(3)}`,
      abilityChancePerTick:
        `abilityPerMinute=${profile.abilityPerMinute.value.toFixed(2)} → ` +
        `${params.abilityChancePerTick.toFixed(5)} за тик`,
    },
    clamped,
    warnings,
  };
}
