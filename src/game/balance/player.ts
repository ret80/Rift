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
  shield: "#66e0ff",
  shieldStripe: "#ffd23e",
};

/* --------------------------- player & limits --------------------------- */

export const PLAYER_RADIUS = 13;
/** Reduced by 15% (310→248→211) then -20% more (211*0.8=169). */
export const PLAYER_MAX_SPEED = 380;
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

/** Seconds a health bonus lasts (base). */
export const HEAL_BONUS_TIME = RATE_BOOST_TIME;

/** Base health regeneration per second from the health bonus. */
export const HEAL_BASE = 10;

/* ------------------------------ shield ------------------------------ */

/** Полный запас энергии щита. */
export const SHIELD_ENERGY_MAX = 100;

/** Минимальный процент блокируемого урона (уровень прокачки 0). */
export const SHIELD_BLOCK_MIN = 0.05;
/** Прибавка к проценту блокировки за уровень прокачки. */
export const SHIELD_BLOCK_PER_LEVEL = 0.05;
/** Максимальный уровень линии «процент щита» (5% + 7×5% = 40%). */
export const SHIELD_BLOCK_MAX_LEVEL = 7;

/** Базовая скорость восстановления энергии, единиц в секунду. */
export const SHIELD_REGEN_BASE = 9;
/** Прибавка к скорости восстановления за уровень (множитель +30%). */
export const SHIELD_REGEN_PER_LEVEL = 0.3;
/** Максимальный уровень линии «скорость восстановления». */
export const SHIELD_REGEN_MAX_LEVEL = 5;

/**
 * Сколько энергии тратится на единицу поглощённого урона.
 * При блокировке 20% удар в 10 единиц поглощает 2 и снимает 20 энергии,
 * то есть запас тает заметно быстрее, чем успевает восстановиться.
 */
export const SHIELD_DRAIN_PER_DAMAGE = 10;

/** Время блокировки щита после полного разряда, секунды. */
export const SHIELD_OVERLOAD_TIME = 3;

/** Сколько секунд полоски щита мигают после срабатывания. */
export const SHIELD_FLASH_TIME = 0.35;

/** Процент блокируемого урона по уровню линии «процент щита» (0..1). */
export function shieldBlockPercent(level: number): number {
  const lv = Math.max(0, Math.min(SHIELD_BLOCK_MAX_LEVEL, level));
  return SHIELD_BLOCK_MIN + lv * SHIELD_BLOCK_PER_LEVEL;
}

/** Скорость восстановления энергии по уровню линии (единиц в секунду). */
export function shieldRegenPerSecond(level: number): number {
  const lv = Math.max(0, Math.min(SHIELD_REGEN_MAX_LEVEL, level));
  return SHIELD_REGEN_BASE * (1 + lv * SHIELD_REGEN_PER_LEVEL);
}

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
