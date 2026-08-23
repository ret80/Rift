/**
 * softResolveCollision - soft collision resolution between two bodies.
 * Does not bounce like a ball; instead slowly changes trajectory.
 * impulse — strength of the impulse (higher = stronger reaction).
 * The impulse vector is directed from center A to center B.
 */

import { MAX_VELOCITY } from './CollisionConstants';

/**
 * Soft collision between two bodies considering mass.
 * Returns new velocities for both bodies, clamped to MAX_VELOCITY.
 */
export function softResolveCollision(
  ax: number, ay: number, am: number, avx: number, avy: number,
  bx: number, by: number, bm: number, bvx: number, bvy: number,
  impulse: number
): { na: { vx: number; vy: number }; nb: { vx: number; vy: number } } {
  // Vector from A to B
  const dx = bx - ax;
  const dy = by - ay;
  const dist = Math.hypot(dx, dy) || 0.01;
  const nx = dx / dist;
  const ny = dy / dist;

  // Relative velocity along normal
  const dvx = avx - bvx;
  const dvy = avy - bvy;
  const dvn = dvx * nx + dvy * ny;

  // If bodies are separating — do nothing
  if (dvn <= 0) return { na: { vx: avx, vy: avy }, nb: { vx: bvx, vy: bvy } };

  const totalMass = am + bm;
  // Impulse proportional to relative velocity and weighted by masses
  // coefficient_of_restitution = 0.15 — very soft collisions
  const e = 0.15;
  const j = -(1 + e) * dvn / (1 / am + 1 / bm);

  const newAvx = avx + (j / am) * nx;
  const newAvy = avy + (j / am) * ny;
  const newBvx = bvx - (j / bm) * nx;
  const newBvy = bvy - (j / bm) * ny;

  // Clamp maximum transferred velocity for stability
  const maxVx = MAX_VELOCITY;
  const maxVy = MAX_VELOCITY;

  return {
    na: {
      vx: Math.max(-maxVx, Math.min(maxVx, newAvx)),
      vy: Math.max(-maxVy, Math.min(maxVy, newAvy)),
    },
    nb: {
      vx: Math.max(-maxVx, Math.min(maxVx, newBvx)),
      vy: Math.max(-maxVy, Math.min(maxVy, newBvy)),
    },
  };
}
