/**
 * PickupRenderer — отрисовка пикапов.
 * Извлечён из RendererSystem (drawPickups).
 */

import { PICKUP_CATALOG } from "../../balance/pickupCatalog";
import type { PickupKind } from "../../balance";
import { rgba } from "../../math";
import type { IRenderer } from "../../render/index";

export interface PickupRenderState {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  seed: number;
}

/**
 * Строит render-state из пикапов.
 * PickupRenderState — read-only проекция данных пикапа (компонентов);
 * каст-моста из ECS не требуется.
 */
export function buildPickupState(pickups: PickupRenderState[]): PickupRenderState[] {
  return pickups;
}

/** Цвет пикапа по его виду — из каталога. */
function colorFor(kind: PickupKind): string {
  return PICKUP_CATALOG[kind].color;
}

export function renderPickups(
  R: IRenderer,
  pickups: PickupRenderState[],
  time: number
) {
  for (const p of pickups) {
    const blinkA = p.life < 3 ? 0.35 + 0.65 * Math.abs(Math.sin(p.life * 7)) : 1;
    const rot = time * 1.4 + p.seed;
    const col = colorFor(p.kind);
    const pr = 15 + Math.sin(time * 4 + p.seed) * 2;
    R.circle(p.x, p.y, pr, rgba(col, 0.35 * blinkA), 26);
    const c1 = Math.cos(rot);
    const s1 = Math.sin(rot);
    switch (p.kind) {
      case "heal": {
        const s = 6.5;
        R.pushLine(p.x - s * c1, p.y - s * s1, p.x + s * c1, p.y + s * s1, rgba(col, blinkA));
        R.pushLine(p.x + s * s1, p.y - s * c1, p.x - s * s1, p.y + s * c1, rgba(col, blinkA));
        break;
      }
      case "rate20":
      case "rate40":
      case "rate60":
      case "rate": {
        R.pushLine(p.x + 3, p.y - 8, p.x - 4, p.y + 1, rgba(col, blinkA));
        R.pushLine(p.x - 4, p.y + 1, p.x + 1, p.y + 1, rgba(col, blinkA));
        R.pushLine(p.x + 1, p.y + 1, p.x - 3, p.y + 8, rgba(col, blinkA));
        break;
      }
      case "gun": {
        R.pushLine(p.x - 6, p.y - 3, p.x + 7, p.y - 3, rgba(col, blinkA));
        R.pushLine(p.x - 6, p.y + 3, p.x + 7, p.y + 3, rgba(col, blinkA));
        R.pushLine(p.x - 6, p.y - 3, p.x - 6, p.y + 3, rgba(col, blinkA));
        break;
      }
      case "drone": {
        const pts: Array<[number, number]> = [[6, 0], [-4, 4], [-4, -4]];
        const cos = Math.cos(rot);
        const sin = Math.sin(rot);
        const world: Array<[number, number]> = pts.map(([px, py]) => [
          p.x + px * cos - py * sin,
          p.y + px * sin + py * cos,
        ]);
        R.polyline(world, true, rgba(col, blinkA));
        R.circle(p.x, p.y, 9.5, rgba(col, 0.4 * blinkA), 18);
        break;
      }
      case "shield": {
        // Щит: контур с вертикальной осью.
        const L = 8;
        const pts: Array<[number, number]> = [
          [p.x, p.y - L],
          [p.x + L * 0.8, p.y - L * 0.5],
          [p.x + L * 0.8, p.y + L * 0.3],
          [p.x, p.y + L],
          [p.x - L * 0.8, p.y + L * 0.3],
          [p.x - L * 0.8, p.y - L * 0.5],
        ];
        R.polyline(pts, true, rgba(col, blinkA));
        R.pushLine(p.x, p.y - L * 0.6, p.x, p.y + L * 0.6, rgba(col, 0.45 * blinkA));
        break;
      }
      case "missile": {
        // Силуэт ракеты: корпус и носовая часть.
        const L = 8;
        const Wd = 3.2;
        const tx = p.x + L * c1;
        const ty = p.y + L * s1;
        const nx = p.x - L * 0.7 * c1;
        const ny = p.y - L * 0.7 * s1;
        R.polyline(
          [[tx, ty], [nx - Wd * s1, ny + Wd * c1], [nx + Wd * s1, ny - Wd * c1]],
          true,
          rgba(col, blinkA)
        );
        R.pushLine(nx, ny, nx - 3 * c1, ny - 3 * s1, rgba(col, 0.6 * blinkA));
        break;
      }
      case "laser": {
        // Луч: центральная линия с расходящимся пучком на конце.
        R.pushLine(p.x - 7 * c1, p.y - 7 * s1, p.x + 7 * c1, p.y + 7 * s1, rgba(col, blinkA));
        R.pushLine(
          p.x + 7 * c1, p.y + 7 * s1,
          p.x + 10 * c1 - 3 * s1, p.y + 10 * s1 + 3 * c1,
          rgba(col, blinkA)
        );
        R.pushLine(
          p.x + 7 * c1, p.y + 7 * s1,
          p.x + 10 * c1 + 3 * s1, p.y + 10 * s1 - 3 * c1,
          rgba(col, blinkA)
        );
        break;
      }
      case "quantum_swap": {
        // Две стрелки навстречу: подмена местами.
        R.pushLine(p.x - 7, p.y - 4, p.x + 7, p.y - 4, rgba(col, blinkA));
        R.pushLine(p.x - 7, p.y + 4, p.x + 7, p.y + 4, rgba(col, blinkA));
        R.pushLine(p.x + 4, p.y - 7, p.x + 7, p.y - 4, rgba(col, blinkA));
        R.pushLine(p.x + 4, p.y - 1, p.x + 7, p.y - 4, rgba(col, blinkA));
        R.pushLine(p.x - 4, p.y + 7, p.x - 7, p.y + 4, rgba(col, blinkA));
        R.pushLine(p.x - 4, p.y + 1, p.x - 7, p.y + 4, rgba(col, blinkA));
        break;
      }
    }
  }
}


