/**
 * PickupCollection - handles player pickup collection.
 */

import type { EventBus } from '../core/EventBus';

interface PickupLike {
  x: number;
  y: number;
  r: number;
  kind?: string;
}

/**
 * Check player pickup collection.
 * Returns indices of pickups to remove.
 */
export function checkPickupCollection(
  eventBus: EventBus,
  pickups: PickupLike[],
  playerX: number,
  playerY: number,
  playerR: number
): Set<number> {
  const toRemove = new Set<number>();

  for (let i = pickups.length - 1; i >= 0; i--) {
    const p = pickups[i];
    const dx = playerX - p.x;
    const dy = playerY - p.y;
    const dist = Math.hypot(dx, dy);
    if (dist < playerR + p.r) {
      eventBus.publish('pickup_collected', {
        kind: p.kind || 'unknown',
        x: p.x,
        y: p.y,
      });
      toRemove.add(i);
    }
  }

  return toRemove;
}
