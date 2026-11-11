/**
 * WaveStateMachine — номер волны, счётчики и переход active → cleared.
 *
 * Без хуков и рендера: только состояние волны. Оркестратор решает, когда
 * показывать баннер и когда переходить к следующей волне.
 */

export type WaveStateId = "inactive" | "active" | "cleared";

/** Тип волны. `objective` — волна с якорями-разломами. */
export type WaveType = "combat" | "objective";

/** Каждая N-я волна — objective. */
export const OBJECTIVE_WAVE_INTERVAL = 3;
/** Якорей на обычной objective-волне. */
export const OBJECTIVE_ANCHORS = 2;
/** Якорей на усиленной objective-волне (каждая вторая). */
export const OBJECTIVE_ANCHORS_HEAVY = 3;

/** Тип волны по её номеру. */
export function waveTypeFor(wave: number): WaveType {
  return wave > 0 && wave % OBJECTIVE_WAVE_INTERVAL === 0
    ? "objective"
    : "combat";
}

/** Сколько якорей спавнить на волне (0 — не objective). */
export function anchorCountFor(wave: number): number {
  if (waveTypeFor(wave) !== "objective") return 0;
  return wave % (OBJECTIVE_WAVE_INTERVAL * 2) === 0
    ? OBJECTIVE_ANCHORS_HEAVY
    : OBJECTIVE_ANCHORS;
}

export class WaveStateMachine {
  private _wave = 1;
  private _total = 0;
  private _state: WaveStateId = "active";
  private _clearTime = 0;
  private _type: WaveType = waveTypeFor(1);

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

  /** Явный тип текущей волны. */
  get waveType(): WaveType {
    return this._type;
  }

  /** Инициализировать волну после отсчёта/активации зоны. */
  init(wave: number, total: number, type: WaveType = waveTypeFor(wave)): void {
    this._wave = wave;
    this._total = total;
    this._type = type;
    this._state = "active";
    this._clearTime = 0;
  }

  /** Сброс к волне старта (новый забег). */
  reset(targetWave: number): void {
    this._wave = targetWave;
    this._total = 0;
    this._type = waveTypeFor(targetWave);
    this._state = "active";
    this._clearTime = 0;
  }

  /** Перейти к следующей волне; возвращает новый номер. */
  advance(): number {
    this._wave++;
    this._type = waveTypeFor(this._wave);
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
