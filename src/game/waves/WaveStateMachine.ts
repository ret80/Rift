/**
 * WaveStateMachine — номер волны, счётчики и переход active → cleared.
 *
 * Без хуков и рендера: только состояние волны. Оркестратор решает, когда
 * показывать баннер и когда переходить к следующей волне.
 */

export type WaveStateId = "inactive" | "active" | "cleared";

export class WaveStateMachine {
  private _wave = 1;
  private _total = 0;
  private _state: WaveStateId = "active";
  private _clearTime = 0;

  get wave(): number {
    return this._wave;
  }

  get total(): number {
    return this._total;
  }

  get state(): WaveStateId {
    return this._state;
  }

  get clearTime(): number {
    return this._clearTime;
  }

  /** Инициализировать волну после отсчёта/активации зоны. */
  init(wave: number, total: number): void {
    this._wave = wave;
    this._total = total;
    this._state = "active";
    this._clearTime = 0;
  }

  /** Сброс к волне старта (новый забег). */
  reset(targetWave: number): void {
    this._wave = targetWave;
    this._total = 0;
    this._state = "active";
    this._clearTime = 0;
  }

  /** Перейти к следующей волне; возвращает новый номер. */
  advance(): number {
    this._wave++;
    this._clearTime = 0;
    this._state = "active";
    return this._wave;
  }

  /** Учесть время в состоянии cleared. */
  addClearTime(dt: number): number {
    this._clearTime += dt;
    return this._clearTime;
  }

  /** Перевести волну в cleared, если все враги заспавнены и убиты. */
  tryClear(allSpawned: boolean, allKilled: boolean): boolean {
    if (this._state !== "active") return false;
    if (!allSpawned || !allKilled) return false;
    this._state = "cleared";
    this._clearTime = 0;
    return true;
  }
}
