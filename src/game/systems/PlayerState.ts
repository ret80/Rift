/**
 * PlayerState — state interface, initialization, HP, timers, and getters.
 */

import type { EventBus } from '../core/EventBus';
import type { PlayerRenderState } from './RendererSystem';
import { massForRadius, PLAYER_MAX_SPEED, PLAYER_RADIUS } from '../balance';
import { lerpAngle as lerpAngleMath } from '../math';

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
  guns: number;
  rateBoost: number;
  rateT: number;
  thrusting: boolean;
  dashT: number;
  aimA: number | null;
  mass: number;
  // Missile launcher
  missileActive: boolean;
  missilePort: number;
  missileCd: number;
  // Extra guns bonus (from pickup)
  extraGuns: number;
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
    guns: 1,
    rateBoost: 0,
    rateT: 0,
    thrusting: false,
    dashT: 0,
    aimA: null,
    mass: massForRadius(PLAYER_RADIUS),
    // Missile launcher
    missileActive: false,
    missilePort: 0,
    missileCd: 0,
    // Extra guns bonus
    extraGuns: 0,
    extraGunsT: 0,
  };
}

/* ============================== state helpers ============================== */

/** Reset internal state to defaults. */
export function resetPlayerState(state: PlayerState): void {
  const def = createPlayerState();
  Object.assign(state, def);
}

/* ============================== setters ============================== */

export function setGuns(state: PlayerState, n: number): void {
  state.guns = n;
}

export function setRateBoost(state: PlayerState, b: number): void {
  state.rateBoost = b;
}

export function setDashT(state: PlayerState, t: number): void {
  state.dashT = t;
}

/* ============================== HP ============================== */

export function addHp(state: PlayerState, delta: number): void {
  state.hp = Math.max(0, Math.min(state.maxHp, state.hp + delta));
}

export function setMaxHp(state: PlayerState, max: number): void {
  state.maxHp = max;
  state.hp = Math.min(state.hp, max);
}

export function resetHp(state: PlayerState): void {
  state.hp = state.maxHp;
}

export function setInvuln(state: PlayerState, t: number): void {
  state.invuln = t;
}

/* ============================== core ============================== */

export function hit(state: PlayerState, eventBus: EventBus, dmg: number): void {
  if (state.invuln > 0) return;
  state.hp -= dmg;
  if (state.hp <= 0) {
    state.hp = 0;
    eventBus.publish('game_over', {});
  }
}

export function heal(state: PlayerState, eventBus: EventBus, amount: number): void {
  state.hp = Math.min(state.maxHp, state.hp + amount);
  eventBus.publish('player_healed', { hp: state.hp });
}

export function addGun(state: PlayerState): void {
  state.guns++;
}

export function boostRate(state: PlayerState): void {
  state.rateBoost = Math.min(1.0, state.rateBoost + 0.2);
  state.rateT = 10; // 10 seconds boost
}

export function addGunBonus(state: PlayerState, count: number, duration: number): void {
  state.extraGuns = Math.min(5, state.extraGuns + count);
  state.extraGunsT = duration;
}

/* ============================== getters ============================== */

export function getRateMult(state: PlayerState): number {
  return 1 + state.rateBoost;
}

export function getRateT(state: PlayerState): number {
  return state.rateT;
}

/** Get effective guns count (capped at 5). */
export function getGuns(state: PlayerState): number {
  return Math.min(5, state.guns + state.extraGuns);
}

/** Get a copy of state with aimA from external source. */
export function getState(state: PlayerState, aimAngle: number | null): PlayerState {
  return {
    ...state,
    aimA: aimAngle,
    guns: getGuns(state),
  };
}

export function getPosition(state: PlayerState): { x: number; y: number } {
  return { x: state.x, y: state.y };
}

/** Returns mutable reference to player state for clamping/constraints */
export function getPlayerRef(state: PlayerState): { x: number; y: number; vx: number; vy: number } {
  return state;
}

export function getVelocity(state: PlayerState): { vx: number; vy: number } {
  return { vx: state.vx, vy: state.vy };
}

export function getHp(state: PlayerState): number {
  return state.hp;
}

export function getMaxHp(state: PlayerState): number {
  return state.maxHp;
}

export function getRateBoost(state: PlayerState): number {
  return state.rateBoost;
}

export function getDashT(state: PlayerState): number {
  return state.dashT;
}

export function getInvuln(state: PlayerState): number {
  return state.invuln;
}

export function isThrusting(state: PlayerState): boolean {
  return state.thrusting;
}

export function getAngle(state: PlayerState): number {
  return state.angle;
}

/* ============================== render ============================== */

export function getRenderState(
  state: PlayerState,
  aimAngle: number | null
): PlayerRenderState {
  return {
    x: state.x,
    y: state.y,
    angle: state.angle,
    aimA: aimAngle,
    hp: state.hp,
    maxHp: state.maxHp,
    invuln: state.invuln,
    guns: state.guns,
    rateT: state.rateT,
    rateBoost: state.rateBoost,
    dashT: state.dashT,
    thrusting: state.thrusting,
    pvx: state.vx,
    pvy: state.vy,
  };
}

/* ============================== timers ============================== */

/**
 * Update rate boost and extra guns timers.
 * Called every frame from the main update loop.
 */
export function updateTimers(state: PlayerState, dt: number): void {
  // Decrease rate boost timer
  if (state.rateT > 0) {
    state.rateT -= dt;
    if (state.rateT <= 0) {
      state.rateBoost = 0;
    }
  }

  // Decrease extra guns timer
  if (state.extraGunsT > 0) {
    state.extraGunsT -= dt;
    if (state.extraGunsT <= 0) {
      state.extraGuns = 0;
    }
  }
}
