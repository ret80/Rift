/**
 * GameUpgrades — публичный фасад покупки/обновления апгрейдов.
 * Изолирует правила стоимости, сохранения и повторного применения
 * апгрейдов от фасада Game.
 */

import { UPGRADE_TIERS, upgradeCost, type PlayerUpgrades } from "../upgrades";
import type { GameContext } from "./GameContext";

export class GameUpgrades {
  constructor(private readonly ctx: GameContext) {}

  /** Re-apply upgrades from storage (after purchasing or reset). */
  refresh(): void {
    this.ctx.upgradeSystem.refresh();
    this.ctx.applyUpgrades(false);
  }

  /** Purchase upgrade bypassing cost check (debug/dev). */
  purchaseNoCost(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    const success = this.ctx.upgradeSystem.purchaseNoCost(key);
    if (success) {
      this.refresh();
    }
    return success;
  }

  /** Purchase upgrade with cost check (через порт хранилища). */
  purchaseCosted(key: keyof Omit<PlayerUpgrades, "parts">): boolean {
    const ups = this.ctx.upgradeSystem.playerUpgrades;
    const level = ups[key];
    const cost = upgradeCost(key, level);
    const tier = UPGRADE_TIERS[key];
    if (level >= tier.maxLevel) return false;
    if (ups.parts < cost) return false;
    ups.parts -= cost;
    (ups[key] as number) += 1;
    this.ctx.upgradeSystem.save();
    this.refresh();
    return true;
  }

  /** Get persistent player upgrades. */
  get(): PlayerUpgrades {
    return this.ctx.upgradeSystem.playerUpgrades;
  }
}