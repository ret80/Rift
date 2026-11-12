/**
 * Асценсия — уровни угрозы (Threat Levels).
 *
 * Уровень выбирается в Зеркале Ночи и повышает корпус и урон врагов.
 * Взамен забег платит больше кредитов: риск — единственный источник
 * ускоренной прокачки мета-дерева.
 */

/** Максимальный уровень угрозы в v1. */
export const MAX_THREAT_LEVEL = 10;

/** Множители одного уровня угрозы. */
export interface ThreatLevelDef {
  level: number;
  /** Множитель максимального корпуса врагов. */
  hpMult: number;
  /** Множитель урона врагов (контакт и снаряды). */
  damageMult: number;
  /** Множитель кредитов за забег. */
  creditsMult: number;
}

/** Прибавка корпуса врагов за уровень. */
export const THREAT_HP_PER_LEVEL = 0.15;
/** Прибавка урона врагов за уровень. */
export const THREAT_DAMAGE_PER_LEVEL = 0.1;
/** Прибавка кредитов за уровень. */
export const THREAT_CREDITS_PER_LEVEL = 0.2;

/** Нормализовать уровень угрозы в диапазон 0..MAX. */
export function clampThreatLevel(level: number): number {
  if (!Number.isFinite(level)) return 0;
  return Math.min(MAX_THREAT_LEVEL, Math.max(0, Math.round(level)));
}

/** Множители уровня угрозы. */
export function threatLevelDef(level: number): ThreatLevelDef {
  const lv = clampThreatLevel(level);
  return {
    level: lv,
    hpMult: 1 + THREAT_HP_PER_LEVEL * lv,
    damageMult: 1 + THREAT_DAMAGE_PER_LEVEL * lv,
    creditsMult: 1 + THREAT_CREDITS_PER_LEVEL * lv,
  };
}

/** Все уровни от 0 (обычная сложность) до максимума. */
export const THREAT_LEVELS: ThreatLevelDef[] = Array.from(
  { length: MAX_THREAT_LEVEL + 1 },
  (_, level) => threatLevelDef(level),
);
