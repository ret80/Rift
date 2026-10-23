/**
 * PickupDropSystem — генерация дропов из убитых врагов.
 * Отвечает только за логику дропов (части, бонусы).
 * Подписывается на событие enemy_killed — единый путь гибели врага.
 */

import { dropChanceFor, type PickupKind } from "../balance";
import type { EventBus } from "../core/EventBus";

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
}

export class PickupDropSystem {
  private eventBus: EventBus;
  private hooks: PickupDropHooks;
  private enabledPickups: PickupKind[] | null = null;

  constructor(eventBus: EventBus, hooks: PickupDropHooks) {
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
      case "drone": return 2;
      case "hunter": return 4;
      case "fighter": return 5;
      case "cruiser": return 12;
      case "carrier": return 25;
      default: return 1;
    }
  }

  /** Determine what kind of bonus drops from a destroyed enemy */
  generateDrop(enemyKind: string, seed: number): PickupKind | null {
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
        kind = normalized < 0.5 ? "rate20" : "heal25";
        break;
      case "hunter":
        kind = normalized < 0.5 ? "rate20" : "heal25";
        break;
      case "fighter":
        kind = normalized < 0.5 ? "gun" : "heal50";
        break;
      case "cruiser":
        kind = normalized < 0.5 ? "drone" : "shield";
        break;
      case "carrier": {
        const types: PickupKind[] = ["drone", "gun", "shield", "missile", "laser", "quantum_swap"];
        kind = types[Math.floor(normalized * types.length)];
        break;
      }
      default:
        kind = "heal25";
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
    // Always drop parts (currency for upgrades)
    const parts = this.partsAmountFor(enemy.kind);
    this.hooks.addParts(parts);

    // Occasionally drop special pickups too
    const kind = this.generateDrop(enemy.kind, enemy.seed);
    if (!kind) return;

    const vx = (Math.random() - 0.5) * 30;
    const vy = (Math.random() - 0.5) * 30;

    this.hooks.spawnPickup(
      kind,
      enemy.x + (Math.random() - 0.5) * 10,
      enemy.y + (Math.random() - 0.5) * 10,
      vx,
      vy
    );
  }
}
