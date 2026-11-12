/**
 * UnlockSystem — какие оружие и дроны открыты достижениями.
 *
 * Состояния не хранятся отдельно: список выводится из карьерной статистики
 * и лучшей волны. Поэтому достижение нельзя потерять или получить дважды,
 * а сброс прогресса честно закрывает награды.
 */

import type { PersistencePort } from "../core/PersistencePort";
import type { DroneId } from "../drones/Drone";
import { loadBestWave } from "../upgrades";
import {
  ACHIEVEMENTS,
  achievementMet,
  type Achievement,
  type AchievementProgress,
} from "./achievements";
import { loadCareerStats } from "./PlayerStats";

/** Оружие и дрон, доступные без достижений. */
const BASE_WEAPON = "cannon";
const BASE_DRONE: DroneId = "scout";

export class UnlockSystem {
  private readonly progress: AchievementProgress;

  constructor(progress: AchievementProgress) {
    this.progress = {
      bestWave: Math.max(1, Math.floor(progress.bestWave)),
      kills: Math.max(0, Math.floor(progress.kills)),
      bossKills: Math.max(0, Math.floor(progress.bossKills)),
    };
  }

  /** Собрать прогресс из хранилища: карьера + рекорд волны. */
  static load(storage: PersistencePort): UnlockSystem {
    const stats = loadCareerStats(storage);
    return new UnlockSystem({
      bestWave: Math.max(stats.bestWave, loadBestWave(storage)),
      kills: stats.kills,
      bossKills: stats.bossKills,
    });
  }

  /** Выполнено ли достижение. */
  isMet(achievement: Achievement): boolean {
    return achievementMet(achievement, this.progress);
  }

  /** Открытые виды оружия арсенала. */
  weaponIds(): Set<string> {
    const result = new Set<string>([BASE_WEAPON]);
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.reward.kind !== "weapon") continue;
      if (this.isMet(achievement)) result.add(achievement.reward.id);
    }
    return result;
  }

  /** Открытые виды дронов. */
  droneIds(): Set<DroneId> {
    const result = new Set<DroneId>([BASE_DRONE]);
    for (const achievement of ACHIEVEMENTS) {
      if (achievement.reward.kind !== "drone") continue;
      if (this.isMet(achievement)) result.add(achievement.reward.id);
    }
    return result;
  }

  isWeaponUnlocked(id: string): boolean {
    return this.weaponIds().has(id);
  }

  isDroneUnlocked(id: DroneId): boolean {
    return this.droneIds().has(id);
  }
}
