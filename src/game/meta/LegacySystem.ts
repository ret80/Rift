/**
 * LegacySystem — артефакты Наследия: слоты и эффекты.
 * Заглушка. Реализация — Этап 9.
 */

import type { LegacyState } from "./types";

export class LegacySystem {
  private state: LegacyState = { slots: [null], unlockedArtifacts: [], maxSlots: 1 };

  getState(): LegacyState {
    return this.state;
  }

  setState(state: LegacyState): void {
    this.state = state;
  }

  equip(slotIndex: number, artifactId: string): boolean {
    if (slotIndex < 0 || slotIndex >= this.state.maxSlots) return false;
    if (!this.state.unlockedArtifacts.includes(artifactId)) return false;
    this.state.slots[slotIndex] = artifactId;
    return true;
  }

  unequip(slotIndex: number): void {
    if (slotIndex >= 0 && slotIndex < this.state.maxSlots) {
      this.state.slots[slotIndex] = null;
    }
  }

  unlock(artifactId: string): void {
    if (!this.state.unlockedArtifacts.includes(artifactId)) {
      this.state.unlockedArtifacts.push(artifactId);
    }
  }
}
