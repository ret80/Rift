/* ============================================================
   Player balance — stats, colors, dashes, starfield, camera,
   FPS, death animation.

   Параметры оружия (пушка, дроны, ракеты) живут в модуле
   оружия: src/game/weapons.
   ============================================================ */

import type { StarLayer } from "./waves";

/* ------------------------------ palette ------------------------------ */

export const C = {
  player: "#5ef2ff",
  mint: "#9dffe8",
  bullet: "#9dffe8",
  drone: "#ff5d7e",
  hunter: "#d8ff3e",
  fighter: "#ff8c42",
  cruiser: "#b06bff",
  carrier: "#ff5da2",
  rift: "#c06bff",
  riftCore: "#e6c8ff",
  zone: "#ff3b52",
  heal: "#7dffb8",
  white: "#eaffff",
  enemyBullet: "#ff8080",
  dash: "#ffd23e",
};

/* --------------------------- player & limits --------------------------- */

export const PLAYER_RADIUS = 13;
/** Reduced by 15% (310→248→211) then -20% more (211*0.8=169). */
export const PLAYER_MAX_SPEED = 500;
/** Drone base speed = 1.9 × player max speed. */
export const DRONE_BASE_SPEED = PLAYER_MAX_SPEED * 0.85;
/** Hunter speed = 1.1 × player max speed. */
export const HUNTER_SPEED = PLAYER_MAX_SPEED * 0.8;
/** Fighter base speed = 0.9 × player max speed. */
export const FIGHTER_BASE_SPEED = PLAYER_MAX_SPEED * 0.8;
/** Cruiser speed = 0.5 × player max speed. */
export const CRUISER_BASE_SPEED = PLAYER_MAX_SPEED * 0.5;
/** Carrier speed = 0.3 × player max speed. */
export const CARRIER_BASE_SPEED = PLAYER_MAX_SPEED * 0.3;
/** Thrust applied per second while the player holds a direction. */
export const PLAYER_ACCEL = 1500;
/** Zone expansion multiplier × PLAYER_MAX_SPEED — player can never catch it. */
export const ZONE_EXPAND_SPEED_MULT = 1.7;

/* ------------------------- player turret ------------------------- */

/** Seconds a fire-rate bonus lasts. */
export const RATE_BOOST_TIME = 10;

/** Seconds an extra-barrels bonus lasts. */
export const GUN_BONUS_TIME = 15;

/* ------------------------------ dash bonus ------------------------------ */

/** Seconds a dash bonus lasts. */
export const DASH_BONUS_TIME = 5;

/* --------------------------- hitbox & graze --------------------------- */

/** Базовый радиус хитбокса корабля (без фантомного апгрейда). */
export const PLAYER_HITBOX_RADIUS = 16;
/** Допуск вражеского снаряда до внешней границы хитбокса. */
export const PLAYER_BULLET_HIT_OFFSET = 12;
/** Ширина полосы касания (грейза) за границей хитбокса. */
export const GRAZE_BAND = 22;
/** Очки за одно касание вражеского снаряда. */
export const GRAZE_SCORE = 12;
/** Иммунитет после попадания, секунды. */
export const PLAYER_HIT_INVULN = 0.6;

/* --------------------------- quantum swap ability --------------------------- */

/** Перезарядка телепорт-подмены, секунды. */
export const QUANTUM_SWAP_COOLDOWN = 8;
/** Максимальная дальность подмены — дальше врага не достать. */
export const QUANTUM_SWAP_RANGE = 520;
/** Радиус взрыва в точке выхода игрока. */
export const QUANTUM_SWAP_BLAST_RADIUS = 110;
/** Урон взрыва подмены по врагам рядом с точкой выхода. */
export const QUANTUM_SWAP_BLAST_DAMAGE = 30;

/* ------------------------------ death animation ------------------------------ */

export const DEATH_ANIMATION_DURATION = 1.2; // seconds
export const DEATH_EXPLOSION_PARTICLES = 60;
export const DEATH_EXPLOSION_MIN_SPEED = 50;
export const DEATH_EXPLOSION_MAX_SPEED = 300; // 50 + 250
export const DEATH_EXPLOSION_MIN_LIFE = 0.3;
export const DEATH_EXPLOSION_MAX_LIFE = 1.1; // 0.3 + 0.8

/* ------------------------------ starfield ------------------------------ */

export const STAR_LAYERS: StarLayer[] = [
  { f: 0.12, chunk: 2600, count: 300, sMin: 0.5, sMax: 1.1, aMin: 0.14, aMax: 0.48 },
  { f: 0.35, chunk: 2000, count: 180, sMin: 0.7, sMax: 1.5, aMin: 0.18, aMax: 0.6 },
  { f: 0.6, chunk: 1600, count: 110, sMin: 1.0, sMax: 2.0, aMin: 0.24, aMax: 0.78 },
  { f: 0.9, chunk: 1300, count: 60, sMin: 1.4, sMax: 2.6, aMin: 0.31, aMax: 0.9 },
];

/* ------------------------------ camera ------------------------------ */

export const CAMERA_SMOOTHING = 8; // camera follow smoothing factor

/* ------------------------------ fps ------------------------------ */

export const FPS_SMOOTHING_FACTOR = 0.08; // EMA smoothing for FPS
