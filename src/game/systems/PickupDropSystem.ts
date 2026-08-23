/**
 * PickupDropSystem — генерация дропов из убитых врагов.
 * Отвечает только за логику дропов (части, бонусы), без физики столкновений.
 */

import { dropChanceFor, type PickupKind } from "../balance";
import type { EventBus } from "../core/EventBus";

/* Pseudo-random multiplier constants (seed-based drop determination) */
const PSEUDO_RNG_A = 7.31;
const PSEUDO_RNG_B = 13.37;

/* Drop chances per enemy type (probability threshold for bonus drop) */
const DRONE_DROP_CHANCE = 0.035;
const HUNTER_DROP_CHANCE = 0.125;
const FIGHTER_DROP_CHANCE = 0.05;
const CRUISER_DROP_CHANCE = 0.125;

interface Enemy {
  x: number;
  y: number;
  kind: string;
  seed: number;
}

export class PickupDropSystem {
  private eventBus: EventBus;

  constructor(eventBus: EventBus) {
    this.eventBus = eventBus;
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

    // Pick bonus type based on enemy kind
    switch (enemyKind) {
      case "drone":
        return roll < DRONE_DROP_CHANCE ? "rate20" : "heal25";
      case "hunter":
        return roll < HUNTER_DROP_CHANCE ? "rate20" : "heal25";
      case "fighter":
        return roll < FIGHTER_DROP_CHANCE ? "gun" : "heal50";
      case "cruiser":
        return roll < CRUISER_DROP_CHANCE ? "drone" : "dash";
      case "carrier":
        const types: PickupKind[] = ["drone", "gun", "dash", "miner"];
        return types[Math.floor(roll * types.length)];
      default:
        return "heal25";
    }
   }

  /**
   * Handle enemy death — spawn parts and optionally a pickup.
   * This is the main entry point called after an enemy is killed.
   */
  onEnemyKilled(
    enemy: Enemy,
    spawnPickupFn: (kind: PickupKind, x: number, y: number, vx: number, vy: number) => void,
    spawnPartsFn: (amount: number, x: number, y: number) => void
  ): void {
    // Always drop parts (currency for upgrades)
    const parts = this.partsAmountFor(enemy.kind);
    spawnPartsFn(parts, enemy.x + (Math.random() - 0.5) * 10, enemy.y + (Math.random() - 0.5) * 10);

    // Occasionally drop special pickups too
    const kind = this.generateDrop(enemy.kind, enemy.seed);
    if (!kind) return;

    const vx = (Math.random() - 0.5) * 30;
    const vy = (Math.random() - 0.5) * 30;

    spawnPickupFn(kind, enemy.x + (Math.random() - 0.5) * 10, enemy.y + (Math.random() - 0.5) * 10, vx, vy);
  }
}
