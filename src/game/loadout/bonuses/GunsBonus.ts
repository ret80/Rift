/**
 * GunsBonus — временный бонус «дополнительные стволы».
 *
 * Каждый подбор пикапа «стволы» добавляет 2 временных ствола пушке
 * и обнуляет таймер. Когда таймер истекает, временные стволы исчезают.
 * Текущее число временных стволов отдаёт узким методом getExtraBarrels().
 */

import { GUN_BONUS_TIME } from "../../balance/player";
import type { Bonus, BonusId, BonusMeta } from "./Bonus";

/** Сколько стволов даёт один подбор пикапа. */
const GUNS_PER_PICKUP = 2;

export class GunsBonus implements Bonus {
  readonly id: BonusId = "guns";
  readonly meta: BonusMeta = {
    kind: "guns",
    icon: "pickup-gun",
    color: "#5ef2ff",
    labelKey: "hud.loadout.guns",
    order: 4,
    duration: GUN_BONUS_TIME,
  };

  /** Временно добавленные стволы. */
  private barrels = 0;
  /** Остаток времени действия, секунды. */
  private timeLeft = 0;

  /** Текущее число временных стволов. */
  getExtraBarrels(): number {
    return this.barrels;
  }

  isActive(): boolean {
    return this.timeLeft > 0;
  }

  getRemaining(): number {
    return this.timeLeft;
  }

  getProgress(): number {
    return Math.min(1, this.timeLeft / this.meta.duration);
  }

  activate(): void {
    this.barrels += GUNS_PER_PICKUP;
    this.timeLeft = this.meta.duration;
  }

  update(dt: number): void {
    if (this.timeLeft <= 0) return;
    this.timeLeft -= dt;
    if (this.timeLeft <= 0) {
      this.timeLeft = 0;
      this.barrels = 0;
    }
  }

  reset(): void {
    this.barrels = 0;
    this.timeLeft = 0;
  }
}