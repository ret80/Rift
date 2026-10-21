/**
 * LoadoutSystem — сборка строки снаряжения HUD.
 *
 * Строка складывается из двух независимых источников:
 *   • слоты оружия — их отдаёт WeaponManager;
 *   • слоты бонусов — их отдаёт состояние игрока и реестр бонусов.
 *
 * Бонусы с таймером живут ровно столько, сколько идёт бонус.
 * Мгновенные бонусы (ремонт, минерал) не имеют состояния —
 * они мигают в строке короткое время после подбора.
 */

import type { PickupKind } from "../balance";
import type { EventBus } from "../core/EventBus";
import type { PlayerBonuses } from "../weapons/Weapon";
import {
  BONUS_REGISTRY,
  bonusKindForPickup,
  INSTANT_BONUS_FLASH,
  type BonusKind,
} from "./BonusRegistry";
import type { LoadoutSlotData } from "./LoadoutTypes";

/** Источники данных для строки снаряжения. */
export interface LoadoutSources {
  /** Слоты оружия. */
  getWeaponSlots: () => LoadoutSlotData[];
  /** Текущие бонусы игрока. */
  getBonuses: () => PlayerBonuses;
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
      // Бонусы с таймером живут по своему таймеру, мигают только мгновенные.
      if (BONUS_REGISTRY[kind].duration > 0) return;
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
    const out: LoadoutSlotData[] = [...this.sources.getWeaponSlots()];
    const bonuses = this.sources.getBonuses();

    // Бонусы с таймером: остаток времени определяет заполнение кольца.
    const timed: Array<[BonusKind, number]> = [
      ["rate", bonuses.rateT],
      ["guns", bonuses.extraBarrelsT],
      ["dash", bonuses.dashT],
    ];
    for (const [kind, left] of timed) {
      if (left <= 0) continue;
      const meta = BONUS_REGISTRY[kind];
      out.push({
        kind,
        meta,
        progress: Math.min(1, left / meta.duration),
        remaining: left,
      });
    }

    // Мгновенные бонусы: короткая вспышка без таймера.
    for (const [kind, t] of this.flashes) {
      out.push({
        kind,
        meta: BONUS_REGISTRY[kind],
        progress: 1,
        remaining: t,
      });
    }

    out.sort((a, b) => a.meta.order - b.meta.order);
    return out;
  }
}
