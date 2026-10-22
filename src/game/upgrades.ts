/**
 * Upgrades — перманентная система прокачки корабля.
 * Детали (parts) выпадают из врагов, сохраняются после смерти.
 * На экране прокачки детали тратятся на постоянные улучшения.
 */

import { playerHitChance } from "./balance/accuracy";
import { PHANTOM_CORE_RADII, SOLID_BULLET_RADII } from "./balance/player";
import { CANNON_MAX_BARRELS } from "./weapons/CannonWeapon";
import { MAX_ALLY_DRONES } from "./weapons/DroneWeapon";

/* ======================== Storage keys ======================== */

const LS_KEY = "rift9_upgrades";
const LS_BEST_WAVE = "rift9_best_wave";

/* ======================== Types ======================== */

export interface UpgradeTier {
  baseCost: number;      // стоимость базового уровня
  costStep: number;      // +к стоимости за каждый уровень
  maxLevel: number;      // макс. уровень (0 = выключено)
}

/** Все прокачиваемые линии прокачки. */
export type UpgradeKey =
  | "hull"
  | "damage"
  | "fireRate"
  | "speed"
  | "guns"
  | "drones"
  | "dashDuration"
  | "grazeMomentum"
  | "phantomHitbox"
  | "solidBullets"
  | "accuracy";

export interface PlayerUpgrades {
  parts: number;          // доступные детали (валюта)
  hull: number;           // уровень прокачки корпуса (+20 HP за уровень)
  damage: number;         // уровень урона (+2 HP за уровень)
  fireRate: number;       // уровень темпа стрельбы (+8% за уровень)
  speed: number;          // уровень скорости (+5% за уровень)
  guns: number;           // уровень орудий (+1 ствол за уровень, макс 5)
  drones: number;         // уровень дронов (+1 дрон за уровень, макс 8)
  dashDuration: number;   // уровень длительности рывка (+20% за уровень, макс 5)
  grazeMomentum: number;  // уровень поглощения импульса (макс 3)
  phantomHitbox: number;  // уровень фантомного хитбокса (макс 3)
  solidBullets: number;   // уровень твёрдых снарядов (макс 3)
  accuracy: number;       // уровень точности (шанс попадания орудий)
}

/* ======================== Default state ======================== */

export function defaultUpgrades(): PlayerUpgrades {
  return {
    parts: 0,
    hull: 0,
    damage: 0,
    fireRate: 0,
    speed: 0,
    guns: 0,
    drones: 0,
    dashDuration: 0,
    grazeMomentum: 0,
    phantomHitbox: 0,
    solidBullets: 0,
    accuracy: 0,
  };
}

/* ======================== Tier definitions ======================== */

/**
 * Стоимости подобраны так, чтобы суммарная стоимость ВСЕХ апгрейдов
 * (~26 140 деталей) совпадала с ожидаемым кумулятивным доходом деталей
 * к 50-й волне (~26 140 при полном сборе дропа).
 *
 * Пересчёт выполняется скриптом scripts/upgrade-cost-calc.mjs:
 * в него попадают те же линии и те же веса ценности, что и здесь.
 *
 * Вес ценности (что дороже):
 *  - drones (×1.3) — авто-DPS, самый сильный боевой апгрейд;
 *  - phantomHitbox (×1.25) — супер-защита (пустое ядро хитбокса);
 *  - dashDuration (×1.2) — супер-защита (дольше уклоняешься);
 *  - guns (×1.15) — мультипликативный рост урона;
 *  - hull / damage / fireRate / grazeMomentum (×1.0) — защита и огневая мощь;
 *  - accuracy (×1.0) — огневая мощь: точность упреждающего выстрела;
 *  - solidBullets (×0.9) — оборонительный эффект через перехват;
 *  - speed (×0.45) — чистая мобильность, самый дешёвый.
 */
export const UPGRADE_TIERS: Record<UpgradeKey, UpgradeTier> = {
  hull:         { baseCost: 81,  costStep: 60,  maxLevel: 10 },
  damage:       { baseCost: 102, costStep: 73,  maxLevel: 10 },
  fireRate:     { baseCost: 121, costStep: 81,  maxLevel: 10 },
  speed:        { baseCost: 16,  costStep: 12,  maxLevel: 8  },
  guns:         { baseCost: 214, costStep: 160, maxLevel: 4  },
  drones:       { baseCost: 341, costStep: 239, maxLevel: 7  },
  dashDuration: { baseCost: 145, costStep: 116, maxLevel: 5  },
  grazeMomentum:{ baseCost: 104, costStep: 78,  maxLevel: 3  },
  phantomHitbox:{ baseCost: 151, costStep: 113, maxLevel: 3  },
  solidBullets: { baseCost: 101, costStep: 75,  maxLevel: 3  },
  accuracy:     { baseCost: 170, costStep: 127, maxLevel: 4  },
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

/** Purchase an upgrade (deducts parts, increases level) */
export function purchaseUpgrade(upgrades: PlayerUpgrades, key: UpgradeKey): boolean {
  const level = upgrades[key];
  if (isMaxed(upgrades, key)) return false;
  const cost = upgradeCost(key, level);
  if (upgrades.parts < cost) return false;
  upgrades.parts -= cost;
  upgrades[key]++;
  saveUpgrades(upgrades); // persist immediately
  return true;
}

/* ======================== Persistence ======================== */

/**
 * Миграция сохранённых данных.
 * Раньше длительность рывка называлась dashCooldown, хотя по факту
 * апгрейд всегда повышал длительность рывка, а не кулдаун.
 */
function migrate(parsed: Partial<PlayerUpgrades> & { dashCooldown?: number }): PlayerUpgrades {
  const fresh = defaultUpgrades();
  const migrated: PlayerUpgrades = { ...fresh };
  for (const key of Object.keys(fresh) as UpgradeKey[]) {
    const value = parsed[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      migrated[key] = Math.max(0, Math.floor(value));
    }
  }
  // Старые сохранения не знают про dashDuration — переносим dashCooldown.
  if (migrated.dashDuration === 0 && typeof parsed.dashCooldown === "number") {
    migrated.dashDuration = Math.max(0, Math.floor(parsed.dashCooldown));
  }
  // Части — валюта: дробные значения недопустимы.
  migrated.parts = Math.max(0, Math.floor(migrated.parts));
  return migrated;
}

export function loadUpgrades(): PlayerUpgrades {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<PlayerUpgrades> & { dashCooldown?: number };
      if (parsed && typeof parsed === "object" && parsed.parts != null) {
        return migrate(parsed);
      }
    }
  } catch { /* ignore */ }
  return defaultUpgrades();
}

export function saveUpgrades(upgrades: PlayerUpgrades): void {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(upgrades));
  } catch { /* ignore */ }
}

/** Сбросить всю прокачку и детали */
export function resetUpgrades(): PlayerUpgrades {
  const fresh = defaultUpgrades();
  try {
    localStorage.removeItem(LS_KEY);
    localStorage.removeItem(LS_BEST_WAVE);
  } catch { /* ignore */ }
  return fresh;
}



/* ======================== Best wave tracking ======================== */

/** Загрузить лучший результат по волнам */
export function loadBestWave(): number {
  try {
    const raw = localStorage.getItem(LS_BEST_WAVE);
    if (raw) {
      const n = parseInt(raw, 10);
      if (!isNaN(n) && n > 0) return n;
    }
  } catch { /* ignore */ }
  return 1;
}

/** Сохранить лучший результат по волнам */
export function saveBestWave(wave: number): void {
  try {
    const current = loadBestWave();
    if (wave > current) {
      localStorage.setItem(LS_BEST_WAVE, String(wave));
    }
  } catch { /* ignore */ }
}

/* ======================== Apply upgrades to game values ======================== */

export interface AppliedUpgrades {
  /** Максимальный корпус: 100 базис + 20 за уровень. */
  baseHp: number;
  /** Множитель темпа стрельбы: 1.0 база + 0.08 за уровень. */
  fireRateMult: number;
  /** Множитель скорости: 1.0 база + 0.05 за уровень. */
  speedMult: number;
  /** Дополнительный урон снарядов: +2 за уровень. */
  damageBonus: number;
  /** Число постоянных стволов пушки: 1 база + уровень. */
  guns: number;
  /** Число постоянных дронов-компаньонов: уровень. */
  drones: number;
  /** Множитель длительности рывка: 1.0 база, +20% за уровень. */
  dashDurationMult: number;
  /** Уровень апгрейда «поглощение импульса»: сколько импульса даёт скорость. */
  momentumLevel: number;
  /** Радиус безопасного ядра хитбокса (0 — ядра нет). */
  phantomCoreRadius: number;
  /** Радиус твёрдого снаряда игрока (0 — снаряды бестелесные). */
  solidBulletRadius: number;
  /** Шанс попадания орудий игрока (0..1, всегда < 1) по уровню «точность». */
  hitChance: number;
}

/** Взять значение по уровню из таблицы радиусов. */
function radiusForLevel(table: number[], level: number): number {
  if (level <= 0) return 0;
  return table[Math.min(level, table.length - 1)];
}

export function applyUpgrades(upgrades: PlayerUpgrades): AppliedUpgrades {
  // hp: 100 base + 20 per hull level
  const baseHp = 100 + upgrades.hull * 20;

  // fire rate: 1.0 base + 0.08 per level
  const fireRateMult = 1.0 + upgrades.fireRate * 0.08;

  // speed: 1.0 base + 0.05 per level
  const speedMult = 1.0 + upgrades.speed * 0.05;

  // bullet damage: +2 per damage level
  const damageBonus = upgrades.damage * 2;

  // guns: base 1 + level, capped at CANNON_MAX_BARRELS
  const guns = Math.min(1 + upgrades.guns, CANNON_MAX_BARRELS);

  // drones: level, capped at MAX_ALLY_DRONES
  const drones = Math.min(upgrades.drones, MAX_ALLY_DRONES);

  // dash duration: base 1.0, +20% per level
  const dashDurationMult = 1.0 + upgrades.dashDuration * 0.2;

  // Поглощение импульса: уровень напрямую задаёт силу прироста скорости.
  const momentumLevel = Math.max(0, upgrades.grazeMomentum);

  // Фантомный хитбокс: радиус безопасного ядра корабля.
  const phantomCoreRadius = radiusForLevel(PHANTOM_CORE_RADII, upgrades.phantomHitbox);

  // Твёрдые снаряды: радиус физического снаряда игрока.
  const solidBulletRadius = radiusForLevel(SOLID_BULLET_RADII, upgrades.solidBullets);

  // Шанс попадания: линейно растёт с уровнем апгрейда, никогда не 100%.
  const hitChance = playerHitChance(upgrades.accuracy);

  return {
    baseHp,
    fireRateMult,
    speedMult,
    damageBonus,
    guns,
    drones,
    dashDurationMult,
    momentumLevel,
    phantomCoreRadius,
    solidBulletRadius,
    hitChance,
  };
}
