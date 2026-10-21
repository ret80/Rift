/**
 * PlayerState — состояние игрока: положение, корпус, таймеры бонусов.
 *
 * Оружие здесь не хранится: стволы, ракеты и дроны живут в модуле
 * оружия, а в состоянии остаются только временные бонусы игрока.
 */

import type { PlayerRenderState } from './RendererSystem';
import { massForRadius, PLAYER_RADIUS } from '../balance';

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
  /** Множитель темпа огня от временного бонуса. */
  rateBoost: number;
  /** Остаток бонуса «темп огня». */
  rateT: number;
  thrusting: boolean;
  dashT: number;
  mass: number;
  /** Временно добавленные стволы (пикап «стволы»). */
  extraGuns: number;
  /** Остаток бонуса «доп. стволы». */
  extraGunsT: number;
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
    rateBoost: 0,
    rateT: 0,
    thrusting: false,
    dashT: 0,
    mass: massForRadius(PLAYER_RADIUS),
    extraGuns: 0,
    extraGunsT: 0,
  };
}

/* ============================== state helpers ============================== */

/** Reset internal state to defaults. */
export function resetPlayerState(state: PlayerState): void {
  Object.assign(state, createPlayerState());
}

/* ============================== timers ============================== */

/**
 * Обновить таймеры временных бонусов.
 * Вызывается каждый кадр из основного цикла обновления.
 */
export function updateTimers(state: PlayerState, dt: number): void {
  if (state.rateT > 0) {
    state.rateT -= dt;
    if (state.rateT <= 0) state.rateBoost = 0;
  }

  if (state.extraGunsT > 0) {
    state.extraGunsT -= dt;
    if (state.extraGunsT <= 0) state.extraGuns = 0;
  }
}

/* ============================== render ============================== */

export function getRenderState(
  state: PlayerState,
  aimAngle: number | null,
  barrelCount: number
): PlayerRenderState {
  return {
    x: state.x,
    y: state.y,
    angle: state.angle,
    aimA: aimAngle,
    hp: state.hp,
    maxHp: state.maxHp,
    invuln: state.invuln,
    guns: barrelCount,
    rateT: state.rateT,
    rateBoost: state.rateBoost,
    dashT: state.dashT,
    thrusting: state.thrusting,
    pvx: state.vx,
    pvy: state.vy,
  };
}
