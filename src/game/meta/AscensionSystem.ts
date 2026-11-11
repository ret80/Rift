/**
 * AscensionSystem — Threat Levels и модификаторы асценсии.
 * Заглушка. Реализация — Этап 10.
 */

import type { AscensionState } from "./types";

export class AscensionSystem {
  private state: AscensionState = {
    threatLevel: 0,
    activeModifiers: [],
    maxThreatLevel: 20,
  };

  getState(): AscensionState {
    return this.state;
  }

  setState(state: AscensionState): void {
    this.state = state;
  }

  getThreatLevel(): number {
    return this.state.threatLevel;
  }

  /** Повысить Threat Level. Возвращает true при успехе. */
  increaseTL(): boolean {
    if (this.state.threatLevel >= this.state.maxThreatLevel) return false;
    this.state.threatLevel += 1;
    return true;
  }

  /** Добавить модификатор. */
  addModifier(modifierId: string): boolean {
    if (this.state.activeModifiers.includes(modifierId)) return false;
    this.state.activeModifiers.push(modifierId);
    return true;
  }

  /** Убрать модификатор. */
  removeModifier(modifierId: string): void {
    this.state.activeModifiers = this.state.activeModifiers.filter((m) => m !== modifierId);
  }

  /** Получить множители от активных модификаторов. */
  getMultipliers(): Record<string, number> {
    // [TUNE] реализовать суммирование эффектов
    return {};
  }
}
