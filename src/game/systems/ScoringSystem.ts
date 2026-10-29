/**
 * ScoringSystem — score, combo, records.
 * Handles score, best (localStorage), killed, combo timer/multiplier.
 */

import { System } from "@trixt0r/ecs";
import type { EventBus } from '../core/EventBus';
import type { PersistencePort } from '../core/PersistencePort';

const BEST_KEY = "voxbest";
const COMBO_TIMEOUT = 3;
const KILLS_PER_MULTIPLIER = 5;
const MAX_MULTIPLIER = 10;

export interface ScoringState {
  score: number;
  best: number;
  killed: number;
  combo: number;
  comboT: number;
  runTime: number;
  comboMult: number;
}

export interface ScoringHooks {}

export class ScoringSystem extends System {
  private _score = 0;
  private _best = 0;
  private _killed = 0;
  private _combo = 0;
  private _comboT = 0;
  private _runTime = 0;

  private readonly hooks: ScoringHooks;
  private readonly storage: PersistencePort;
  private _killedWave = 0;

  constructor(hooks: ScoringHooks = {}, storage: PersistencePort) {
    super(-20); // комбо/скорость времени — до игровых систем
    this.hooks = hooks;
    this.storage = storage;
    this._best = Number(storage.get(BEST_KEY)) || 0;
  }

  /** Обновление комбо-таймера внутри engine.run(dt). */
  process(dt: number): void {
    this.updateCombo(dt);
  }

  /** Subscribe to enemy_killed events and auto-update score/kills/combo */
  subscribeToEvents(eventBus: EventBus): void {
    eventBus.subscribe('enemy_killed', (event) => {
      const scoreValue = event.payload.score;
      this._killedWave = this.onKill(scoreValue, this._killedWave);
    });
    eventBus.subscribe('score_added', (event) => {
      this.add(event.payload.amount);
    });
  }

  // ── Core scoring ──────────────────────────────────────────────

  /** Add points to score */
  add(n: number): void {
    this._score += n;
  }

  get score(): number {
    return this._score;
  }

  /** Called when an enemy is killed */
  onKill(scoreValue: number, killedWave: number): number {
    this._score += scoreValue;
    this._killed++;
    this._combo++;
    this._comboT = COMBO_TIMEOUT;
    this._killedWave = killedWave + 1;
    return this._killedWave;
  }

  /** Get current killed wave count for wave clear checks */
  get killedWave(): number {
    return this._killedWave;
  }

  /** Set killed wave from outside (for initialisation) */
  setKilledWave(v: number): void {
    this._killedWave = v;
  }

  // ── Combo ─────────────────────────────────────────────────────

  /** Update combo timer, return updated comboT */
  updateCombo(dt: number): number {
    if (this._comboT > 0) {
      this._comboT -= dt;
      if (this._comboT <= 0) {
        this._comboT = 0;
        this._combo = 0;
      }
    }
    return this._comboT;
  }

  /** Combo multiplier (1..10) */
  get comboMult(): number {
    return Math.min(MAX_MULTIPLIER, 1 + Math.floor(this._combo / KILLS_PER_MULTIPLIER));
  }

  // ── Best / persistence ────────────────────────────────────────

  get best(): number {
    return this._best;
  }

  /** Check if current score broke the best, persist if so */
  checkNewBest(): boolean {
    if (this._score > this._best) {
      this._best = this._score;
      this.storage.set(BEST_KEY, String(this._best));
      return true;
    }
    return false;
  }

  // ── Time ──────────────────────────────────────────────────────

  addRunTime(dt: number): void {
    this._runTime += dt;
  }

  get runTime(): number {
    return this._runTime;
  }

  // ── State snapshot (for HUD) ──────────────────────────────────

  getState(): ScoringState {
    return {
      score: this._score,
      best: this._best,
      killed: this._killed,
      combo: this._combo,
      comboT: this._comboT,
      runTime: this._runTime,
      comboMult: this.comboMult,
    };
  }

  // ── Reset ─────────────────────────────────────────────────────

  /** Reset score/kills/combo for a new run; preserve best */
  reset(): void {
    this._score = 0;
    this._killed = 0;
    this._killedWave = 0;
    this._combo = 0;
    this._comboT = 0;
    this._runTime = 0;
  }
}
