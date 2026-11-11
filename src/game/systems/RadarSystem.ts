/**
 * RadarSystem — радар и индикаторы за кадром.
 * Заглушка. Реализация — Этап 11.
 */

export interface RadarBlip {
  x: number;
  y: number;
  type: "enemy" | "anchor" | "elite" | "carrier" | "boss" | "rift";
  priority: number;
}

export class RadarSystem {
  private blips: RadarBlip[] = [];

  getBlips(): RadarBlip[] {
    return this.blips;
  }

  reset(): void {
    this.blips = [];
  }

  update(_dt: number): void {
    // [TUNE] реализовать сбор блипов
  }
}
