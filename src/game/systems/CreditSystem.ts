/**
 * CreditSystem — кредиты, постоянная валюта Механики 3.
 *
 * Кредиты начисляются один раз в конце забега по формуле GDD §3.3.
 * Расчёт отделён от баланса: `calculate` только считает, `award` начисляет.
 * Баланс живёт между забегами, поэтому загружается из хранилища владельцем.
 */

export interface CreditParams {
  /** Сколько деталей собрано за забег (не остаток на руках). */
  totalParts: number;
  /** Волны, зачищенные без полученного урона. */
  cleanWaves: number;
  /** Касания снарядов за забег. */
  grazeCount: number;
  /** Максимальный множитель комбо за забег. */
  maxCombo: number;
  /** Волны, зачищенные быстрее 60 секунд. */
  fastClears: number;
  eliteKills: number;
  bossKills: number;
  /** Волны с якорями, где сняты все якоря. */
  anchorClears: number;
  /** Множитель кредитов из мета-талантов. */
  creditsMult?: number;
}

export interface CreditBreakdown {
  base: number;
  cleanWaveBonus: number;
  grazeBonus: number;
  comboBonus: number;
  fastClearBonus: number;
  eliteKillBonus: number;
  bossKillBonus: number;
  anchorBonus: number;
  total: number;
}

export class CreditSystem {
  private balance = 0;

  /** Установить баланс из хранилища (начало забега). */
  setBalance(amount: number): void {
    this.balance = Math.max(0, Math.floor(amount));
  }

  /** Текущий баланс кредитов. */
  getBalance(): number {
    return this.balance;
  }

  /** Рассчитать кредиты за забег. Баланс не меняется. */
  calculate(params: CreditParams): CreditBreakdown {
    // 5 % от всех собранных за забег деталей — база.
    const base = Math.floor(params.totalParts * 0.05);
    const cleanWaveBonus = params.cleanWaves * 5;
    const grazeBonus = Math.floor(params.grazeCount / 5);
    const comboBonus = Math.floor(Math.max(0, params.maxCombo - 1) * 2);
    const fastClearBonus = params.fastClears * 3;
    const eliteKillBonus = params.eliteKills * 10;
    const bossKillBonus = params.bossKills * 50;
    const anchorBonus = params.anchorClears * 8;

    const raw =
      base +
      cleanWaveBonus +
      grazeBonus +
      comboBonus +
      fastClearBonus +
      eliteKillBonus +
      bossKillBonus +
      anchorBonus;

    const multiplied = Math.floor(raw * (params.creditsMult ?? 1));
    // Минимум 1 кредит за забег: даже провал инвестирует в мету.
    return {
      base,
      cleanWaveBonus,
      grazeBonus,
      comboBonus,
      fastClearBonus,
      eliteKillBonus,
      bossKillBonus,
      anchorBonus,
      total: Math.max(1, multiplied),
    };
  }

  /** Начислить рассчитанные кредиты. */
  award(breakdown: CreditBreakdown): void {
    this.balance += breakdown.total;
  }

  /** Списать кредиты (покупка в Эхе Разлома). Возвращает true при успехе. */
  spend(amount: number): boolean {
    if (amount <= 0) return true;
    if (this.balance < amount) return false;
    this.balance -= amount;
    return true;
  }
}
