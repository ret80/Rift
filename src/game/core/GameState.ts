/**
 * GameState - immutable game state.
 * Centralized metadata storage for all systems.
 * Entity pools are managed by EntityPoolSystem.
 */

import type { ZoneData } from './ZoneTypes';

// Alias for backward compatibility
export type ZoneState = ZoneData;

export interface WaveState {
  wave: number;
  total: number;
  killed: number;
  allocated: number;
  stepSize: number;
  dropThreshold: number;
  peakAlive: number;
}

export interface ScoreState {
  score: number;
  best: number;
  kills: number;
  combo: number;
  comboT: number;
  minerals: number;
}

export type GameStateType = 'menu' | 'playing' | 'active' | 'cleared' | 'dying' | 'over';

export class GameState {
  public type: GameStateType = 'menu';
  public paused: boolean = false;
  public time: number = 0;

  public wave: WaveState = {
    wave: 1,
    total: 0,
    killed: 0,
    allocated: 0,
    stepSize: 1,
    dropThreshold: 1,
    peakAlive: 0,
  };

  public zone: ZoneState = {
    active: false,
    x: 0,
    y: 0,
    radius: 0,
    targetRadius: 0,
    alpha: 0,
    collapseT: -1,
  };

  public score: ScoreState = {
    score: 0,
    best: 0,
    kills: 0,
    combo: 0,
    comboT: 0,
    minerals: 0,
  };

  /**
   * Reset state for a new round.
   */
  reset(startWave: number = 1): void {
    this.type = 'playing';
    this.paused = false;

    this.wave = {
      wave: startWave,
      total: 0,
      killed: 0,
      allocated: 0,
      stepSize: 1,
      dropThreshold: 1,
      peakAlive: 0,
    };

    this.zone = {
      active: false,
      x: 0,
      y: 0,
      radius: 0,
      targetRadius: 0,
      alpha: 0,
      collapseT: -1,
    };

    this.score = {
      score: 0,
      best: this.score.best, // preserve record
      kills: 0,
      combo: 0,
      comboT: 0,
      minerals: 0,
    };
  }

  /**
   * Go to menu.
   */
  toMenu(): void {
    this.type = 'menu';
    this.paused = false;
    this.zone.active = false;
    this.zone.alpha = 0;
    this.zone.collapseT = -1;
  }

  // ===== Aliases for compatibility with game.ts =====

  setTime(t: number): void {
    this.time = t;
  }

  setWave(w: number): void {
    this.wave.wave = w;
  }

  setScore(s: number): void {
    this.score.score = s;
  }

  setBest(b: number): void {
    this.score.best = b;
  }
}
