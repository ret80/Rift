/**
 * Ключи localStorage — единственный источник имён.
 *
 * Все домены и UI используют эти константы, чтобы формат и имя ключа
 * не расходились между записью и чтением. Легаси-ключи нужны только
 * для одноразовой миграции старых сохранений.
 */
export const STORAGE_KEYS = {
  best: "rift9_best",
  bestWave: "rift9_best_wave",
  credits: "rift9_credits",
  career: "rift9_career",
  metaTree: "rift9_meta_tree",
  doctrine: "rift9_doctrine",
  legacy: "rift9_legacy",
  threatLevel: "rift9_threat_level",
  lang: "rift9_lang",
  volumes: "rift9_volumes",
  menuTrack: "rift9_menu_track",
  combatTrack: "rift9_combat_track",
  physicsEngine: "rift9_physics_engine",
  debugFps: "rift9_debug_fps",
  debugGod: "rift9_debug_god",
  debugWave: "rift9_debug_wave",
  debugSpeed: "rift9_debug_speed",
  debugZone: "rift9_debug_zone",
  debugDetails: "rift9_debug_details",
  debugEnemies: "rift9_debug_enemies",
  debugEnemiesVersion: "rift9_debug_enemies_version",
  debugPickups: "rift9_debug_pickups",
} as const;

export type StorageKey = (typeof STORAGE_KEYS)[keyof typeof STORAGE_KEYS];

/** Легаси-ключ рекорда: писался до перехода на общий префикс rift9_. */
export const LEGACY_BEST_KEY = "voxbest";
