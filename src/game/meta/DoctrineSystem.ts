/**
 * DoctrineSystem — доктрины: выбор и применение эффектов.
 * Заглушка. Реализация — Этап 9.
 */

import type { Doctrine, DoctrineState } from "./types";

export class DoctrineSystem {
  private state: DoctrineState = { selectedDoctrineId: null, unlockedDoctrines: [] };

  getState(): DoctrineState {
    return this.state;
  }

  setState(state: DoctrineState): void {
    this.state = state;
  }

  getSelected(): string | null {
    return this.state.selectedDoctrineId;
  }

  select(id: string): boolean {
    if (!this.state.unlockedDoctrines.includes(id)) return false;
    this.state.selectedDoctrineId = id;
    return true;
  }

  unlock(id: string): void {
    if (!this.state.unlockedDoctrines.includes(id)) {
      this.state.unlockedDoctrines.push(id);
    }
  }

  /** Получить эффект выбранной доктрины. */
  getEffect(_doctrines: Doctrine[]): Record<string, number> {
    // [TUNE] реализовать применение эффектов
    return {};
  }
}
