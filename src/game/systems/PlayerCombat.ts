/**
 * PlayerCombat — fire cooldown, shooting, missile launcher.
 */

import type { AudioManager } from './AudioManager';
import {
  PLAYER_FIRE_CD,
  MISSILE_SPEED,
  MISSILE_LIFE,
  MISSILE_DMG,
  MISSILE_TURN_RATE,
  MISSILE_LAUNCH_INTERVAL,
} from '../balance';
import {
  type PlayerState,
  getRateMult,
} from './PlayerState';

/* ============================== fire management ============================== */

/**
 * Update fire cooldown. Returns the remaining cooldown after decrement.
 */
export function updateFireCooldown(fireCd: number, dt: number): number {
  return Math.max(0, fireCd - dt);
}

/* ============================== missile launcher ============================== */

/**
 * Activate missile launcher for a given duration (seconds).
 */
export function activateMissileLauncher(
  state: PlayerState,
  duration: number,
): void {
  state.missileActive = true;
  state.missileCd = 0; // ready to fire immediately
  state.missilePort = 0;
}

/**
 * Update missile launcher and launch if ready.
 * @returns remaining duration or 0 if deactivated
 */
export function launchMissiles(
  state: PlayerState,
  missileDurationT: number,
  dt: number,
  enemies: Array<{ x: number; y: number; dead: boolean; r: number }>,
  bullets: Array<any>,
  playerX: number,
  playerY: number,
  playerVx: number,
  playerVy: number,
): number {
  if (!state.missileActive) return missileDurationT;

  // Decrease activation timer
  const remaining = missileDurationT - dt;
  if (remaining <= 0) {
    state.missileActive = false;
    return 0;
  }

  state.missileCd = Math.max(0, state.missileCd - dt);
  if (state.missileCd > 0) return remaining;

  // Find nearest living enemy
  let nearest: { x: number; y: number; r: number } | null = null;
  let nearDist = Infinity;

  for (const e of enemies) {
    if (e.dead) continue;
    const d = Math.hypot(e.x - playerX, e.y - playerY);
    if (d < nearDist) {
      nearDist = d;
      nearest = e;
    }
  }

  if (!nearest) return remaining;

  // Fire missile
  fireMissile(state, bullets, playerX, playerY, playerVx, playerVy, nearest);

  // Switch port and set cooldown
  state.missilePort = 1 - state.missilePort;
  state.missileCd = MISSILE_LAUNCH_INTERVAL;

  return remaining;
}

/**
 * Create a homing missile.
 */
export function fireMissile(
  state: PlayerState,
  bullets: Array<any>,
  playerX: number,
  playerY: number,
  playerVx: number,
  playerVy: number,
  target: { x: number; y: number; r: number },
): void {
  const port = state.missilePort;

  // Port offset: perpendicular to velocity direction
  const sp = Math.hypot(playerVx, playerVy) || 1;
  const vnx = playerVx / sp;
  const vny = playerVy / sp;

  // Port 0 = left side (-), Port 1 = right side (+)
  const portSide = port === 0 ? -1 : 1;
  const offX = -vny * portSide * 12;
  const offY = vnx * portSide * 12;

  const mx = playerX + offX;
  const my = playerY + offY;

  // Initial direction toward target
  const dx = target.x - mx;
  const dy = target.y - my;
  const dist = Math.hypot(dx, dy) || 1;

  const baseVx = (dx / dist) * MISSILE_SPEED;
  const baseVy = (dy / dist) * MISSILE_SPEED;

  // Add player velocity impulse (same as bullets)
  const playerVxImp = playerVx * 0.25;
  const playerVyImp = playerVy * 0.25;

  bullets.push({
    x: mx,
    y: my,
    vx: baseVx + playerVxImp,
    vy: baseVy + playerVyImp,
    life: MISSILE_LIFE,
    dmg: MISSILE_DMG,
    // Homing data
    homingTarget: { x: target.x, y: target.y, r: target.r },
    homingTurnRate: MISSILE_TURN_RATE,
  });
}
