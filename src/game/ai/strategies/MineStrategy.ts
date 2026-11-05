/**
 * MineStrategy — мина минёра.
 *
 * Мина неподвижна, но медленно вращается для читаемости. Она остаётся
 * препятствием на арене до подрыва о корпус игрока, попадания или
 * истечения времени жизни (таймер ведёт EnemySystem).
 */

import type { EnemyRef } from "../../ecs";
import { smoothVelocity } from "../../math";
import type { GameContext } from "../GameContext";
import type { IEnemyStrategy } from "../IEnemyStrategy";

/** Скорость гашения случайного импульса после расталкивания. */
const MINE_DAMPING = 8;

export class MineStrategy implements IEnemyStrategy {
  update(enemy: EnemyRef, _context: GameContext, dt: number): void {
    // Гасим любой импульс от расталкивания: мина не должна дрейфовать.
    smoothVelocity(enemy.velocity, 0, 0, MINE_DAMPING, dt);
    enemy.marker.angle += dt * 0.8;
  }
}
