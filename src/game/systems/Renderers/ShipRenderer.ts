/**
 * ShipRenderer — общие функции отрисовки кораблей.
 * Убирает дублирование vertex data из RendererSystem.
 */

import type { IRenderer } from "../../render/index";
import type { RGBA } from "../../render/index";

export function drawShipPoly(
  R: IRenderer,
  x: number,
  y: number,
  angle: number,
  pts: Array<[number, number]>,
  c: RGBA
) {
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const world: Array<[number, number]> = pts.map(([px, py]) => [
    x + px * cos - py * sin,
    y + px * sin + py * cos,
  ]);
  R.polyline(world, true, c);
}
