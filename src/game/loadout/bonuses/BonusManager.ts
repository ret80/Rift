/**
 * BonusManager — владелец временных бонусов игрока.
 *
 * Построен по образцу WeaponManager (src/game/weapons/WeaponManager.ts):
 *   • хранит экземпляры всех бонусов и тикает их каждый кадр;
 *   • применяет бонус по поднятому пикапу (делегируя конкретному классу);
 *   • отдаёт снимок PlayerBonuses модулю оружия, физике и рендеру;
 *   • отдаёт слоты бонусов для строки снаряжения HUD.
 *
 * Менеджер не знает, что такое «пикап»; он знает только виды бонусов.
 * Мгновенные бонусы (ремонт, минерал) состояния не имеют и здесь
 * не хранятся — их применяет ApplyPickupSystem, а HUD мигает по событиям.
 */

import type { PickupKind } from "../../balance";
import type { LoadoutSlotData } from "../LoadoutTypes";
import type { PlayerBonuses } from "./Bonus";
import {
  bonusIdForPickup,
  createBonusRegistry,
  type BonusRegistryData,
} from "./BonusRegistry";

export class BonusManager {
  private bonuses: BonusRegistryData;

  constructor() {
    this.bonuses = createBonusRegistry();
  }

  /** Тик всех временных бонусов. */
  update(dt: number): void {
    for (const bonus of Object.values(this.bonuses)) {
      bonus.update(dt);
    }
  }

  /** Сброс всех бонусов — начало забега. */
  reset(): void {
    for (const bonus of Object.values(this.bonuses)) {
      bonus.reset();
    }
  }

  /**
   * Применить временный бонус по поднятому пикапу.
   * Пикапы оружия и мгновенные бонусы игнорируются (не наша зона).
   */
  applyPickup(kind: PickupKind): void {
    const id = bonusIdForPickup(kind);
    if (!id) return;
    this.bonuses[id]?.activate();
  }

  /** Снимок бонусов для модуля оружия (множитель темпа, стволы). */
  getBonuses(): PlayerBonuses {
    return {
      rateMult: this.getRateMult(),
      rateT: this.getRateT(),
      extraBarrels: this.getExtraBarrels(),
    };
  }

  /** Множитель темпа стрельбы от бонуса «темп огня». */
  getRateMult(): number {
    return this.bonuses.rate.getRateMult();
  }

  /** Остаток бонуса «темп огня», секунды. */
  getRateT(): number {
    return this.bonuses.rate.getRemaining();
  }

  /** Временно добавленные стволы пушки. */
  getExtraBarrels(): number {
    return this.bonuses.guns.getExtraBarrels();
  }

  /** Снимок бонусов для рендера игрока (кольцо темпа). */
  getRenderSnapshot(): { rateT: number; rateBoost: number } {
    return {
      rateT: this.getRateT(),
      rateBoost: this.getRateMult() - 1,
    };
  }

  /** Слоты активных временных бонусов для строки снаряжения. */
  getSlots(): LoadoutSlotData[] {
    const slots: LoadoutSlotData[] = [];
    for (const bonus of Object.values(this.bonuses)) {
      if (!bonus.isActive()) continue;
      slots.push({
        kind: bonus.id,
        meta: bonus.meta,
        progress: bonus.getProgress(),
        remaining: bonus.getRemaining(),
      });
    }
    return slots;
  }
}