/**
 * ActiveShieldSystem — активный щит (сектор).
 * Заглушка. Реализация — Этап 7.
 */

export interface ActiveShieldState {
  active: boolean;
  angle: number;       // центр сектора, радианы
  halfAngle: number;   // половина ширины сектора
  energy: number;
  maxEnergy: number;
  drainRate: number;   // энергия/с
}

export class ActiveShieldSystem {
  private state: ActiveShieldState = {
    active: false,
    angle: 0,
    halfAngle: Math.PI / 3, // 60° = 120° сектор
    energy: 100,
    maxEnergy: 100,
    drainRate: 30,
  };

  getState(): ActiveShieldState {
    return this.state;
  }

  activate(): void {
    this.state.active = true;
  }

  deactivate(): void {
    this.state.active = false;
  }

  update(dt: number, _playerAngle: number): void {
    if (this.state.active) {
      this.state.energy -= this.state.drainRate * dt;
      if (this.state.energy <= 0) {
        this.state.energy = 0;
        this.state.active = false;
      }
    } else {
      // реген
      this.state.energy = Math.min(this.state.maxEnergy, this.state.energy + 9 * dt);
    }
    // [TUNE] применить множители из мета
  }

  isBlocking(projectileAngle: number): boolean {
    if (!this.state.active) return false;
    let diff = projectileAngle - this.state.angle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    return Math.abs(diff) <= this.state.halfAngle;
  }
}
