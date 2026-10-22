/**
 * PlayerState — состояние игрока: положение, корпус и движок.
 *
 * Временные бонусы сюда не входят: темп огня, доп. стволы и рывок живут
 * в модуле бонусов (src/game/loadout/bonuses) под управлением BonusManager.
 * Здесь остаётся только то, что относится к самому кораблю.
 */

import { massForRadius, PLAYER_RADIUS } from '../balance';
import type { PlayerRenderState } from './Renderers/PlayerRenderer';

/* ============================== constants ============================== */

export const PLAYER_ACCELERATION = 1500;
export const FRICTION_EXP = 2.4;
export const DASH_ACCEL_MULT = 1.8;
export const DASH_SPEED_MULT = 2.2;

/* ============================== interface ============================== */

export interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  invuln: number;
  thrusting: boolean;
  mass: number;
  /** Радиус безопасного ядра хитбокса (0 — хитбокс залит целиком). */
  core: number;
}

/* ============================== factory ============================== */

export function createPlayerState(): PlayerState {
  return {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    invuln: 0,
    thrusting: false,
    mass: massForRadius(PLAYER_RADIUS),
    core: 0,
  };
}

/* ============================== state helpers ============================== */

/** Reset internal state to defaults. */
export function resetPlayerState(state: PlayerState): void {
  Object.assign(state, createPlayerState());
}

/* ============================== render ============================== */
