/**
 * RenderConstants — константы для систем рендеринга.
 * Убирает magic numbers из RendererSystem и Renderers.
 */

export const TAU = Math.PI * 2;

// Zone rendering
export const ZONE_SEGMENTS = 90;

// Wobble harmonics for zone circle
export const WOBBLE_HARMONICS = [6, 11, 3] as const;
export const WOBBLE_SPEEDS = [2.2, 3.1, 1.3] as const;
export const WOBBLE_AMPLITUDES = [4, 2.5, 3] as const;

// Heal pickup sizes
export const HEAL_SIZES = [7.5, 6.5, 5.5] as const; // heal100, heal50, heal25

// Dash pickup dimensions
export const DASH_PICKUP_LENGTH = 10;
export const DASH_PICKUP_WIDTH = 7;

// Miner pickup size
export const MINER_SIZE = 5.5;
export const MINER_SPIKE_OFFSET = 3.5;

// Mineral pickup size
export const MINERAL_SIZE = 6.5;

// Pickup glow
export const PICKUP_GLOW_BASE = 15;
export const PICKUP_GLOW_AMPLITUDE = 2;
export const PICKUP_GLOW_SPEED = 4;
export const PICKUP_ROT_SPEED = 1.4;
export const PICKUP_BLINK_LIFE_THRESHOLD = 3;
export const PICKUP_BLINK_FREQ = 7;

// Mine rendering
export const MINE_SPIKE_OFFSET = 5;
export const MINE_BLINK_THRESHOLD = -0.2;

// Enemy health bar threshold
export const ENEMY_HP_BAR_THRESHOLD = 40;
export const ENEMY_HP_BAR_OFFSET = 6;
export const ENEMY_HP_BAR_SEGMENTS = 10;

// Player rendering
export const PLAYER_THRUST_MIN_LEN = 10;
export const PLAYER_THUST_MAX_LEN = 20;
export const PLAYER_DASH_SHELL_PULSE_FREQ = 16;
export const PLAYER_DASH_SHELL_GLOW_DIVIDE = 0.4;
export const PLAYER_DASH_SHELL_FALLOFF_START = 1.0;
export const PLAYER_DASH_SHELL_FALLOFF_HZ_BASE = 6;
export const PLAYER_DASH_SHELL_FALLOFF_HZ_BOOST = 12;
export const PLAYER_DASH_SHELL_RATIO = 0.62;
export const PLAYER_TURRET_LEN = 8;
export const PLAYER_AIM_INDICATOR_START = 20;
export const PLAYER_AIM_INDICATOR_END = 30;
export const PLAYER_RATE_RING_RADIUS = 26;
export const PLAYER_RATE_RING_SEGMENTS = 30;
export const PLAYER_RATE_RING_BLINK_THRESHOLD = 0.2;
export const PLAYER_RATE_RING_BLINK_FREQ = 14;

// Bullet rendering
export const PLAYER_BULLET_LENGTH = 7;
export const ENEMY_BULLET_RADIUS = 5.5;
export const ENEMY_BULLET_CORE_RADIUS = 3.2;
export const ENEMY_HEAVY_BULLET_RADIUS = 3.4;
export const ENEMY_BULLET_NORMAL_LENGTH = 6;

// Menu scene
export const MENU_RIFT_CYCLE_DURATION = 4.0;
export const MENU_RIFT_OPENING_TIME = 0.6;
export const MENU_RIFT_OPENING_WIDEN_START = 0.42;
export const MENU_RIFT_SPAWN_END = 2.6;
export const MENU_RIFT_CLOSING_END = 3.6;
export const MENU_RIFT_WRIinkle_FREQ = 6;
export const MENU_RIFT_WRIinkle_AMPLITUDE_LEN = 0.04;
export const MENU_RIFT_WRIinkle_AMPLITUDE_WID = 0.06;
export const MENU_RIFT_WRIinkle_PHASE = 1.4;
export const MENU_RIFT_CORE_PULSE_FREQ = 18;
export const MENU_RIFT_CORE_PULSE_AMPLITUDE = 1.6;

// Menu enemies
export const MENU_ENEMY_COUNT = 3;
export const MENU_ENEMY_SPACING = TAU / 3;
export const MENU_ENEMY_BASE_ORBIT = 200;
export const MENU_ENEMY_ORBIT_INCREMENT = 46;
export const MENU_ENEMY_Y_BASE = -30;
export const MENU_ENEMY_Y_INCREMENT = 28;
export const MENU_ENEMY_ROTATE_SPEED_BASE = 0.5;
export const MENU_ENEMY_ROTATE_SPEED_INCREMENT = 0.12;
export const MENU_ENEMY_SHIP_SIZE = 10;
export const MENU_ENEMY_SHIP_POINTS: Array<[number, number]> = [
  [10, 0],
  [-8, 8],
  [-4, 0],
  [-8, -8],
];

// Ally drone rendering
export const ALLY_DRONE_ASSOCIATION_RADIUS = 58;
export const ALLY_DRONE_HP_RING_RADIUS = 11;
export const ALLY_DRONE_HP_RING_SEGMENTS = 10;
export const ALLY_DRONE_EXHAUST_BASE_LEN = 5;
export const ALLY_DRONE_EXHAUST_VAR_MIN = 3;
export const ALLY_DRONE_EXHAUST_VAR_MAX = 8;
