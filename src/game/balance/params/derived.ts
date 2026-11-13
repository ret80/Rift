/**
 * derived — значения, выведенные из `GameParams`.
 *
 * Здесь живёт вся арифметика связей: скорость врага в px/с, радиус волны.
 * Меняя первичный параметр (например `player.maxSpeed`), получаем
 * согласованное изменение всех зависимых величин без ручных множителей.
 */

import { EnemyKind } from "../enemyKinds";
import { clamp } from "../../math";
import type { GameParams } from "./GameParams";

/** Скорость врага в px/с: доля от максимальной скорости игрока. */
export function enemySpeed(params: GameParams, kind: EnemyKind): number {
  return params.player.maxSpeed * params.enemy.speedFactor[kind];
}

/** Радиус арены на волне: база волны × общий масштаб арены. */
export function arenaRadius(params: GameParams, wave: number): number {
  const { base, max, perWave } = params.zone.baseRadius;
  return clamp(base + (wave - 1) * perWave, base, max) * params.zone.radiusScale;
}
