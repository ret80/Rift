/**
 * Достижения — условия, по которым открываются оружие и дроны.
 *
 * Награда не покупается: она выдаётся за карьерный прогресс (лучшая волна,
 * суммарные убийства и убитые боссы). Проверка производная — по сохранённой
 * статистике, поэтому отдельный список «полученных» достижений не нужен и
 * не может разойтись с фактами.
 */

import type { TKey } from "../../i18n";
import type { DroneId } from "../drones/Drone";
import type { WeaponArmoryId } from "../weapons/WeaponCatalog";

/** Метрика карьеры, по которой считается достижение. */
export type AchievementMetric = "bestWave" | "kills" | "bossKills";

/** Что открывает достижение. */
export type AchievementReward =
  | { kind: "weapon"; id: WeaponArmoryId }
  | { kind: "drone"; id: DroneId };

export interface Achievement {
  id: string;
  nameKey: TKey;
  descKey: TKey;
  metric: AchievementMetric;
  threshold: number;
  reward: AchievementReward;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    id: "first_convoy",
    nameKey: "meta.achFirstConvoy",
    descKey: "meta.achFirstConvoyDesc",
    metric: "bestWave",
    threshold: 6,
    reward: { kind: "drone", id: "striker" },
  },
  {
    id: "missile_volley",
    nameKey: "meta.achMissileVolley",
    descKey: "meta.achMissileVolleyDesc",
    metric: "bestWave",
    threshold: 8,
    reward: { kind: "weapon", id: "missile" },
  },
  {
    id: "beam_optics",
    nameKey: "meta.achBeamOptics",
    descKey: "meta.achBeamOpticsDesc",
    metric: "bestWave",
    threshold: 12,
    reward: { kind: "weapon", id: "laser" },
  },
  {
    id: "armorer",
    nameKey: "meta.achArmorer",
    descKey: "meta.achArmorerDesc",
    metric: "kills",
    threshold: 400,
    reward: { kind: "drone", id: "sentry" },
  },
  {
    id: "long_barrel",
    nameKey: "meta.achLongBarrel",
    descKey: "meta.achLongBarrelDesc",
    metric: "bestWave",
    threshold: 18,
    reward: { kind: "weapon", id: "railgun" },
  },
  {
    id: "shatter_volley",
    nameKey: "meta.achShatterVolley",
    descKey: "meta.achShatterVolleyDesc",
    metric: "bossKills",
    threshold: 5,
    reward: { kind: "weapon", id: "flak" },
  },
  {
    id: "chain_resonance",
    nameKey: "meta.achChainResonance",
    descKey: "meta.achChainResonanceDesc",
    metric: "kills",
    threshold: 1200,
    reward: { kind: "weapon", id: "tether" },
  },
  {
    id: "devourer",
    nameKey: "meta.achDevourer",
    descKey: "meta.achDevourerDesc",
    metric: "bestWave",
    threshold: 30,
    reward: { kind: "weapon", id: "devourer" },
  },
];

/** Прогресс карьеры для проверки достижений. */
export interface AchievementProgress {
  bestWave: number;
  kills: number;
  bossKills: number;
}

/** Выполнено ли условие достижения. */
export function achievementMet(
  achievement: Achievement,
  progress: AchievementProgress,
): boolean {
  return progress[achievement.metric] >= achievement.threshold;
}

/** Награда без привязки к достижению — для поиска по оружию/дрону. */
export function achievementForReward(
  kind: AchievementReward["kind"],
  id: string,
): Achievement | null {
  return ACHIEVEMENTS.find(
    (achievement) => achievement.reward.kind === kind && achievement.reward.id === id,
  ) ?? null;
}
