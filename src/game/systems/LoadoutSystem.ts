/**
 * LoadoutSystem — tracks which weapon/bonus slots are live and how much
 * time is left on each of them. Feeds the HUD loadout row.
 *
 * Timed slots are derived from live game state (a bonus is on screen exactly
 * as long as its timer runs). Instant bonuses (heal / mineral / mine) have no
 * persistent state, so they flash briefly after being collected.
 */

import type { EventBus } from '../core/EventBus';
import type { PickupKind } from '../balance';
import {
  DASH_BONUS_TIME,
  GUN_BONUS_TIME,
  MISSILE_DURATION,
  RATE_BOOST_TIME,
} from '../balance/player';
import {
  INSTANT_BONUS_FLASH,
  LOADOUT_SORT,
  loadoutKindForPickup,
  type LoadoutKind,
  type LoadoutSlotData,
} from '../balance/loadout';

/** Live game values the loadout row reflects. */
export interface LoadoutSources {
  /** Remaining reload of the main cannon. */
  getFireCd: () => number;
  /** Full reload of the main cannon. */
  getFireCdMax: () => number;
  /** Remaining launcher lifetime (0 when the launcher is inactive). */
  getMissileT: () => number;
  /** Remaining fire-rate boost. */
  getRateT: () => number;
  /** Remaining extra-barrels bonus. */
  getGunsT: () => number;
  /** Remaining dash bonus. */
  getDashT: () => number;
  /** Number of living ally drones. */
  getDroneCount: () => number;
}

/** Kinds that only flash for a moment instead of holding a timer. */
const INSTANT_KINDS: LoadoutKind[] = ['heal', 'mineral', 'mine'];

export class LoadoutSystem {
  private sources: LoadoutSources;
  private flashes = new Map<LoadoutKind, number>();
  private slots: LoadoutSlotData[] = [];

  constructor(sources: LoadoutSources, eventBus: EventBus) {
    this.sources = sources;

    eventBus.subscribe('pickup_collected', (event) => {
      const kind = loadoutKindForPickup(event.payload.kind as PickupKind);
      if (kind && INSTANT_KINDS.includes(kind)) {
        this.flashes.set(kind, INSTANT_BONUS_FLASH);
      }
    });
  }

  reset(): void {
    this.flashes.clear();
    this.slots = [];
  }

  /** Tick the flash timers and rebuild the visible slot list. */
  update(dt: number): void {
    for (const [kind, t] of this.flashes) {
      const left = t - dt;
      if (left <= 0) this.flashes.delete(kind);
      else this.flashes.set(kind, left);
    }
    this.slots = this.build();
  }

  /** Slots currently shown in the HUD loadout row. */
  getSlots(): LoadoutSlotData[] {
    return this.slots;
  }

  private build(): LoadoutSlotData[] {
    const s = this.sources;
    const out: LoadoutSlotData[] = [];

    // Cannon — always present, ring shows the reload.
    const cdMax = s.getFireCdMax();
    const cd = s.getFireCd();
    out.push({
      kind: 'cannon',
      progress: cdMax > 0 ? 1 - Math.min(1, Math.max(0, cd) / cdMax) : 1,
      remaining: Math.max(0, cd),
    });

    // Missile launcher — a timed weapon, ring shows its remaining lifetime.
    const missileT = s.getMissileT();
    if (missileT > 0) {
      out.push({
        kind: 'missile',
        progress: Math.min(1, missileT / MISSILE_DURATION),
        remaining: missileT,
      });
    }

    // Drones — permanent weapon, no timer.
    if (s.getDroneCount() > 0) {
      out.push({ kind: 'drone', progress: 1, remaining: 0 });
    }

    // Timed bonuses.
    const rateT = s.getRateT();
    if (rateT > 0) {
      out.push({ kind: 'rate', progress: Math.min(1, rateT / RATE_BOOST_TIME), remaining: rateT });
    }

    const gunsT = s.getGunsT();
    if (gunsT > 0) {
      out.push({ kind: 'guns', progress: Math.min(1, gunsT / GUN_BONUS_TIME), remaining: gunsT });
    }

    const dashT = s.getDashT();
    if (dashT > 0) {
      out.push({ kind: 'dash', progress: Math.min(1, dashT / DASH_BONUS_TIME), remaining: dashT });
    }

    // Instant bonuses — a brief flash, no timer.
    for (const [kind, t] of this.flashes) {
      out.push({ kind, progress: 1, remaining: t });
    }

    out.sort((a, b) => LOADOUT_SORT[a.kind] - LOADOUT_SORT[b.kind]);
    return out;
  }
}
