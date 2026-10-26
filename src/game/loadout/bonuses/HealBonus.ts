/**
 * HealBonus — временный бонус «здоровье».
 *
 * Каждый подбор пикапа здоровья запускает восстановление корпуса:
 * бонус лечит healPerSecond HP каждую секунду в течение healDuration секунд.
 * Время действия и скорость восстановления задаются прокачкой
 * «Время действия» и «Восстановление/с» во вкладке «Бонусы».
 */

import { HEAL_BONUS_TIME, HEAL_BASE } from "../../balance/player";
import type { Bonus, BonusId, BonusMeta } from "./Bonus";

export class HealBonus implements Bonus {
  readonly id: BonusId = "heal";
  readonly meta: BonusMeta = {
    kind: "heal",
    icon: "pickup-heal",
    color: "#7dffb8",
    labelKey: "hud.loadout.heal",
    order: 3,
    duration: HEAL_BONUS_TIME,
  };

  /** Остаток времени действия, секунды. */
  private timeLeft = 0;
  /** Множитель длительности от прокачки «Время действия». */
  private durationMult = 1;
  /** Множитель скорости восстановления от прокачки «Восстановление/с». */
  private healRateMult = 1;
  /** Колбэк восстановления корпуса (HP в секунду). */
  private onHeal: ((amount: number) => void) | null = null;

  /** Мгновенное восстановление за один кадр (HP/с × dt). */
  private healPerSecond(): number {
    return HEAL_BASE * this.healRateMult;
  }

  /** Длительность бонуса с учётом прокачки, секунды. */
  private getDuration(): number {
    return this.meta.duration * this.durationMult;
  }

  /** Задать множитель длительности из прокачки. */
  setDurationMult(mult: number): void {
    this.durationMult = Math.max(1, mult);
  }

  /** Задать множитель скорости восстановления из прокачки. */
  setHealRateMult(mult: number): void {
    this.healRateMult = Math.max(1, mult);
  }

  /** Подключить восстановление корпуса игрока. */
  setHealHook(hook: (amount: number) => void): void {
    this.onHeal = hook;
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
    this.timeLeft = this.getDuration();
  }

  update(dt: number): void {
    if (this.timeLeft <= 0) return;
    this.onHeal?.(this.healPerSecond() * dt);
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
    }
  }

  reset(): void {
    this.timeLeft = 0;
    this.durationMult = 1;
    this.healRateMult = 1;
  }
}