/**
 * UnlockSystem — разблокировки за кредиты и достижения.
 * Заглушка. Реализация — Этап 8.
 */

import type { Unlock, UnlockState } from "./types";

export class UnlockSystem {
  private state: UnlockState = { unlocks: {} };

  getState(): UnlockState {
    return this.state;
  }

  setState(state: UnlockState): void {
    this.state = state;
  }

  isUnlocked(id: string): boolean {
    return this.state.unlocks[id] === true;
  }

  unlock(id: string): void {
    this.state.unlocks[id] = true;
  }

  /** Проверить условие разблокировки. */
  checkCondition(_unlock: Unlock): boolean {
    // [TUNE] реализовать проверку условий
    return false;
  }
}
