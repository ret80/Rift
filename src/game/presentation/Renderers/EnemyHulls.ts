/**
 * EnemyHulls — геометрия корпусов врагов.
 *
 * Полигоны заданы в локальных координатах: нос смотрит по +X, масштаб —
 * игровые пиксели. Один источник правды и для рендера боя, и для силуэтов
 * в справке, поэтому иконка цели совпадает с кораблём на арене.
 */

import { C, EnemyKind } from "../../balance";

/** Точка корпуса в локальных координатах. */
export type HullPoint = readonly [number, number];

/**
 * Корпус врага. У мины, глушилки и вихря полигонального корпуса нет:
 * на арене они рисуются окружностью с шипами/лучами, и справка повторяет
 * эту же схему.
 */
export const ENEMY_HULLS: Partial<Record<EnemyKind, readonly HullPoint[]>> = {
  [EnemyKind.Drone]: [[9, 0], [-7, 7], [-4, 0], [-7, -7]],
  [EnemyKind.Hunter]: [[13, 0], [-8, 6], [-4, 0], [-8, -6]],
  [EnemyKind.Fighter]: [[14, 0], [-10, 9], [-5, 0], [-10, -9]],
  [EnemyKind.Cruiser]: [[22, 0], [8, 14], [-18, 12], [-18, -12], [8, -14]],
  [EnemyKind.Carrier]: [[30, 0], [10, 20], [-24, 16], [-24, -16], [10, -20]],
  [EnemyKind.Miner]: [[16, 0], [4, 11], [-12, 9], [-12, -9], [4, -11]],
  [EnemyKind.Boss]: [[46, 0], [24, 28], [-30, 24], [-42, 0], [-30, -24], [24, -28]],
  [EnemyKind.Needle]: [[17, 0], [2, 5], [-10, 4], [-10, -4], [2, -5]],
  [EnemyKind.Shieldbearer]: [[18, 0], [10, 13], [-10, 13], [-16, 0], [-10, -13], [10, -13]],
  [EnemyKind.Harpooner]: [[15, 0], [4, 9], [-12, 7], [-12, -7], [4, -9]],
  [EnemyKind.Splitter]: [[13, 0], [0, 11], [-13, 0], [0, -11]],
  [EnemyKind.HiveMother]: [[34, 0], [16, 22], [-20, 18], [-30, 0], [-20, -18], [16, -22]],
  [EnemyKind.Tractor]: [[20, 0], [8, 13], [-14, 10], [-18, 0], [-14, -10], [8, -13]],
};

/** Цвет корпуса врага. */
export function enemyColor(kind: EnemyKind): string {
  switch (kind) {
    case EnemyKind.Drone: return C.drone;
    case EnemyKind.Hunter: return C.hunter;
    case EnemyKind.Fighter: return C.fighter;
    case EnemyKind.Cruiser: return C.cruiser;
    case EnemyKind.Carrier: return C.carrier;
    case EnemyKind.Miner: return C.miner;
    case EnemyKind.Boss: return C.boss;
    case EnemyKind.Mine: return C.mine;
    case EnemyKind.Needle: return "#ffd166";
    case EnemyKind.Shieldbearer: return "#4cc9f0";
    case EnemyKind.Harpooner: return "#c77dff";
    case EnemyKind.Splitter: return "#90be6d";
    case EnemyKind.Jammer: return "#f72585";
    case EnemyKind.Vortex: return "#ff9f1c";
    case EnemyKind.HiveMother: return "#b5179e";
    case EnemyKind.Tractor: return "#56cfe1";
    default: return C.drone;
  }
}
