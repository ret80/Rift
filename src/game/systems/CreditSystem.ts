/**
 * CreditSystem — начисление кредитов (мета-валюта) после забега.
 * Формула: basePercent * totalParts + masteryBonus.
 */

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
  private credits = 0;

  /** Рассчитать кредиты за забег. */
  calculate(params: {
    totalParts: number;
    cleanWaves: number;
    grazeCount: number;
    maxCombo: number;
    fastClears: number;
    eliteKills: number;
    bossKills: number;
    anchorClears: number;
    waveCount: number;
  }): CreditBreakdown {
    const base = Math.floor(params.totalParts * 0.05);
    const cleanWaveBonus = params.cleanWaves * 5; // [TUNE]
    const grazeBonus = Math.floor(params.grazeCount / 5);
    const comboBonus = Math.floor(params.maxCombo * 2); // [TUNE]
    const fastClearBonus = params.fastClears * 3; // [TUNE]
    const eliteKillBonus = params.eliteKills * 10;
    const bossKillBonus = params.bossKills * 50;
    const anchorBonus = params.anchorClears * 8; // [TUNE]

    const total =
      base +
      cleanWaveBonus +
      grazeBonus +
      comboBonus +
      fastClearBonus +
      eliteKillBonus +
      bossKillBonus +
      anchorBonus;

    // Минимум 1 кредит за забег
    const finalTotal = Math.max(1, total);
    this.credits += finalTotal;

    return {
      base,
      cleanWaveBonus,
      grazeBonus,
      comboBonus,
      fastClearBonus,
      eliteKillBonus,
      bossKillBonus,
      anchorBonus,
      total: finalTotal,
    };
  }

  /** Текущий баланс кредитов. */
  getBalance(): number {
    return this.credits;
  }

  /** Добавить кредиты (например, при загрузке). */
  add(amount: number): void {
    this.credits += amount;
  }

  /** Списать кредиты (покупка). Возвращает true при успехе. */
  spend(amount: number): boolean {
    if (this.credits < amount) return false;
    this.credits -= amount;
    return true;
  }

  /** Сброс (для тестов). */
  reset(): void {
    this.credits = 0;
  }
}
