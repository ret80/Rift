/**
 * ShipRenderer — общие функции отрисовки кораблей.
 * Убирает дублирование vertex data из RendererSystem.
 */

import type { Renderer } from "../../render";
import type { RGBA } from "../../render";

export function drawShipPoly(
  R: Renderer,
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
