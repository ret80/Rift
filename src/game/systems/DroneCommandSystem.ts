/**
 * DroneCommandSystem — приказы дронам (сопровождение/штурм/удержание).
 * Заглушка. Реализация — Этап 6.
 */

export type DroneCommandMode = "follow" | "assault" | "hold";

export class DroneCommandSystem {
  private mode: DroneCommandMode = "follow";

  getMode(): DroneCommandMode {
    return this.mode;
  }

  setMode(mode: DroneCommandMode): void {
    this.mode = mode;
  }

  cycleMode(): void {
    const modes: DroneCommandMode[] = ["follow", "assault", "hold"];
    const idx = modes.indexOf(this.mode);
    this.mode = modes[(idx + 1) % modes.length];
  }
}
