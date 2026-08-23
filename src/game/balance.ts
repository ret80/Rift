/* ============================================================
   Barrel re-export for balance modules.
   Import from sub-modules for better tree-shaking.
   ============================================================ */

// Player stats, colors, turrets, drones, dashes, mines, missiles, starfield, camera, FPS
export {
  C,
  PLAYER_RADIUS,
  PLAYER_MAX_SPEED,
  DRONE_BASE_SPEED,
  HUNTER_SPEED,
  FIGHTER_BASE_SPEED,
  CRUISER_BASE_SPEED,
  CARRIER_BASE_SPEED,
  PLAYER_ACCEL,
  ZONE_EXPAND_SPEED_MULT,
  PLAYER_BULLET_SPEED,
  PLAYER_BULLET_LIFE,
  PLAYER_BULLET_DMG,
  PLAYER_FIRE_CD,
  ALLY_DRONE_ORBIT,
  ALLY_DRONE_RANGE,
  ALLY_DRONE_DMG,
  ALLY_DRONE_FIRE_CD,
  MAX_GUNS,
  MAX_ALLY_DRONES,
  GUN_OFFS,
  RATE_BOOST_TIME,
  DASH_TIME,
  DASH_ACCEL,
  DASH_SPEED,
  DASH_DMG,
  MINE_DELAY,
  MINE_RADIUS,
  MINE_DMG,
  MINE_LIFE,
  DEATH_ANIMATION_DURATION,
  DEATH_EXPLOSION_PARTICLES,
  DEATH_EXPLOSION_MIN_SPEED,
  DEATH_EXPLOSION_MAX_SPEED,
  DEATH_EXPLOSION_MIN_LIFE,
  DEATH_EXPLOSION_MAX_LIFE,
  MISSILE_SPEED,
  MISSILE_LIFE,
  MISSILE_DMG,
  MISSILE_TURN_RATE,
  MISSILE_LAUNCH_INTERVAL,
  MISSILE_DURATION,
  STAR_LAYERS,
  CAMERA_SMOOTHING,
  FPS_SMOOTHING_FACTOR,
} from "./balance/player";

// Enemy kinds, base defs, mass
export {
  EnemyKind,
  CRUISER_FIRE_RANGE,
  CRUISER_BULLET_SPEED,
  ENEMY_BASES,
  massForRadius,
} from "./balance/enemies";
export type { EnemyDef, EnemyBaseDef } from "./balance/enemies";

// Wave scaling, difficulty curves, pick logic
export {
  WAVE_BOUNDARIES,
  HP_SCALE_SEGMENTS,
  DMG_SCALE_SEGMENTS,
  hpScale,
  dmgScale,
  enemyDefFor,
  waveTotalFor,
  zoneRadiusFor,
  kindWeights,
  kindWeightsForEnabled,
  pickKindFor,
  pickKindForEnabled,
} from "./balance/waves";
export type { StarLayer } from "./balance/waves";

// Zone constants, expansion, menu animation
export {
  ZONE_INITIAL_RADIUS,
  ZONE_EDGE_MARGIN,
  ZONE_EDGE_WARNING_DELAY,
  ZONE_EDGE_DAMAGE_INTERVAL,
  ZONE_EDGE_DAMAGE_AMOUNT,
  ZONE_EDGE_SHAKE_STRENGTH,
  ZONE_EARLY_DAMAGE_THRESHOLD,
  ZONE_CLEAR_BANNER_DELAY,
  ZONE_CLEAR_EXPAND_START,
  ZONE_CLEAR_NEXT_WAVE,
  ZONE_CLEAR_EXPAND_DURATION,
  ZONE_CLEAR_EXPAND_MULTIPLIER,
  ZONE_WALL_OVERDRIVE,
  ZONE_EDGE_HYSTERESIS,
  ZONE_PICKUP_MAGNET,
  ZONE_ASTEROID_PUSH_FORCE,
  ZONE_ENEMY_PUSH_FORCE_COEFF,
  ZONE_ENEMY_PUSH_FORCE_MAX,
  ZONE_GUN_RANGE,
  zoneExpandSpeed,
  MENU_ASTEROID_COUNT,
  MENU_RIFT_OPEN_TIME,
  MENU_RIFT_SPAWN_DELAY,
  MENU_RIFT_SPAWN_TIME,
  MENU_RIFT_CLOSE_TIME,
  MENU_RIFT_MIN_INTERVAL,
  MENU_RIFT_MAX_INTERVAL,
  MENU_ENEMY_MIN_SPEED,
  MENU_ENEMY_MAX_SPEED,
  MENU_EDGE_MARGIN,
} from "./balance/zones";

// Drop chances, pickup kinds, asteroid kinds
export { dropChanceFor, ALL_PICKUP_KINDS, pickupDisplayKey } from "./balance/drops";
export type { PickupKind, AsteroidKind } from "./balance/drops";
