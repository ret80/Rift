/**
 * LockOnSystem — выбор цели (lock-on).
 * Заглушка. Реализация — Этап 7.
 */

export interface LockTarget {
  id: string;
  x: number;
  y: number;
  alive: boolean;
}

export class LockOnSystem {
  private target: LockTarget | null = null;
  private lockTimer = 0;

  getTarget(): LockTarget | null {
    return this.target;
  }

  lock(target: LockTarget): void {
    this.target = target;
    this.lockTimer = 5; // [TUNE] секунды без видимости
  }

  unlock(): void {
    this.target = null;
    this.lockTimer = 0;
  }

  update(dt: number): void {
    if (this.target) {
      if (!this.target.alive) {
        this.unlock();
        return;
      }
      this.lockTimer -= dt;
      if (this.lockTimer <= 0) {
        this.unlock();
      }
    }
  }
}
