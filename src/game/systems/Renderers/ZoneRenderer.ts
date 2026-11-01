/**
 * ZoneRenderer — отрисовка игровой зоны.
 *
 * Визуал зоны (рисуется в плоском слое: под объектами сцены и без bloom):
 *   • внутренний красный круг — ровно реальный радиус зоны;
 *   • наружный круг на radius + ZONE_WARNING_BAND;
 *   • полоса между ними залита ровным красным без градиента; у внутреннего
 *     края полоса дополнительно прозрачнее (ZONE_FILL_INNER_MULT);
 *   • вся заливка намеренно еле заметна — зона не должна перетягивать взгляд;
 *   • пока игрок снаружи, у края экрана висит указатель направления на зону.
 *
 * Извлечён из RendererSystem для разделения ответственности.
 */

import {
    C,
    ZONE_EDGE_ALPHA,
    ZONE_FILL_ALPHA,
    ZONE_FILL_INNER_FADE,
    ZONE_FILL_INNER_MULT,
    ZONE_OUTER_EDGE_ALPHA,
    ZONE_WARNING_BAND,
} from "../../balance";
import { rgba } from "../../math";
import type { IRenderer } from "../../render/index";

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

/** Порог, с которого игрок считается снаружи (совпадает с ZoneEdgeDamage). */
const OUTSIDE_EPSILON = 4;

/**
 * Нарисовать зону: заливка-полоса + чёткая граница.
 */
export function renderZone(
  R: IRenderer,
  zone: ZoneRenderState,
  time: number
): void {
  if (!zone.active || zone.alpha <= 0) return;
  const a = zone.alpha;
  const zr = zone.radius;
  if (zr <= 0.5) return;

  // На старте волны зона растёт из точки: не даём полосе быть шире самой
  // зоны, иначе первые кадры выглядят как красное пятно.
  const band = Math.min(ZONE_WARNING_BAND, zr);

  if (band > 0.5) {
    const fill = ZONE_FILL_ALPHA * a;
    // Ровная заливка без градиента. Узкая подполоса у внутреннего края
    // делается чуть прозрачнее, чтобы переход от «чистой» арены к кольцу
    // не читался как жёсткая линия.
    const innerEdge = zr + band * ZONE_FILL_INNER_FADE;
    const innerFill = fill * ZONE_FILL_INNER_MULT;
    R.fillRing(zone.x, zone.y, zr, innerEdge, rgba(C.zone, innerFill), rgba(C.zone, innerFill), 128);
    R.fillRing(zone.x, zone.y, innerEdge, zr + band, rgba(C.zone, fill), rgba(C.zone, fill), 128);
  }

  // Внутренний круг — реальная граница зоны. Пульс минимальной амплитуды:
  // зона должна быть еле заметной, а не мигающим «неоновым» ободком.
  const pulse = 0.9 + 0.1 * Math.sin(time * 2);
  R.circle(zone.x, zone.y, zr, rgba(C.zone, ZONE_EDGE_ALPHA * a * pulse), 128);

  // Внешняя граница полосы — только намёк, чтобы полоса не «висела» в пустоте.
  if (band > 0.5) {
    R.circle(zone.x, zone.y, zr + band, rgba(C.zone, ZONE_OUTER_EDGE_ALPHA * a), 96);
  }
}

/**
 * Указатель направления на зону, пока игрок снаружи.
 *
 * Рисуется в screen-режиме: камера следует за игроком, поэтому сама зона
 * легко уходит за экран, и тост через 2 секунды уже не помогает.
 *
 * @param screenW/screenH — размер вьюпорта в CSS-пикселях.
 * @param dpr — множитель device-пикселей рендерера.
 */
export function renderZoneReturnIndicator(
  R: IRenderer,
  zone: ZoneRenderState,
  playerX: number,
  playerY: number,
  screenW: number,
  screenH: number,
  dpr: number,
  time: number
): void {
  if (!zone.active || zone.radius <= 0) return;

  const dx = zone.x - playerX;
  const dy = zone.y - playerY;
  const dist = Math.hypot(dx, dy);
  if (dist <= zone.radius + OUTSIDE_EPSILON) return;

  const w = screenW * dpr;
  const h = screenH * dpr;
  const ux = dx / dist;
  const uy = dy / dist;
  const cx = w / 2;
  const cy = h / 2;

  // Точка указателя на условном радиусе экрана.
  const reach = Math.min(w, h) * 0.34;
  const tipX = cx + ux * reach;
  const tipY = cy + uy * reach;
  const size = Math.max(10, Math.min(w, h) * 0.028);
  const angle = Math.atan2(uy, ux);
  const alpha = 0.55 + 0.35 * Math.sin(time * 5);
  // Светлый указатель, а не красный: он часто висит поверх красной полосы,
  // и красный на красном теряется.
  const color = rgba("#ffe0e6", alpha);

  // Хвост указателя — короткий отрезок позади треугольника.
  R.pushLine(
    tipX - Math.cos(angle) * size * 1.8,
    tipY - Math.sin(angle) * size * 1.8,
    tipX - Math.cos(angle) * size * 0.5,
    tipY - Math.sin(angle) * size * 0.5,
    color
  );

  // Треугольник остриём к зоне.
  const back = angle + Math.PI;
  const left = back + 0.55;
  const right = back - 0.55;
  R.polyline([
    [tipX, tipY],
    [tipX + Math.cos(left) * size, tipY + Math.sin(left) * size],
    [tipX + Math.cos(right) * size, tipY + Math.sin(right) * size],
  ], true, color);
}
