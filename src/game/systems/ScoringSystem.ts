/**
 * ScoringSystem — счёт, комбо, рекорды.
 * Отвечает за score, best (localStorage), killed, combo timer/multiplier.
 */

const BEST_KEY = "voxbest";

export interface ScoringState {
  score: number;
  best: number;
  killed: number;
  combo: number;
  comboT: number;
  runTime: number;
  comboMult: number;
}

export interface ScoringHooks {
  /** Called when best score is broken — used to persist / show new-best banner */
  onNewBest?: (best: number) => void;
}

export class ScoringSystem {
  private _score = 0;
  private _best = 0;
  private _killed = 0;
  private _combo = 0;
  private _comboT = 0;
  private _runTime = 0;

  private readonly hooks: ScoringHooks;

  constructor(hooks: ScoringHooks = {}) {
    this.hooks = hooks;
    this._best = (() => {
      try {
        return Number(localStorage.getItem(BEST_KEY)) || 0;
      } catch {
        return 0;
      }
    })();
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
    this._comboT = 3;
    return killedWave + 1;
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
    return Math.min(10, 1 + Math.floor(this._combo / 5));
  }

  // ── Best / persistence ────────────────────────────────────────

  get best(): number {
    return this._best;
  }

  /** Check if current score broke the best, persist if so */
  checkNewBest(): boolean {
    if (this._score > this._best) {
      this._best = this._score;
      try {
        localStorage.setItem(BEST_KEY, String(this._best));
      } catch {
        /* storage full / private mode — silent */
      }
      this.hooks.onNewBest?.(this._best);
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
    this._combo = 0;
    this._comboT = 0;
    this._runTime = 0;
  }
}
