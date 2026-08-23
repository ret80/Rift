/* ============================================================
   Zone constants — radius, edge, clear transitions, push forces,
   gun range, menu animations.
   ============================================================ */

/* ------------------------- zone constants ------------------------- */

export const ZONE_INITIAL_RADIUS = 17.25;
export const ZONE_EDGE_MARGIN = 40;
export const ZONE_EDGE_WARNING_DELAY = 0.3; // seconds before warning
export const ZONE_EDGE_DAMAGE_INTERVAL = 0.5; // seconds between damage ticks
export const ZONE_EDGE_DAMAGE_AMOUNT = 10; // damage per tick
export const ZONE_EDGE_SHAKE_STRENGTH = 4; // shake intensity
export const ZONE_EARLY_DAMAGE_THRESHOLD = 0.3; // don't damage before zone reaches 30% target

export const ZONE_CLEAR_BANNER_DELAY = 1.5; // seconds before showing wave clear banner
export const ZONE_CLEAR_EXPAND_START = 2.0; // seconds before starting zone expansion
export const ZONE_CLEAR_NEXT_WAVE = 3.0; // seconds before next wave
export const ZONE_CLEAR_EXPAND_DURATION = 1.0; // seconds for zone to expand during clear
export const ZONE_CLEAR_EXPAND_MULTIPLIER = 1.5; // zone expands to 1.5x target

export const ZONE_WALL_OVERDRIVE = 56;
export const ZONE_EDGE_HYSTERESIS = 26;
export const ZONE_PICKUP_MAGNET = 150;

export const ZONE_ASTEROID_PUSH_FORCE = 15; // force multiplier for pushing asteroids out
export const ZONE_ENEMY_PUSH_FORCE_COEFF = 8; // coefficient for enemy push force
export const ZONE_ENEMY_PUSH_FORCE_MAX = 200; // max push force for enemies

export const ZONE_GUN_RANGE = 420; // range for auto-fire guns

/* ------------------------------ zone expansion speed ------------------------------ */

/**
 * Calculate zone expansion speed based on player upgrades and temporary bonuses.
 * @param speedMult — multiplier from player speed upgrade (1.0 + level × 0.05)
 * @param currentMaxSpeed — base PLAYER_MAX_SPEED (169)
 * @param accelBonus — temporary acceleration bonus (0.0 by default, e.g. from pickup/buff)
 * @returns zone expansion speed in units/s
 */
export function zoneExpandSpeed(speedMult: number, currentMaxSpeed: number, accelBonus: number = 0): number {
  return currentMaxSpeed * speedMult * (1 + accelBonus);
}

/* ------------------------------ menu animation ------------------------------ */

export const MENU_ASTEROID_COUNT = 30;
export const MENU_RIFT_OPEN_TIME = 0.6;
export const MENU_RIFT_SPAWN_DELAY = 0.35;
export const MENU_RIFT_SPAWN_TIME = 0.28;
export const MENU_RIFT_CLOSE_TIME = 0.5;
export const MENU_RIFT_MIN_INTERVAL = 8;
export const MENU_RIFT_MAX_INTERVAL = 14;
export const MENU_ENEMY_MIN_SPEED = 80;
export const MENU_ENEMY_MAX_SPEED = 60; // additional speed range
export const MENU_EDGE_MARGIN = 150; // in DPR-scaled pixels
