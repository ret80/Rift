/**
 * Upgrades — перманентная система прокачки корабля.
 * Детали (parts) выпадают из врагов, сохраняются после смерти.
 * На экране прокачки детали тратятся на постоянные улучшения.
 */

/* ======================== Storage key ======================== */

const LS_KEY = "rift9_upgrades";

/* ======================== Types ======================== */

export interface UpgradeTier {
  baseCost: number;      // стоимость базового уровня
  costStep: number;      // +к стоимости за каждый уровень
  maxLevel: number;      // макс. уровень (0 = выключено)
}

export interface PlayerUpgrades {
  parts: number;          // доступные детали (валюта)
  hull: number;           // уровень прокачки корпуса (+20 HP за уровень)
  damage: number;         // уровень урона (+2 HP за уровень)
  fireRate: number;       // уровень темпа стрельбы (+8% за уровень)
  speed: number;          // уровень скорости (+5% за уровень)
  guns: number;           // уровень орудий (+1 ствол за уровень, макс 5)
  drones: number;         // уровень дронов (+1 дрон за уровень, макс 8)
  dashCooldown: number;   // уровень рывка (-10% кулдаун, макс 5)
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
    dashCooldown: 0,
  };
}

/* ======================== Tier definitions ======================== */

export const UPGRADE_TIERS: Record<keyof Omit<PlayerUpgrades, "parts">, UpgradeTier> = {
  hull:        { baseCost: 20,  costStep: 15, maxLevel: 10 },
  damage:      { baseCost: 25,  costStep: 18, maxLevel: 10 },
  fireRate:    { baseCost: 30,  costStep: 20, maxLevel: 10 },
  speed:       { baseCost: 20,  costStep: 15, maxLevel: 8  },
  guns:        { baseCost: 40,  costStep: 30, maxLevel: 4  },  // 1 (base) + 4 = 5 max
  drones:      { baseCost: 50,  costStep: 35, maxLevel: 7  },  // 0 (base) + 7 = 7, but max 8
  dashCooldown:{ baseCost: 25,  costStep: 20, maxLevel: 5  },
};

/* ======================== Cost calculation ======================== */

/** Calculate cost to upgrade to next level */
export function upgradeCost(key: keyof Omit<PlayerUpgrades, "parts">, level: number): number {
  const tier = UPGRADE_TIERS[key];
  return tier.baseCost + tier.costStep * level;
}

/** Check if upgrade can be purchased */
export function canAfford(upgrades: PlayerUpgrades, key: keyof Omit<PlayerUpgrades, "parts">, level: number): boolean {
  return upgrades.parts >= upgradeCost(key, level);
}

/** Check if upgrade has maxed out */
export function isMaxed(upgrades: PlayerUpgrades, key: keyof Omit<PlayerUpgrades, "parts">): boolean {
  return upgrades[key] >= UPGRADE_TIERS[key].maxLevel;
}

/** Purchase an upgrade (deducts parts, increases level) */
export function purchaseUpgrade(upgrades: PlayerUpgrades, key: keyof Omit<PlayerUpgrades, "parts">): boolean {
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

export function loadUpgrades(): PlayerUpgrades {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as PlayerUpgrades;
      // validate
      if (parsed.parts != null && parsed.hull != null && parsed.damage != null &&
          parsed.fireRate != null && parsed.speed != null && parsed.guns != null &&
          parsed.drones != null && parsed.dashCooldown != null) {
        return parsed;
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
  } catch { /* ignore */ }
  return fresh;
}

/** Сохранить прокачку в localStorage (для синхронизации in-memory) */
export function persistUpgrades(upgrades: PlayerUpgrades): void {
  saveUpgrades(upgrades);
}

/* ======================== Apply upgrades to game values ======================== */

export interface AppliedUpgrades {
  baseHp: number;
  bulletDmg: number;
  fireRateMult: number;
  speedMult: number;
  gunCount: number;
  droneCount: number;
  dashCooldownMult: number;
}

export function applyUpgrades(upgrades: PlayerUpgrades): AppliedUpgrades {
  // hp: 100 base + 20 per hull level
  const baseHp = 100 + upgrades.hull * 20;

  // bullet damage: 14 base + 2 per damage level
  const bulletDmg = 14 + upgrades.damage * 2;

  // fire rate: 1.0 base + 0.08 per level
  const fireRateMult = 1.0 + upgrades.fireRate * 0.08;

  // speed: 1.0 base + 0.05 per level
  const speedMult = 1.0 + upgrades.speed * 0.05;

  // guns: base 1 + level, capped at MAX_GUNS
  const gunCount = Math.min(1 + upgrades.guns, 5);

  // drones: 0 base + level, capped at 8
  const droneCount = Math.min(upgrades.drones, 8);

  // dash cooldown: base 1.0, reduced 10% per level
  const dashCooldownMult = Math.max(0.5, 1.0 - upgrades.dashCooldown * 0.1);

  return {
    baseHp,
    bulletDmg,
    fireRateMult,
    speedMult,
    gunCount,
    droneCount,
    dashCooldownMult,
  };
}
