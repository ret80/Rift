/**
 * Типы мета-прогрессии Механики 3.
 * Зеркало Ночи (MetaTree), доктрины, наследие, асценсия, разблокировки.
 */

/* ======================== Кредиты ======================== */

export interface CreditState {
  credits: number;
  totalEarned: number;
}

/* ======================== Мета-таланты (Зеркало Ночи) ======================== */

export type MetaTalentBranch = "red" | "green";

export interface MetaTalentLevel {
  level: number;
  cost: number;
}

export interface MetaTalent {
  id: string;
  nameKey: string;          // ключ локализации названия
  descKey: string;          // ключ локализации описания
  branch: MetaTalentBranch; // ветка (красная/зелёная)
  maxLevel: number;
  costs: number[];          // стоимость каждого уровня
  prerequisite?: string;    // id таланта-предка
  effect: (level: number) => Record<string, number>;
}

export interface MetaTreeState {
  talents: Record<string, number>; // id → текущий уровень
  credits: number;
}

/* ======================== Разблокировки ======================== */

export type UnlockKind = "weapon" | "drone" | "ability" | "doctrine" | "legacy" | "talent";

export interface Unlock {
  id: string;
  kind: UnlockKind;
  nameKey: string;
  condition: UnlockCondition;
  unlocked: boolean;
  unlockedAt?: number; // timestamp
}

export type UnlockCondition =
  | { type: "wave"; wave: number }
  | { type: "kills"; enemyKind: string; count: number }
  | { type: "parts"; total: number }
  | { type: "credits"; total: number }
  | { type: "boss"; wave: number }
  | { type: "achievement"; achievementId: string }
  | { type: "default" };

export interface UnlockState {
  unlocks: Record<string, boolean>;
}

/* ======================== Доктрины ======================== */

export interface Doctrine {
  id: string;
  nameKey: string;
  descKey: string;
  effect: DoctrineEffect;
  unlockCondition: UnlockCondition;
  unlocked: boolean;
}

export interface DoctrineEffect {
  magnetBonus?: number;
  damageMult?: number;
  hpMult?: number;
  speedMult?: number;
  fireRateMult?: number;
  accuracyMult?: number;
  noDrones?: boolean;
  noHealing?: boolean;
  waveTimeMult?: number;
  enemyCountMult?: number;
  partsMult?: number;
  creditsMult?: number;
  randomModifier?: boolean;
  // ... расширяемо
}

export interface DoctrineState {
  selectedDoctrineId: string | null;
  unlockedDoctrines: string[];
}

/* ======================== Наследие (Legacy Artifacts) ======================== */

export interface LegacyArtifact {
  id: string;
  nameKey: string;
  descKey: string;
  effect: LegacyEffect;
  unlockCondition: UnlockCondition;
  unlocked: boolean;
}

export interface LegacyEffect {
  reviveOnce?: boolean;        // возрождение 1 раз с HP%
  reviveHpPercent?: number;
  critChance?: number;
  shieldEnergyBonus?: number;
  radarAnchors?: boolean;
  magnetBonus?: number;
  partsPerKill?: number;
  reflectDamage?: number;
  bonusDurationMult?: number;
  extraWeaponSlot?: boolean;
  extraLife?: boolean;
  showEnemyHp?: boolean;
  speedBonus?: number;
  dodgeChance?: number;
}

export interface LegacyState {
  slots: (string | null)[];     // id артефактов в слотах
  unlockedArtifacts: string[];
  maxSlots: number;
}

/* ======================== Асценсия (Threat Levels) ======================== */

export interface AscensionModifier {
  id: string;
  nameKey: string;
  descKey: string;
  tlCost: number;
  effect: AscensionEffect;
  unlocked: boolean;
}

export interface AscensionEffect {
  enemyHpMult?: number;
  enemyDamageMult?: number;
  enemySpeedMult?: number;
  enemyAccuracyMult?: number;
  zoneRadiusMult?: number;
  stormPeriodMult?: number;
  collapseTimeMult?: number;
  healingMult?: number;
  eliteChanceBonus?: number;
  newAffixes?: boolean;
  bossFrequency?: number;       // волны между боссами
  pincerChance?: number;
  magnetMult?: number;
  noRevive?: boolean;
  noHealing?: boolean;
  creditsMult?: number;
  partsMult?: number;
  mirrorWorld?: boolean;
  endlessScaling?: boolean;
}

export interface AscensionState {
  threatLevel: number;
  activeModifiers: string[];
  maxThreatLevel: number;
}

/* ======================== Статистика игрока ======================== */

export interface PlayerStats {
  totalKills: number;
  totalPartsEarned: number;
  totalCreditsEarned: number;
  totalRuns: number;
  totalWins: number;
  bestWave: number;
  fastestWaveClear: Record<number, number>; // wave → seconds
  bossKills: number;
  eliteKills: number;
  grazeCount: number;
  maxCombo: number;
}

/* ======================== Состояние забега ======================== */

export interface RunState {
  wave: number;
  parts: number;
  upgrades: Record<string, number>;
  weaponLoadout: Record<string, { owned: boolean; model: Record<string, number> }>;
  droneLoadout: Record<string, number>;
  activeDoctrine: string | null;
  activeLegacy: string[];
  startTime: number;
  damageTaken: number;
  kills: number;
  grazeCount: number;
  maxCombo: number;
  cleanWaves: number;
}
