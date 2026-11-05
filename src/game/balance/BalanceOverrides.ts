/**
 * BalanceOverrides — явные множители баланса для сценария.
 *
 * Множители живут в сценарии, а не в глобальных константах: один и тот же
 * мир можно прогнать при `×1.00` и `×1.20`, не меняя код и не пересъёмя
 * baseline. Значения `1` считаются отсутствием override — иначе хэш
 * старого сценария изменился бы от одного лишь наличия поля.
 */

/** Допустимый диапазон множителя. */
export const BALANCE_MULT_MIN = 0.25;
/** Допустимый диапазон множителя. */
export const BALANCE_MULT_MAX = 4;

/** Множители баланса, которые понимает мир. */
export interface BalanceOverrides {
  /** Здоровье врагов; 1 — без изменений. */
  enemyHpMult?: number;
  /** Урон врагов игроку и дронам; 1 — без изменений. */
  enemyDamageMult?: number;
}

/** Множители после нормализации: всегда конечные числа. */
export interface ResolvedBalanceOverrides {
  enemyHpMult: number;
  enemyDamageMult: number;
}

/** Множители по умолчанию (мир без изменений). */
export function defaultBalanceOverrides(): ResolvedBalanceOverrides {
  return { enemyHpMult: 1, enemyDamageMult: 1 };
}

/** Нормализовать множители; невалидные значения подменяются на 1. */
export function resolveBalanceOverrides(
  raw: BalanceOverrides | undefined,
): ResolvedBalanceOverrides {
  const read = (value: unknown): number =>
    typeof value === "number" && Number.isFinite(value) && value > 0
      ? Math.min(BALANCE_MULT_MAX, Math.max(BALANCE_MULT_MIN, value))
      : 1;
  return {
    enemyHpMult: read(raw?.enemyHpMult),
    enemyDamageMult: read(raw?.enemyDamageMult),
  };
}

/** Есть ли в множителях хоть одно отличие от единицы. */
export function hasBalanceOverride(raw: BalanceOverrides | undefined): boolean {
  if (!raw) return false;
  return (
    (raw.enemyHpMult !== undefined && raw.enemyHpMult !== 1) ||
    (raw.enemyDamageMult !== undefined && raw.enemyDamageMult !== 1)
  );
}

/** Проверить множители и вернуть список проблем (пусто — валидно). */
export function validateBalanceOverrides(raw: unknown): string[] {
  if (raw === undefined) return [];
  if (typeof raw !== "object" || raw === null || Array.isArray(raw)) {
    return ["balance: ожидается объект { enemyHpMult?, enemyDamageMult? }"];
  }
  const issues: string[] = [];
  const data = raw as Record<string, unknown>;
  for (const key of ["enemyHpMult", "enemyDamageMult"] as const) {
    const value = data[key];
    if (value === undefined) continue;
    if (typeof value !== "number" || !Number.isFinite(value)) {
      issues.push(`balance.${key}: ожидается конечное число`);
      continue;
    }
    if (value < BALANCE_MULT_MIN || value > BALANCE_MULT_MAX) {
      issues.push(
        `balance.${key}: должно быть в диапазоне ${BALANCE_MULT_MIN}..${BALANCE_MULT_MAX}`,
      );
    }
  }
  return issues;
}

/** Строка для отчёта: `hp×1.10 dmg×1.00`. */
export function formatBalance(balance: BalanceOverrides | undefined): string {
  const resolved = resolveBalanceOverrides(balance);
  return `hp×${resolved.enemyHpMult.toFixed(2)} dmg×${resolved.enemyDamageMult.toFixed(2)}`;
}
