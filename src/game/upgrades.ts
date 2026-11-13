/**
 * Upgrades — прокачка забега.
 *
 * Детали (parts) выпадают из врагов внутри забега и тратятся в ангаре
 * между волнами. Всё, что здесь куплено, сбрасывается при старте нового
 * забега: постоянными остаются только кредиты и таланты Эха Разлома.
 */

import type { MetaBonuses } from "./meta/types";
import { noMetaBonuses } from "./meta/types";
import { PLAYER_AIM_BASE_CHANCE } from "./balance/accuracy";
import { DEFAULT_PARAMS, type PlayerParams } from "./balance/params/GameParams";
import {
  BASE_WEAPON_MODEL,
  type WeaponId,
  type WeaponLoadout,
  type WeaponLoadoutEntry,
  type WeaponModelUpgrades,
} from "./weapons/Weapon";
import { ARMORY_WEAPON_COUNT } from "./weapons/WeaponCatalog";
import type { TKey } from "../i18n";
import type { PersistencePort } from "./core/PersistencePort";
import { STORAGE_KEYS } from "./core/storageKeys";
import { readNumber, writeNumber } from "./core/storage";

/* ======================== Storage keys ======================== */

const LS_BEST_WAVE = STORAGE_KEYS.bestWave;

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
  guns: number;           // уровень орудий (+1 слот оружия за уровень, макс 2)
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
    railgun: emptyWeaponEntry(),
    flak: emptyWeaponEntry(),
    tether: emptyWeaponEntry(),
    devourer: emptyWeaponEntry(),
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
  if (id === "cannon" || id === "laser" || id === "railgun" || id === "flak") {
    const level = Math.max(0, Math.min(WEAPON_STAT_MAX_LEVEL, model.accuracy));
    return Math.min(WEAPON_ACCURACY_MAX, PLAYER_AIM_BASE_CHANCE + level * WEAPON_ACCURACY_PER_LEVEL);
  }
  return PLAYER_AIM_BASE_CHANCE;
}

/** Стоимость уровня линии оружия (идёт после текущего уровня). */
export function weaponUpgradeCost(level: number): number {
  return 180 + 140 * Math.max(0, level);
}

/**
 * Стоимость покупки оружия. Пушка стартовая — стоимость 0.
 *
 * Ракета и лазер стоят 420 (было 900): первая покупка должна менять игру за
 * 1–2 забега, а не за 4–10. Это новая механика (самонаведение, мгновенный
 * луч), поэтому она дешёвая, а линии прокачки остаются дорогими.
 */
export function weaponCost(id: WeaponId): number {
  return id === "cannon" ? 0 : 420;
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
 * совпадала с ожидаемым кумулятивным доходом деталей к 25–30-й волне.
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
 *  - speed (×0.6) — мобильность: самая влиятельная на выживаемость линия
 *    после пересмотра цены (было ×0.45: 460 деталей за +40 % скорости
 *    делали обгон врагов бесплатным билетом в безопасность).
 *
 * Щит покупается один раз (линия shield, maxLevel 1) и открывает две
 * под-линии: процент блокировки и скорость восстановления.
 */
export const UPGRADE_TIERS: Record<UpgradeKey, UpgradeTier> = {
  hull:          { baseCost: 81,  costStep: 60,  maxLevel: 10 },
  // Скорость: 8 уровней дают в сумме ~2 080 деталей вместо 460. Мобильность
  // должна быть выбором с ценой, а не бесплатным билетом в безопасность.
  speed:         { baseCost: 160, costStep: 30,  maxLevel: 8  },
  // Орудия: 1 + уровень слотов, всего 7 оружий в арсенале (пушка, ракета,
  // лазер, рельса, картечница, цепь, пожиратель), поэтому 6 уровней —
  // последний открывает всё.
  guns:          { baseCost: 214, costStep: 160, maxLevel: 6  },
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
  // Первый уровень дешевле: игрок должен получить значимый апгрейд
  // за 1–2 коротких забега, а не копить на него 4–10 попыток.
  const base = level === 0 ? tier.baseCost * 0.75 : tier.baseCost;
  return Math.round(base + tier.costStep * level);
}

/* ======================== Best wave tracking ======================== */

/** Загрузить лучший результат по волнам */
export function loadBestWave(storage: PersistencePort): number {
  const n = readNumber(storage, LS_BEST_WAVE, 1);
  return n > 0 ? Math.floor(n) : 1;
}

/** Сохранить лучший результат по волнам */
export function saveBestWave(wave: number, storage: PersistencePort): void {
  const current = loadBestWave(storage);
  if (wave > current) {
    writeNumber(storage, LS_BEST_WAVE, wave);
  }
}

/* ======================== Apply upgrades to game values ======================== */

export interface AppliedUpgrades {
  /** Максимальный корпус: 100 базис + 20 за уровень, множитель меты. */
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
  /** Число слотов оружия корабля: 1 база + уровень, макс — число оружий в арсенале. */
  weaponSlots: number;
  /** Число слотов под дроны корабля: 1 база + уровень, макс 8. */
  droneSlots: number;
  /** Щит куплен — без него блокировка урона и HUD-полоса не работают. */
  shieldOwned: boolean;
  /** Уровень линии «процент щита» (5% + 5% за уровень). */
  shieldBlockLevel: number;
  /** Уровень линии «скорость восстановления щита». */
  shieldRegenLevel: number;
  /** Множитель деталей за забег из мета-талантов. */
  partsMult: number;
  /** Множитель кредитов за забег из мета-талантов. */
  creditsMult: number;
}

/**
 * Пересчитать боевые значения из прокачки забега и бонусов меты.
 * Мета применяется поверх забега, поэтому один и тот же забег на разных
 * уровнях Эха Разлома ощущается по-разному.
 */
export function applyUpgrades(
  upgrades: PlayerUpgrades,
  meta: MetaBonuses = noMetaBonuses(),
  player: PlayerParams = DEFAULT_PARAMS.player,
): AppliedUpgrades {
  // hp: базовый запас + 20 за уровень корпуса, затем множитель меты
  const baseHp = Math.round((player.baseHp + upgrades.hull * 20) * meta.hpMult);

  // fire rate: 1.0 base + 0.08 per level
  const fireRateMult = (1.0 + upgrades.fireRate * 0.08) * meta.fireRateMult;

  // rate bonus duration: 1.0 base + 0.2 per level
  const rateDurationMult = 1.0 + upgrades.rateDuration * 0.2;

  // heal bonus duration: 1.0 base + 0.2 per level
  const healDurationMult = 1.0 + upgrades.healDuration * 0.2;

  // heal bonus rate: 1.0 base + 0.2 per level
  const healRateMult = 1.0 + upgrades.healRate * 0.2;

  // speed: 1.0 base + 0.05 per level
  const speedMult = (1.0 + upgrades.speed * 0.05) * meta.speedMult;

  // weapon slots: base 1 + level + мета, но не больше числа оружий в арсенале
  const weaponSlots = Math.min(1 + upgrades.guns + meta.weaponSlots, ARMORY_WEAPON_COUNT);

  // drone slots: base 1 + level + мета, capped at 8
  const droneSlots = Math.min(1 + upgrades.drones + meta.droneSlots, 8);

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
    shieldBlockLevel: shieldOwned
      ? Math.max(0, upgrades.shieldPercent) + meta.shieldBlockLevel
      : 0,
    shieldRegenLevel: shieldOwned
      ? Math.max(0, upgrades.shieldRegen) + meta.shieldRegenLevel
      : 0,
    partsMult: meta.partsMult,
    creditsMult: meta.creditsMult,
  };
}
