/**
 * Upgrades — перманентная система прокачки корабля.
 * Детали (parts) выпадают из врагов, сохраняются после смерти.
 * На экране прокачки детали тратятся на постоянные улучшения.
 */

import { resetDroneLoadout } from "./drones/DroneSystem";
import { PLAYER_AIM_BASE_CHANCE } from "./balance/accuracy";
import {
  BASE_WEAPON_MODEL,
  type WeaponId,
  type WeaponLoadout,
  type WeaponLoadoutEntry,
  type WeaponModelUpgrades,
} from "./weapons/Weapon";
import type { TKey } from "../i18n";
import type { PersistencePort } from "./core/PersistencePort";

/* ======================== Storage keys ======================== */

const LS_KEY = "rift9_upgrades";
const LS_BEST_WAVE = "rift9_best_wave";
const LS_WEAPON_LOADOUT = "rift9_weapon_loadout";

/* ======================== Types ======================== */

export interface UpgradeTier {
  baseCost: number;      // стоимость базового уровня
  costStep: number;      // +к стоимости за каждый уровень
  maxLevel: number;      // макс. уровень (0 = выключено)
}

/** Все прокачиваемые линии прокачки. */
export type UpgradeKey =
  | "hull"
  | "speed"
  | "guns"
  | "drones"
  | "shield"
  | "shieldPercent"
  | "shieldRegen"
  | "fireRate"
  | "rateDuration"
  | "healDuration"
  | "healRate";

export interface PlayerUpgrades {
  parts: number;          // доступные детали (валюта)
  hull: number;           // уровень прокачки корпуса (+20 HP за уровень)
  speed: number;          // уровень скорости (+5% за уровень)
  guns: number;           // уровень орудий (+1 слот оружия за уровень, макс 5)
  drones: number;         // уровень дронов (+1 дрон за уровень, макс 8)
  shield: number;         // щит куплен (1) или ещё нет (0) — базовые 5% и 9 ед/с
  shieldPercent: number;  // процент блокировки урона щитом (5% + 5% за уровень)
  shieldRegen: number;    // скорость восстановления энергии щита (+30% за уровень)
  fireRate: number;       // уровень «Темп огня» — ускорение стрельбы всех орудий
  rateDuration: number;   // уровень «Время действия» бонуса «Темп огня»
  healDuration: number;   // уровень «Время действия» бонуса «Здоровье»
  healRate: number;       // уровень «Восстановление/с» бонуса «Здоровье»
}

/* ======================== Weapon loadout (armory) ======================== */

/** Линии апгрейда оружия в арсенале. */
export type WeaponStatKey = keyof WeaponModelUpgrades;

/** Пустая запись арсенала (оружие не куплено, всё на нуле). */
function emptyWeaponEntry(): WeaponLoadoutEntry {
  return { owned: false, model: { reload: 0, damage: 0, accuracy: 0 } };
}

/** Арсенал по умолчанию: куплена только пушка. */
export function defaultWeaponLoadout(): WeaponLoadout {
  return {
    cannon: { owned: true, model: { ...BASE_WEAPON_MODEL } },
    missile: emptyWeaponEntry(),
    drone: emptyWeaponEntry(),
    laser: emptyWeaponEntry(),
  };
}

/* ======================== Weapon stat scaling ======================== */

/** Максимальный уровень линии апгрейда оружия. */
export const WEAPON_STAT_MAX_LEVEL = 5;

/** Максимальный уровень точности оружия (0..1). */
export const WEAPON_ACCURACY_MAX = 0.97;

/** Скорость перезарядки за уровень (например, +4%). */
export const WEAPON_RELOAD_PER_LEVEL = 0.04;

/** Урон за уровень (например, +12%). */
export const WEAPON_DAMAGE_PER_LEVEL = 0.12;

/** Точность за уровень (например, +3%). */
export const WEAPON_ACCURACY_PER_LEVEL = 0.03;

/** Текущий множитель времени перезарядки оружия (меньше — быстрее). */
export function weaponReloadMult(model: WeaponModelUpgrades): number {
  const level = Math.max(0, Math.min(WEAPON_STAT_MAX_LEVEL, model.reload));
  return Math.max(0.2, 1 - level * WEAPON_RELOAD_PER_LEVEL);
}

/** Текущий множитель урона оружия. */
export function weaponDamageMult(model: WeaponModelUpgrades): number {
  const level = Math.max(0, Math.min(WEAPON_STAT_MAX_LEVEL, model.damage));
  return 1 + level * WEAPON_DAMAGE_PER_LEVEL;
}

/**
 * Эффективная точность оружия в бою: для пушки и лазера
 * персональная линия «точность» арсенала добавляется поверх базового шанса.
 */
export function weaponHitChance(id: WeaponId, model: WeaponModelUpgrades): number {
  if (id === "cannon" || id === "laser") {
    const level = Math.max(0, Math.min(WEAPON_STAT_MAX_LEVEL, model.accuracy));
    return Math.min(WEAPON_ACCURACY_MAX, PLAYER_AIM_BASE_CHANCE + level * WEAPON_ACCURACY_PER_LEVEL);
  }
  return PLAYER_AIM_BASE_CHANCE;
}

/** Стоимость уровня линии оружия (идёт после текущего уровня). */
export function weaponUpgradeCost(level: number): number {
  return 180 + 140 * Math.max(0, level);
}

/** Стоимость покупки оружия. Пушка стартовое — стоимость 0. */
export function weaponCost(id: WeaponId): number {
  return id === "cannon" ? 0 : 900;
}

/* ======================== Default state ======================== */

export function defaultUpgrades(): PlayerUpgrades {
  return {
    parts: 0,
    hull: 0,
    speed: 0,
    guns: 0,
    drones: 0,
    shield: 0,
    shieldPercent: 0,
    shieldRegen: 0,
    fireRate: 0,
    rateDuration: 0,
    healDuration: 0,
    healRate: 0,
  };
}

/* ======================== Tier definitions ======================== */

/**
 * Стоимости подобраны так, чтобы суммарная стоимость ВСЕХ апгрейдов
 * совпадала с ожидаемым кумулятивным доходом деталей к 50-й волне.
 *
 * Пересчёт выполняется скриптом scripts/upgrade-cost-calc.mjs:
 * в него попадают те же линии и те же веса ценности, что и здесь.
 *
 * Вес ценности (что дороже):
 *  - drones (×1.3) — авто-DPS, самый сильный боевой апгрейд;
 *  - shieldPercent (×1.25) — супер-защита: постоянный срез урона;
 *  - guns (×1.15) — мультипликативный рост урона;
 *  - shieldRegen (×1.1) — защита: быстрее возвращается щит;
 *  - hull (×1.0) — защита;
 *  - speed (×0.45) — чистая мобильность, самый дешёвый.
 *
 * Щит покупается один раз (линия shield, maxLevel 1) и открывает две
 * под-линии: процент блокировки и скорость восстановления.
 */
export const UPGRADE_TIERS: Record<UpgradeKey, UpgradeTier> = {
  hull:          { baseCost: 81,  costStep: 60,  maxLevel: 10 },
  speed:         { baseCost: 16,  costStep: 12,  maxLevel: 8  },
  guns:          { baseCost: 214, costStep: 160, maxLevel: 4  },
  drones:        { baseCost: 341, costStep: 239, maxLevel: 7  },
  shield:        { baseCost: 420, costStep: 0,   maxLevel: 1  },
  shieldPercent: { baseCost: 160, costStep: 120, maxLevel: 7  },
  shieldRegen:   { baseCost: 110, costStep: 85,  maxLevel: 5  },
  fireRate:      { baseCost: 121, costStep: 81,  maxLevel: 10 },
  rateDuration:  { baseCost: 145, costStep: 116, maxLevel: 5  },
  healDuration:  { baseCost: 145, costStep: 116, maxLevel: 5  },
  healRate:      { baseCost: 121, costStep: 81,  maxLevel: 10 },
};

/** Ключи локализации для каждой ветки прокачки (статический маппинг). */
export const UPGRADE_LABEL: Record<UpgradeKey, { label: TKey; desc: TKey }> = {
  hull:          { label: "upgrade.hull",          desc: "upgrade.hullDesc" },
  speed:         { label: "upgrade.speed",         desc: "upgrade.speedDesc" },
  guns:          { label: "upgrade.guns",          desc: "upgrade.gunsDesc" },
  drones:        { label: "upgrade.drones",        desc: "upgrade.dronesDesc" },
  shield:        { label: "upgrade.shield",        desc: "upgrade.shieldDesc" },
  shieldPercent: { label: "upgrade.shieldPercent", desc: "upgrade.shieldPercentDesc" },
  shieldRegen:   { label: "upgrade.shieldRegen",   desc: "upgrade.shieldRegenDesc" },
  fireRate:      { label: "upgrade.fireRate",      desc: "upgrade.fireRateDesc" },
  rateDuration:  { label: "upgrade.rateDuration",  desc: "upgrade.rateDurationDesc" },
  healDuration:  { label: "upgrade.healDuration",  desc: "upgrade.healDurationDesc" },
  healRate:      { label: "upgrade.healRate",      desc: "upgrade.healRateDesc" },
};

/* ======================== Cost calculation ======================== */

/** Calculate cost to upgrade to next level */
export function upgradeCost(key: UpgradeKey, level: number): number {
  const tier = UPGRADE_TIERS[key];
  return tier.baseCost + tier.costStep * level;
}

/** Check if upgrade can be purchased */
export function canAfford(upgrades: PlayerUpgrades, key: UpgradeKey, level: number): boolean {
  return upgrades.parts >= upgradeCost(key, level);
}

/** Check if upgrade has maxed out */
export function isMaxed(upgrades: PlayerUpgrades, key: UpgradeKey): boolean {
  return upgrades[key] >= UPGRADE_TIERS[key].maxLevel;
}

/* ======================== Persistence ======================== */

/** Миграция сохранённых данных. */
function migrate(parsed: Partial<PlayerUpgrades>): PlayerUpgrades {
  const fresh = defaultUpgrades();
  const migrated: PlayerUpgrades = { ...fresh };
  for (const key of Object.keys(fresh) as UpgradeKey[]) {
    const value = parsed[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      migrated[key] = Math.max(0, Math.floor(value));
    }
  }
  // Части — валюта: дробные значения недопустимы.
  migrated.parts = Math.max(0, Math.floor(migrated.parts));
  // Старые сейвы качали линии щита без отдельной покупки — считаем щит купленным.
  if (parsed.shield == null && (migrated.shieldPercent > 0 || migrated.shieldRegen > 0)) {
    migrated.shield = 1;
  }
  migrated.shield = Math.min(UPGRADE_TIERS.shield.maxLevel, migrated.shield);
  return migrated;
}

export function loadUpgrades(storage: PersistencePort): PlayerUpgrades {
  try {
    const raw = storage.get(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerUpgrades>;
      if (parsed && typeof parsed === "object" && parsed.parts != null) {
        return migrate(parsed);
      }
    }
  } catch { /* ignore */ }
  return defaultUpgrades();
}

export function saveUpgrades(upgrades: PlayerUpgrades, storage: PersistencePort): void {
  try {
    storage.set(LS_KEY, JSON.stringify(upgrades));
  } catch { /* ignore */ }
}

/* ======================== Weapon loadout persistence ======================== */

/** Прочитать сохранённую запись арсенала (с миграцией полей). */
function migrateWeaponEntry(raw: unknown): WeaponLoadoutEntry {
  const fresh: WeaponLoadoutEntry = emptyWeaponEntry();
  if (!raw || typeof raw !== "object") return fresh;
  const entry = raw as Partial<WeaponLoadoutEntry> & { model?: Partial<WeaponModelUpgrades> };
  fresh.owned = entry.owned === true;
  const model = entry.model;
  if (model && typeof model === "object") {
    for (const key of ["reload", "damage", "accuracy"] as const) {
      const value = model[key];
      if (typeof value === "number" && Number.isFinite(value)) {
        fresh.model[key] = Math.max(0, Math.floor(value));
      }
    }
  }
  return fresh;
}

export function loadWeaponLoadout(storage: PersistencePort): WeaponLoadout {
  const loadout = defaultWeaponLoadout();
  try {
    const raw = storage.get(LS_WEAPON_LOADOUT);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<Record<WeaponId, unknown>>;
      if (parsed && typeof parsed === "object") {
        for (const id of Object.keys(parsed) as WeaponId[]) {
          if (id in loadout) loadout[id] = migrateWeaponEntry(parsed[id]);
        }
      }
    }
  } catch { /* ignore */ }
  return loadout;
}

export function saveWeaponLoadout(loadout: WeaponLoadout, storage: PersistencePort): void {
  try {
    storage.set(LS_WEAPON_LOADOUT, JSON.stringify(loadout));
  } catch { /* ignore */ }
}

/** Сбросить арсенал: снова доступна только пушка. */
export function resetWeaponLoadout(storage: PersistencePort): WeaponLoadout {
  const fresh = defaultWeaponLoadout();
  storage.remove(LS_WEAPON_LOADOUT);
  return fresh;
}

/** Сбросить всю прокачку и детали */
export function resetUpgrades(storage: PersistencePort): PlayerUpgrades {
  const fresh = defaultUpgrades();
  storage.remove(LS_KEY);
  storage.remove(LS_BEST_WAVE);
  storage.remove(LS_WEAPON_LOADOUT);
  resetDroneLoadout(storage);
  return fresh;
}



/* ======================== Best wave tracking ======================== */

/** Загрузить лучший результат по волнам */
export function loadBestWave(storage: PersistencePort): number {
  try {
    const raw = storage.get(LS_BEST_WAVE);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch { /* ignore */ }
  return 1;
}

/** Сохранить лучший результат по волнам */
export function saveBestWave(wave: number, storage: PersistencePort): void {
  try {
    const current = loadBestWave(storage);
    if (wave > current) {
      storage.set(LS_BEST_WAVE, String(wave));
    }
  } catch { /* ignore */ }
}

/* ======================== Apply upgrades to game values ======================== */

export interface AppliedUpgrades {
  /** Максимальный корпус: 100 базис + 20 за уровень. */
  baseHp: number;
  /** Множитель темпа стрельбы: 1.0 база + 0.08 за уровень. */
  fireRateMult: number;
  /** Множитель длительности бонуса «темп огня»: 1.0 + 0.2 за уровень. */
  rateDurationMult: number;
  /** Множитель длительности бонуса «здоровье»: 1.0 + 0.2 за уровень. */
  healDurationMult: number;
  /** Множитель скорости восстановления бонуса «здоровье»: 1.0 + 0.2 за уровень. */
  healRateMult: number;
  /** Множитель скорости: 1.0 база + 0.05 за уровень. */
  speedMult: number;
  /** Число слотов оружия корабля: 1 база + уровень, макс 5. */
  weaponSlots: number;
  /** Число слотов под дроны корабля: 1 база + уровень, макс 8. */
  droneSlots: number;
  /** Щит куплен — без него блокировка урона и HUD-полоса не работают. */
  shieldOwned: boolean;
  /** Уровень линии «процент щита» (5% + 5% за уровень). */
  shieldBlockLevel: number;
  /** Уровень линии «скорость восстановления щита». */
  shieldRegenLevel: number;
}

export function applyUpgrades(upgrades: PlayerUpgrades): AppliedUpgrades {
  // hp: 100 base + 20 per hull level
  const baseHp = 100 + upgrades.hull * 20;

  // fire rate: 1.0 base + 0.08 per level
  const fireRateMult = 1.0 + upgrades.fireRate * 0.08;

  // rate bonus duration: 1.0 base + 0.2 per level
  const rateDurationMult = 1.0 + upgrades.rateDuration * 0.2;

  // heal bonus duration: 1.0 base + 0.2 per level
  const healDurationMult = 1.0 + upgrades.healDuration * 0.2;

  // heal bonus rate: 1.0 base + 0.2 per level
  const healRateMult = 1.0 + upgrades.healRate * 0.2;

  // speed: 1.0 base + 0.05 per level
  const speedMult = 1.0 + upgrades.speed * 0.05;

  // weapon slots: base 1 + level, capped at 5
  const weaponSlots = Math.min(1 + upgrades.guns, 5);

  // drone slots: base 1 + level, capped at 8
  const droneSlots = Math.min(1 + upgrades.drones, 8);

  // Щит: покупается один раз, после покупки работают под-линии.
  const shieldOwned = Math.max(0, upgrades.shield) > 0;

  return {
    baseHp,
    fireRateMult,
    rateDurationMult,
    healDurationMult,
    healRateMult,
    speedMult,
    weaponSlots,
    droneSlots,
    shieldOwned,
    shieldBlockLevel: shieldOwned ? Math.max(0, upgrades.shieldPercent) : 0,
    shieldRegenLevel: shieldOwned ? Math.max(0, upgrades.shieldRegen) : 0,
  };
}
