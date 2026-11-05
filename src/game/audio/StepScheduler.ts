/**
 * Планировщик музыкальных шагов с опережением.
 *
 * setInterval только наполняет очередь; сами ноты ставятся на точное время
 * AudioContext. Поэтому джиттер браузерного таймера не слышен, а темп не
 * «плывёт» на длинных треках.
 */
export class StepScheduler {
  private timer: number | null = null;
  private step = 0;
  private nextTime = 0;

  constructor(
    private readonly ctx: AudioContext,
    private readonly stepSec: number,
    private readonly onStep: (step: number, when: number) => void,
    private readonly lookahead = 0.12,
  ) {}

  get running(): boolean {
    return this.timer !== null;
  }

  /** Запустить с указанного шага; повторный запуск перезапускает очередь. */
  start(fromStep = 0): void {
    this.stop();
    this.step = fromStep;
    this.nextTime = this.ctx.currentTime + 0.06;
    this.timer = window.setInterval(() => this.pump(), 25);
    this.pump();
  }

  stop(): void {
    if (this.timer !== null) {
      window.clearInterval(this.timer);
      this.timer = null;
    }
  }

  private pump(): void {
    if (this.timer === null) return;
    if (this.ctx.state !== "running") {
      // Контекст приостановлен: не копим просроченные шаги.
      this.nextTime = this.ctx.currentTime + 0.06;
      return;
    }
    while (this.nextTime < this.ctx.currentTime + this.lookahead) {
      this.onStep(this.step, this.nextTime);
      this.nextTime += this.stepSec;
      this.step++;
    }
  }
}
