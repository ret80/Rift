/**
 * Элитные аффиксы (модификаторы врагов) Механики 3 (GDD §5.3).
 */

export type AffixId =
  | "armored"
  | "volatile"
  | "shielded"
  | "vampiric"
  | "hasted"
  | "splitting"
  | "precise"
  | "regenerating";

export interface AffixDef {
  id: AffixId;
  nameKey: string;
  hpMult: number;
  speedMult: number;
  damageMult: number;
  accuracyMult: number;
  onDeath?: "explode" | "split";
  shieldHpPercent?: number;
  lifesteal?: number;
  regenPercent?: number;
}

export const AFFIXES: Record<AffixId, AffixDef> = {
  armored: {
    id: "armored",
    nameKey: "affix.armored",
    hpMult: 1.5,
    speedMult: 0.8,
    damageMult: 1.0,
    accuracyMult: 1.0,
  },
  volatile: {
    id: "volatile",
    nameKey: "affix.volatile",
    hpMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.0,
    accuracyMult: 1.0,
    onDeath: "explode",
  },
  shielded: {
    id: "shielded",
    nameKey: "affix.shielded",
    hpMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.0,
    accuracyMult: 1.0,
    shieldHpPercent: 0.3,
  },
  vampiric: {
    id: "vampiric",
    nameKey: "affix.vampiric",
    hpMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.0,
    accuracyMult: 1.0,
    lifesteal: 0.05,
  },
  hasted: {
    id: "hasted",
    nameKey: "affix.hasted",
    hpMult: 1.0,
    speedMult: 1.4,
    damageMult: 1.0,
    accuracyMult: 1.2,
  },
  splitting: {
    id: "splitting",
    nameKey: "affix.splitting",
    hpMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.0,
    accuracyMult: 1.0,
    onDeath: "split",
  },
  precise: {
    id: "precise",
    nameKey: "affix.precise",
    hpMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.2,
    accuracyMult: 1.5,
  },
  regenerating: {
    id: "regenerating",
    nameKey: "affix.regenerating",
    hpMult: 1.0,
    speedMult: 1.0,
    damageMult: 1.0,
    accuracyMult: 1.0,
    regenPercent: 0.02,
  },
};

export const ELITE_CHANCE = 0.08; // 8%
export const ELITE_PACK_INTERVAL = 5; // каждые 5 волн
/** Радиус взрыва Летучего, px. */
export const VOLATILE_RADIUS = 80;
/** Множитель контактного урона взрыва Летучего. */
export const VOLATILE_DAMAGE_MULT = 15;
/** Множитель очков за убийство элиты. */
export const ELITE_SCORE_MULT = 1.5;
