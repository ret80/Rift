/**
 * PickupDropSystem — ECS-система генерации дропов из убитых врагов.
 *
 * Реактивная система: не обходит сущности в `process`, а подписывается на
 * единый сигнал гибели врага `enemy_killed`. Отвечает только за дропы
 * (детали и бонусы), не за движение или подбор пикапов.
 */

import { dropChanceFor, type PickupKind } from "../../balance";
import type { EventBus } from "../../core/EventBus";
import type { Rng } from "../../core/rng";
import { PhasedSystem, Phase } from "../SystemSchedule";

/* Pseudo-random multiplier constants (seed-based drop determination) */
const PSEUDO_RNG_A = 7.31;
const PSEUDO_RNG_B = 13.37;

interface Enemy {
  x: number;
  y: number;
  kind: string;
  seed: number;
}

export interface PickupDropHooks {
  /** Заспавнить пикап в мире. */
  spawnPickup(kind: PickupKind, x: number, y: number, vx: number, vy: number): void;
  /** Начислить детали прокачки. */
  addParts(amount: number): void;
  /** Множитель деталей за убийство (комбо, серия); по умолчанию 1. */
  getPartsMultiplier?: () => number;
}

export class PickupDropSystem extends PhasedSystem {
  private eventBus: EventBus;
  private hooks: PickupDropHooks;
  private enabledPickups: PickupKind[] | null = null;

  constructor(
    eventBus: EventBus,
    hooks: PickupDropHooks,
    /** Поток дропов: только разлёт и позиция выпавшего пикапа. */
    private readonly rng: Rng,
  ) {
    super(Phase.Upkeep);
    this.eventBus = eventBus;
    this.hooks = hooks;
    this.eventBus.subscribe("enemy_killed", (event) => {
      this.onEnemyKilled({
        x: event.payload.x,
        y: event.payload.y,
        kind: event.payload.kind,
        seed: (event.payload.seed ?? 0),
      });
    });
  }

  /** Реактивная система: работа идёт в подписке на `enemy_killed`. */
  process(): void {}

  /**
   * Set which pickup types are allowed to drop.
   * Null means all pickups enabled (default).
   */
  setEnabledPickups(pickups: PickupKind[] | null): void {
    this.enabledPickups = pickups;
  }

  /** Amount of parts dropped by each enemy type */
  partsAmountFor(enemyKind: string): number {
    switch (enemyKind) {
      case "drone": return 3;
      case "hunter": return 6;
      case "fighter": return 7;
      case "cruiser": return 16;
      case "carrier": return 32;
      case "miner": return 12;
      case "boss": return 100;
      case "mine": return 0;
      default: return 1;
    }
  }

  /** Determine what kind of bonus drops from a destroyed enemy */
  generateDrop(enemyKind: string, seed: number): PickupKind | null {
    // Мина — препятствие, а не добыча.
    if (enemyKind === "mine") return null;
    // Random roll using seed + deterministic offset
    const roll = (seed * PSEUDO_RNG_A + PSEUDO_RNG_B) % 1;
    const chance = dropChanceFor(enemyKind as never);
    if (roll >= chance) return null;

    // Pick bonus type based on enemy kind.
    // Normalize roll to 0..1 within the accepted range for even distribution.
    const normalized = roll / chance;

    let kind: PickupKind;
    switch (enemyKind) {
      case "drone":
        kind = normalized < 0.5 ? "rate20" : "heal";
        break;
      case "hunter":
        kind = normalized < 0.5 ? "rate20" : "heal";
        break;
      case "fighter":
        kind = normalized < 0.5 ? "gun" : "heal";
        break;
      case "cruiser":
        kind = normalized < 0.5 ? "drone" : "shield";
        break;
      case "carrier": {
        const types: PickupKind[] = ["drone", "gun", "shield", "missile", "laser", "quantum_swap"];
        kind = types[Math.floor(normalized * types.length)];
        break;
      }
      case "boss": {
        const types: PickupKind[] = ["drone", "gun", "shield", "missile", "laser", "quantum_swap"];
        kind = types[Math.floor(normalized * types.length)];
        break;
      }
      default:
        kind = "heal";
    }

    // Check if this pickup type is enabled
    if (this.enabledPickups && !this.enabledPickups.includes(kind)) {
      return null;
    }

    return kind;
   }

  /**
   * Handle enemy death — spawn parts and optionally a pickup.
   */
  private onEnemyKilled(enemy: Enemy): void {
    // Always drop parts (currency for upgrades). Комбо множит награду:
    // убийства в серии ценятся выше, чем те же убийства по одному.
    const parts = this.partsAmountFor(enemy.kind);
    const multiplier = this.hooks.getPartsMultiplier?.() ?? 1;
    this.hooks.addParts(Math.round(parts * multiplier));

    // Occasionally drop special pickups too
    const kind = this.generateDrop(enemy.kind, enemy.seed);
    if (!kind) return;

    const vx = (this.rng.next() - 0.5) * 30;
    const vy = (this.rng.next() - 0.5) * 30;

    this.hooks.spawnPickup(
      kind,
      enemy.x + (this.rng.next() - 0.5) * 10,
      enemy.y + (this.rng.next() - 0.5) * 10,
      vx,
      vy
    );
  }
}
