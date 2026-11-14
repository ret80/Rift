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
import type { ZonePhase } from "../../core/ZoneTypes";
import { rgba } from "../../math";
import type { IRenderer } from "../../render/index";
import type { ZoneStormState } from "../../waves/ZoneStorm";

export interface ZoneRenderState {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  /** Остаток текущей стадии сжатия; < 0 — сжатия нет. */
  collapseT: number;
  /** Радиус пунктирного кольца; 0 — пунктира нет. */
  dashRadius: number;
  /** Вспышка края после схлопывания арены: 1 → 0. */
  snapFlash: number;
  /** Фаза зоны внутри волны. */
  phase: ZonePhase;
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
  alpha: number,
  collapseT: number,
  dashRadius: number,
  snapFlash: number,
  phase: ZonePhase
): ZoneRenderState {
  return {
    active, x, y, radius, targetRadius, alpha, collapseT, dashRadius, snapFlash, phase,
  };
}

/** Порог, с которого игрок считается снаружи (совпадает с ZoneEdgeDamage). */
const OUTSIDE_EPSILON = 4;

/** Ограничить долю в 0..1 (вспышка края приходит как 1 → 0). */
function clamp01(value: number): number {
  return value < 0 ? 0 : value > 1 ? 1 : value;
}

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
  // Сразу после схлопывания край вспыхивает: скачок должен читаться.
  const flash = clamp01(zone.snapFlash);
  const pulse = flash > 0
    ? 0.85 + 0.35 * Math.sin(time * 9)
    : 0.9 + 0.1 * Math.sin(time * 2);
  const edgeAlpha = ZONE_EDGE_ALPHA * a * pulse * (1 + flash * 3);
  R.circle(zone.x, zone.y, zr, rgba(C.zone, edgeAlpha), 128);

  // Рывок сжатия: пунктирное кольцо уезжает внутрь, арена ещё стоит на месте.
  // Полоса между пунктиром и краем показывает, сколько арены вот-вот уйдёт.
  if (zone.dashRadius > 0) {
    const blink = 0.5 + 0.5 * Math.sin(time * 14);
    if (zone.dashRadius < zr - 0.5) {
      R.fillRing(
        zone.x, zone.y, zone.dashRadius, zr,
        rgba(C.zone, 0.16 * a), rgba(C.zone, 0.16 * a), 96,
      );
    }
    R.dashedCircle(
      zone.x, zone.y, zone.dashRadius,
      rgba(C.zone, (0.35 + 0.45 * blink) * a), 26, time * 1.6, 0.45,
    );
  }

  // Внешняя граница полосы — только намёк, чтобы полоса не «висела» в пустоте.
  if (band > 0.5) {
    R.circle(zone.x, zone.y, zr + band, rgba(C.zone, ZONE_OUTER_EDGE_ALPHA * a), 96);
  }
}

/** Дуговых примитивов в рендере нет — сектор собирается ломаной. */
/**
 * Нарисовать бурю на кромке: одну или несколько зон во внешней полосе.
 *
 * Зона обведена ломаной по дугам и расчерчена радиальными штрихами по
 * границам долей — это читаемое «штрихованное» предупреждение без новых
 * примитивов рендера. Телеграф пульсирует и ускоряется к моменту удара,
 * сам удар горит ровно.
 */
export function renderZoneStorm(
  R: IRenderer,
  storm: ZoneStormState,
  time: number,
): void {
  if (!storm.active || storm.outerRadius <= 0) return;
  const alpha =
    storm.phase === "telegraph"
      ? 0.22 + 0.5 * storm.telegraph * (0.65 + 0.35 * Math.sin(time * 18))
      : 0.42;
  const color = storm.phase === "telegraph" ? "#ffd23e" : "#ff8a3d";
  const line = rgba(color, alpha);

  for (const segment of storm.segments) {
    const cx = storm.cx;
    const cy = storm.cy;
    const from = segment.angle - segment.halfAngle;
    const to = segment.angle + segment.halfAngle;
    const arcs = Math.max(4, segment.cells * 3);
    const step = (to - from) / arcs;

    const pts: Array<[number, number]> = [];
    for (let i = 0; i <= arcs; i++) {
      const a = from + step * i;
      pts.push([cx + Math.cos(a) * storm.innerRadius, cy + Math.sin(a) * storm.innerRadius]);
    }
    for (let i = arcs; i >= 0; i--) {
      const a = from + step * i;
      pts.push([cx + Math.cos(a) * storm.outerRadius, cy + Math.sin(a) * storm.outerRadius]);
    }
    R.polyline(pts, true, line);

    // Радиальные штрихи: показывают, что опасна вся полоса, а не только контур.
    for (let i = 0; i <= segment.cells; i++) {
      const a = from + ((to - from) * i) / segment.cells;
      R.pushLine(
        cx + Math.cos(a) * storm.innerRadius,
        cy + Math.sin(a) * storm.innerRadius,
        cx + Math.cos(a) * storm.outerRadius,
        cy + Math.sin(a) * storm.outerRadius,
        line,
      );
    }
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
