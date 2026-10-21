/**
 * GameState — типы состояния игры.
 * Класс GameState удалён как мёртвый код (никогда не использовался).
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
