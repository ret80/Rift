/**
 * PlayerMovement — physics, acceleration, friction, speed cap, angle.
 */

import { PLAYER_MAX_SPEED } from '../balance';
import type { Fx } from '../fx';
import { TAU, lerpAngle as lerpAngleMath } from '../math';
import {
  FRICTION_EXP,
  PLAYER_ACCELERATION,
  type PlayerState,
} from './PlayerState';

/**
 * Update player movement physics: acceleration, friction, speed cap,
 * and angle following velocity.
 *
 * @param state - mutable player state
 * @param dt - delta time in seconds
 * @param ax - input axis X (-1 to 1)
 * @param ay - input axis Y (-1 to 1)
 * @param _fx - particle effect system
 * @param isThrusting - whether player is currently thrusting
 * @param speedMult - множитель скорости (апгрейд скорости)
 * @returns object with updated thrusting and speed
 */
export function updateMovement(
  state: PlayerState,
  dt: number,
  ax: number,
  ay: number,
  _fx: Fx,
  isThrusting: boolean,
  speedMult: number = 1,
): { thrusting: boolean; speed: number } {
  state.thrusting = isThrusting;

  if (isThrusting) {
    const l = Math.hypot(ax, ay);
    if (l > 0) {
      const norm = l > 1 ? l : 1;
      ax /= norm;
      ay /= norm;
      const accel = PLAYER_ACCELERATION * speedMult;
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
  const cap = PLAYER_MAX_SPEED * speedMult;
  if (sp > cap) {
    state.vx *= cap / sp;
    state.vy *= cap / sp;
  }

  // Position update
  state.x += state.vx * dt;
  state.y += state.vy * dt;

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
