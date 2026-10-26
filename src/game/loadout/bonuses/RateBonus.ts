/**
 * RateBonus — временный бонус «темп огня».
 *
 * Каждый подбор пикапа темпа огня добавляет ступень к множителю
 * (до максимума) и обнуляет таймер. Множитель темпа стрельбы отдаёт
 * узким методом getRateMult() — так же, как пушка раскладывает
 * персистентные апгрейды по своим стволам.
 */

import { RATE_BOOST_TIME } from "../../balance/player";
import type { Bonus, BonusId, BonusMeta } from "./Bonus";

/** Прирост множителя за один подбор. */
const RATE_STEP = 0.2;
/** Максимальный накопленный множитель добавки. */
const RATE_MAX = 1.0;

export class RateBonus implements Bonus {
  readonly id: BonusId = "rate";
  readonly meta: BonusMeta = {
    kind: "rate",
    icon: "pickup-rate",
    color: "#ff8c42",
    labelKey: "hud.loadout.rate",
    order: 3,
    duration: RATE_BOOST_TIME,
  };

  /** Накопленная добавка к множителю (0..RATE_MAX). */
  private stack = 0;
  /** Остаток времени действия, секунды. */
  private timeLeft = 0;
  /** Множитель длительности от прокачки «Время действия». */
  private durationMult = 1;

  /** Длительность бонуса с учётом прокачки, секунды. */
  private getDuration(): number {
    return this.meta.duration * this.durationMult;
  }

  /** Задать множитель длительности из прокачки. */
  setDurationMult(mult: number): void {
    this.durationMult = Math.max(1, mult);
  }

  /** Итоговый множитель темпа стрельбы от бонуса. */
  getRateMult(): number {
    return 1 + this.stack;
  }

  isActive(): boolean {
    return this.timeLeft > 0;
  }

  getRemaining(): number {
    return this.timeLeft;
  }

  getProgress(): number {
    const duration = this.getDuration();
    return duration > 0 ? Math.min(1, this.timeLeft / duration) : 0;
  }

  activate(): void {
    this.stack = Math.min(RATE_MAX, this.stack + RATE_STEP);
    this.timeLeft = this.getDuration();
  }

  update(dt: number): void {
    if (this.timeLeft <= 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.stack = 0;
    }
  }

  reset(): void {
    this.stack = 0;
    this.timeLeft = 0;
    this.durationMult = 1;
  }
}