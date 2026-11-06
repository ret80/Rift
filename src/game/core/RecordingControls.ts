/**
 * RecordingControls — декоратор порта управления для записи.
 *
 * Проксирует все геттеры и `consumeAbility()` без изменений, но сообщает
 * рекордеру о фактическом потреблении способности. Игра потребляет
 * способность ровно один раз, поэтому запись не может «съесть» нажатие.
 */

import type { PlayerControls } from "./PlayerControls";

export class RecordingControls implements PlayerControls {
  constructor(
    private readonly inner: PlayerControls,
    private readonly onAbility: () => void,
  ) {}

  get axis(): { x: number; y: number } {
    return this.inner.axis;
  }

  get aimAngle(): number | null {
    return this.inner.aimAngle;
  }

  get firing(): boolean {
    return this.inner.firing;
  }

  get lastConsumedAbility(): boolean | undefined {
    return this.inner.lastConsumedAbility;
  }

  consumeAbility(): boolean {
    const consumed = this.inner.consumeAbility();
    if (consumed) this.onAbility();
    return consumed;
  }

  /** Рывок проксируется без записи: он не входит в формат интентов. */
  consumeDash(): boolean {
    return this.inner.consumeDash();
  }
}
