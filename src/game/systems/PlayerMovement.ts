/**
 * PlayerMovement — physics, acceleration, friction, speed cap, angle.
 * Работает с базовыми ECS-компонентами игрока (Position/Velocity) и узким
 * PlayerComponent (angle/thrusting), без отдельного DTO-объекта.
 */

import { PLAYER_MAX_SPEED } from '../balance';
import type { Fx } from '../fx';
import { TAU, lerpAngle as lerpAngleMath } from '../math';
import { FRICTION_EXP, PLAYER_ACCELERATION } from './PlayerState';
import type { PositionComponent } from '../ecs/components/PositionComponent';
import type { VelocityComponent } from '../ecs/components/VelocityComponent';
import type { PlayerComponent } from '../ecs/components/PlayerComponent';

/**
 * Update player movement physics: acceleration, friction, speed cap,
 * and angle following velocity.
 *
 * @param position - базовый компонент позиции (мутируется)
 * @param velocity - базовый компонент скорости (мутируется)
 * @param marker - узкий доменный компонент игрока (angle/thrusting мутируются)
 * @param dt - delta time in seconds
 * @param ax - input axis X (-1 to 1)
 * @param ay - input axis Y (-1 to 1)
 * @param _fx - particle effect system
 * @param isThrusting - whether player is currently thrusting
 * @param speedMult - множитель скорости (апгрейд скорости)
 * @param integratePosition - интегрировать ли позицию (false в кастом-физике)
 * @returns object with updated thrusting and speed
 */
export function updateMovement(
  position: PositionComponent,
  velocity: VelocityComponent,
  marker: PlayerComponent,
  dt: number,
  ax: number,
  ay: number,
  _fx: Fx,
  isThrusting: boolean,
  speedMult: number = 1,
  integratePosition: boolean = true,
): { thrusting: boolean; speed: number } {
  marker.thrusting = isThrusting;

  if (isThrusting) {
    const l = Math.hypot(ax, ay);
    if (l > 0) {
      const norm = l > 1 ? l : 1;
      ax /= norm;
      ay /= norm;
      const accel = PLAYER_ACCELERATION * speedMult;
      velocity.vx += ax * accel * dt;
      velocity.vy += ay * accel * dt;
    }
  }

  // Friction
  const fr = Math.exp(-FRICTION_EXP * dt);
  velocity.vx *= fr;
  velocity.vy *= fr;

  // Speed cap
  const sp = Math.hypot(velocity.vx, velocity.vy);
  const cap = PLAYER_MAX_SPEED * speedMult;
  if (sp > cap) {
    velocity.vx *= cap / sp;
    velocity.vy *= cap / sp;
  }

  // Position update
  // В режиме Planck позицию двигает физический движок, поэтому
  // интегрирование здесь отключается (скорость остаётся источником).
  if (integratePosition) {
    position.x += velocity.vx * dt;
    position.y += velocity.vy * dt;
  }

  // Angle follows velocity
  const oldAngle = marker.angle;
  if (sp > 20) {
    marker.angle = lerpAngleMath(
      marker.angle,
      Math.atan2(velocity.vy, velocity.vx),
      1 - Math.exp(-10 * dt),
    );
  }
  let angleDelta = marker.angle - oldAngle;
  while (angleDelta > Math.PI) angleDelta -= TAU;
  while (angleDelta < -Math.PI) angleDelta += TAU;

  return { thrusting: marker.thrusting, speed: sp };
}