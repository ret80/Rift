/**
 * PlayerMovement — physics, acceleration, friction, speed cap, dash trails, angle.
 */

import { PLAYER_MAX_SPEED } from '../balance';
import type { Fx } from '../fx';
import { TAU, lerpAngle as lerpAngleMath, rand } from '../math';
import type { RGBA } from '../render';
import {
  DASH_ACCEL_MULT,
  DASH_SPEED_MULT,
  FRICTION_EXP,
  PLAYER_ACCELERATION,
  type PlayerState,
} from './PlayerState';

/**
 * Update player movement physics: acceleration, friction, speed cap,
 * dash trails, and angle following velocity.
 *
 * Временный бонус «рывок» — это параметр dashT (остаток времени рывка),
 * который приходит из BonusManager: физика не знает, как он тикает.
 *
 * @param state - mutable player state
 * @param dt - delta time in seconds
 * @param ax - input axis X (-1 to 1)
 * @param ay - input axis Y (-1 to 1)
 * @param fx - particle effect system
 * @param isThrusting - whether player is currently thrusting
 * @param dashT - remaining dash time (from BonusManager)
 * @returns object with updated thrusting and speed
 */
export function updateMovement(
  state: PlayerState,
  dt: number,
  ax: number,
  ay: number,
  fx: Fx,
  isThrusting: boolean,
  dashT: number,
): { thrusting: boolean; speed: number } {
  state.thrusting = isThrusting;
  const dashing = dashT > 0;

  if (isThrusting) {
    const l = Math.hypot(ax, ay);
    if (l > 0) {
      const norm = l > 1 ? l : 1;
      ax /= norm;
      ay /= norm;
      const accel = PLAYER_ACCELERATION * (dashing ? DASH_ACCEL_MULT : 1);
      state.vx += ax * accel * dt;
      state.vy += ay * accel * dt;
    }
  }

  // Friction
  const fr = Math.exp(-FRICTION_EXP * dt);
  state.vx *= fr;
  state.vy *= fr;

  // Speed cap
  const sp = Math.hypot(state.vx, state.vy);
  const cap = PLAYER_MAX_SPEED * (dashing ? DASH_SPEED_MULT : 1);
  if (sp > cap) {
    state.vx *= cap / sp;
    state.vy *= cap / sp;
  }

  // Position update
  state.x += state.vx * dt;
  state.y += state.vy * dt;

  // Dash speed-trail particles
  if (dashing && sp > 60) {
    for (let i = 0; i < 2; i++) {
      fx.emit({
        x: state.x - (state.vx / sp) * 10 + rand(-5, 5),
        y: state.y - (state.vy / sp) * 10 + rand(-5, 5),
        vx: -(state.vx / sp) * rand(40, 130),
        vy: -(state.vy / sp) * rand(40, 130),
        life: rand(0.2, 0.4),
        maxLife: 0.4,
        c: [1, 1, 1, 0.8] as RGBA,
        size: rand(1, 2.2),
      });
    }
  }

  // Angle follows velocity
  const oldAngle = state.angle;
  if (sp > 20) {
    state.angle = lerpAngleMath(
      state.angle,
      Math.atan2(state.vy, state.vx),
      1 - Math.exp(-10 * dt),
    );
  }
  let angleDelta = state.angle - oldAngle;
  while (angleDelta > Math.PI) angleDelta -= TAU;
  while (angleDelta < -Math.PI) angleDelta += TAU;

  return { thrusting: state.thrusting, speed: sp };
}
