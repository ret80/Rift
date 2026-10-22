/**
 * DashBonus — временный бонус «рывок».
 *
 * Подбор пикапа «рывок» включает ускоренный режим движения на
 * фиксированное время. Остаток времени отдаёт узким методом
 * getDashRemaining() — физика движения читает его каждый кадр.
 */

import { DASH_BONUS_TIME } from "../../balance/player";
import type { Bonus, BonusId, BonusMeta } from "./Bonus";

export class DashBonus implements Bonus {
  readonly id: BonusId = "dash";
  readonly meta: BonusMeta = {
    kind: "dash",
    icon: "bonus-dash",
    color: "#ffd23e",
    labelKey: "hud.loadout.dash",
    order: 5,
    duration: DASH_BONUS_TIME,
  };

  /** Остаток времени рывка, секунды. */
  private timeLeft = 0;
  /** Множитель длительности рывка из перманентного апгрейда. */
  private durationMult = 1;

  /** Остаток времени рывка для физики движения. */
  getDashRemaining(): number {
    return this.timeLeft;
  }

  /** Задать множитель длительности рывка (апгрейд «длительность рывка»). */
  setDurationMult(mult: number): void {
    this.durationMult = mult;
  }

  /** Фактическая длительность рывка с учётом апгрейда, секунды. */
  getDuration(): number {
    return this.meta.duration * this.durationMult;
  }

  isActive(): boolean {
    return this.timeLeft > 0;
  }

  getRemaining(): number {
    return this.timeLeft;
  }

  getProgress(): number {
    return Math.min(1, this.timeLeft / this.getDuration());
  }

  activate(): void {
    this.timeLeft = this.getDuration();
  }

  update(dt: number): void {
    if (this.timeLeft <= 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) this.timeLeft = 0;
  }

  reset(): void {
    this.timeLeft = 0;
  }
}