/**
 * LoadoutSystem — сборка строки снаряжения HUD.
 *
 * Строка складывается из двух независимых источников:
 *   • слоты оружия — их отдаёт WeaponManager;
 *   • слоты бонусов — их отдаёт BonusManager.
 *
 * Временные бонусы (темп огня, стволы, рывок) живут ровно столько,
 * сколько идёт бонус — их слоты приходят готовыми от BonusManager.
 * Мгновенные бонусы (ремонт, минерал) состояния не имеют — они мигают
 * в строке короткое время после подбора.
 */

import type { PickupKind } from "../balance";
import type { EventBus } from "../core/EventBus";
import type { BonusKind } from "./bonuses/Bonus";
import {
  bonusKindForPickup,
  INSTANT_BONUS_FLASH,
  INSTANT_BONUS_META,
} from "./bonuses/BonusRegistry";
import type { LoadoutSlotData } from "./LoadoutTypes";

/** Источники данных для строки снаряжения. */
export interface LoadoutSources {
  /** Слоты оружия. */
  getWeaponSlots: () => LoadoutSlotData[];
  /** Слоты активных временных бонусов. */
  getBonusSlots: () => LoadoutSlotData[];
  /** Слоты выданных активных способностей. */
  getAbilitySlots: () => LoadoutSlotData[];
}

export class LoadoutSystem {
  private sources: LoadoutSources;
  private flashes = new Map<BonusKind, number>();
  private slots: LoadoutSlotData[] = [];

  constructor(sources: LoadoutSources, eventBus: EventBus) {
    this.sources = sources;

    eventBus.subscribe("pickup_collected", (event) => {
      const kind = bonusKindForPickup(event.payload.kind as PickupKind);
      if (!kind) return;
      // Временные бонусы живут по своему таймеру, мигают только мгновенные.
      const meta = INSTANT_BONUS_META[kind];
      if (!meta || meta.duration > 0) return;
      this.flashes.set(kind, INSTANT_BONUS_FLASH);
    });
  }

  reset(): void {
    this.flashes.clear();
    this.slots = [];
  }

  /** Обновить таймеры мигания и пересобрать видимые слоты. */
  update(dt: number): void {
    for (const [kind, t] of this.flashes) {
      const left = t - dt;
      if (left <= 0) this.flashes.delete(kind);
      else this.flashes.set(kind, left);
    }
    this.slots = this.build();
  }

  /** Слоты, сейчас показанные в строке снаряжения. */
  getSlots(): LoadoutSlotData[] {
    return this.slots;
  }

  private build(): LoadoutSlotData[] {
    const out: LoadoutSlotData[] = [
      ...this.sources.getWeaponSlots(),
      ...this.sources.getBonusSlots(),
      ...this.sources.getAbilitySlots(),
    ];

    // Мгновенные бонусы: короткая вспышка без таймера.
    for (const [kind, t] of this.flashes) {
      const meta = INSTANT_BONUS_META[kind];
      if (!meta) continue;
      out.push({
        kind,
        meta,
        progress: 1,
        remaining: t,
      });
    }

    out.sort((a, b) => a.meta.order - b.meta.order);
    return out;
  }
}
