/**
 * GameLoop — персистентный игровой цикл.
 * Владеет requestAnimationFrame, расчётом dt, временем забега,
 * сглаженным FPS и подпиской на resize. Ничего не знает о системах:
 * каждый кадр вызывает переданный коллбэк step(dt).
 */

import { FPS_SMOOTHING_FACTOR } from "../balance";
import { clamp } from "../math";

export class GameLoop {
  private raf = 0;
  private lastT = 0;
  private _time = 0;
  private fpsEma = 60;

  constructor(
    private readonly onStep: (dt: number) => void,
    private readonly onResize: () => void,
  ) {
    window.addEventListener("resize", onResize);
    this.lastT = performance.now();
    const loop = (now: number) => {
      const rdt = clamp((now - this.lastT) / 1000, 0, 0.05);
      this.lastT = now;
      if (rdt > 0) {
        this.fpsEma = this.fpsEma * (1 - FPS_SMOOTHING_FACTOR) + (1 / rdt) * FPS_SMOOTHING_FACTOR;
        this._time += rdt;
      }
      this.onStep(rdt);
      this.raf = requestAnimationFrame(loop);
    };
    this.raf = requestAnimationFrame(loop);
  }

  get time(): number {
    return this._time;
  }

  fps(): number {
    return Math.round(this.fpsEma);
  }

  /** Сбросить время забега (текущий запуск). */
  resetTime(): void {
    this._time = 0;
  }

  destroy(): void {
    cancelAnimationFrame(this.raf);
    window.removeEventListener("resize", this.onResize);
  }
}