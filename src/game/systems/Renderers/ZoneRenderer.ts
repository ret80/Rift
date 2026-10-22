/**
 * ZoneRenderer — отрисовка игровой зоны.
 * Извлечён из RendererSystem для разделения ответственности.
 */

import { C } from "../../balance";
import { rgba } from "../../math";
import type { Renderer } from "../../render";

export interface ZoneRenderState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
}

/**
 * Строит render-state из raw-данных зоны.
 */
export function buildZoneState(
  active: boolean,
  x: number,
  y: number,
  radius: number,
  targetRadius: number,
  alpha: number
): ZoneRenderState {
  return {
    active, x, y, radius, targetRadius, alpha,
  };
}

/**
 * Нарисовать зону (круг с волнами).
 */
export function renderZone(
  R: Renderer,
  zone: ZoneRenderState,
  time: number
): void {
  if (!zone.active || zone.alpha <= 0) return;
  const a = zone.alpha;
  const zr = zone.radius;
  const segs = 90;
  let px = 0;
  let py = 0;
  for (let i = 0; i <= segs; i++) {
    const ang = (i / segs) * Math.PI * 2;
    const wob =
      Math.sin(ang * 6 + time * 2.2) * 4 +
      Math.sin(ang * 11 - time * 3.1) * 2.5 +
      Math.sin(ang * 3 + time * 1.3) * 3;
    const rr = zr + wob;
    const x = zone.x + Math.cos(ang) * rr;
    const y = zone.y + Math.sin(ang) * rr;
    if (i > 0) R.pushLine(px, py, x, y, rgba(C.zone, 0.5 * a));
    px = x;
    py = y;
  }
  R.dashedCircle(zone.x, zone.y, zr * 0.96, rgba(C.zone, 0.3 * a), 24, time * 0.8);
}
