/**
 * ZoneEdgePolicy — единое правило «насколько враг боится края зоны».
 *
 * Отворачивание от кромки нужно только для того, чтобы враг сам не вылетел
 * за границу. Пока игрок держался центра, отступ был оправдан. Но когда
 * игрок прячется в внешней трети зоны, полоса отступа превращается в
 * безопасный коридор: враги отворачивают раньше, чем доходят до игрока.
 *
 * Поэтому сила отворачивания масштабируется по положению игрока: у кромки
 * она падает до ZONE_EDGE_RIM_AVOID_SCALE (враг идёт за целью почти вплотную
 * к границе), в центре остаётся полной.
 */

import { ZONE_EDGE_RIM_AVOID_SCALE, ZONE_EDGE_RIM_FRACTION } from "../balance";
import type { GameContext } from "./GameContext";

/** Множитель силы отворачивания врага от края зоны (0..1). */
export function edgeAvoidScale(context: GameContext): number {
  const radius = context.zoneRadius;
  if (radius <= 0) return 1;
  const playerDist = Math.hypot(
    context.playerX - context.zoneX,
    context.playerY - context.zoneY,
  );
  return playerDist >= radius * ZONE_EDGE_RIM_FRACTION
    ? ZONE_EDGE_RIM_AVOID_SCALE
    : 1;
}

/** Игрок сейчас в внешней трети зоны (у кромки). */
export function playerOnRim(context: GameContext): boolean {
  return edgeAvoidScale(context) < 1;
}
