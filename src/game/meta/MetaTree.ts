/**
 * MetaTree — Зеркало Ночи: мета-дерево с ветками (красная/зелёная).
 * Заглушка. Реализация — Этап 8.
 */

import type { MetaTreeState, MetaTalent } from "./types";

export class MetaTree {
  private state: MetaTreeState = { talents: {}, credits: 0 };

  getState(): MetaTreeState {
    return this.state;
  }

  setState(state: MetaTreeState): void {
    this.state = state;
  }

  /** Получить уровень таланта. */
  getLevel(talentId: string): number {
    return this.state.talents[talentId] ?? 0;
  }

  /** Проверить, можно ли купить следующий уровень. */
  canPurchase(talent: MetaTalent): boolean {
    const current = this.getLevel(talent.id);
    if (current >= talent.maxLevel) return false;
    const cost = talent.costs[current] ?? 0;
    return this.state.credits >= cost;
  }

  /** Купить следующий уровень. Возвращает true при успехе. */
  purchase(talent: MetaTalent): boolean {
    if (!this.canPurchase(talent)) return false;
    const current = this.getLevel(talent.id);
    const cost = talent.costs[current] ?? 0;
    this.state.credits -= cost;
    this.state.talents[talent.id] = current + 1;
    return true;
  }

  /** Добавить кредиты. */
  addCredits(amount: number): void {
    this.state.credits += amount;
  }
}
