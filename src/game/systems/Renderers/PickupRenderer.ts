/**
 * PickupRenderer — отрисовка пикапов.
 * Извлечён из RendererSystem (drawPickups).
 */

import { C } from "../../balance";
import type { PickupKind } from "../../balance";
import { rgba } from "../../math";
import type { Renderer } from "../../render";

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
 * Строит render-state из raw-массива пикапов.
 */
export function buildPickupState(pickups: unknown[]): PickupRenderState[] {
  return pickups as unknown as PickupRenderState[];
}

/** Цвет пикапа по его виду. */
function colorFor(kind: PickupKind): string {
  switch (kind) {
    case "heal25":
    case "heal50":
    case "heal100":
    case "hp":
    case "mineral":
      return C.heal;
    case "rate20":
    case "rate40":
    case "rate60":
    case "rate":
      return C.fighter;
    case "gun":
      return C.player;
    case "dash":
      return C.dash;
    case "drone":
      return C.mint;
    case "missile":
      return C.bullet;
    case "weaver":
      return C.cruiser;
    case "quantum_swap":
      return "#7cf3ff";
  }
}

export function renderPickups(
  R: Renderer,
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
      case "heal25":
      case "heal50":
      case "heal100":
      case "hp": {
        const s = p.kind === "heal100" ? 7.5 : p.kind === "heal50" ? 6.5 : 5.5;
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
      case "dash": {
        const L = 10;
        const Wd = 7;
        const tx = p.x + L * c1;
        const ty = p.y + L * s1;
        R.pushLine(tx, ty, p.x - L * 0.5 * c1 - Wd * s1, p.y - L * 0.5 * s1 + Wd * c1, rgba(col, blinkA));
        R.pushLine(tx, ty, p.x - L * 0.5 * c1 + Wd * s1, p.y - L * 0.5 * s1 - Wd * c1, rgba(col, blinkA));
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
      case "weaver": {
        const L = 7;
        R.pushLine(p.x - L * c1, p.y - L * s1, p.x + L * c1, p.y + L * s1, rgba(col, blinkA));
        R.pushLine(
          p.x + L * c1, p.y + L * s1,
          p.x + (L - 4) * c1 - 4 * s1, p.y + (L - 4) * s1 + 4 * c1,
          rgba(col, blinkA)
        );
        R.pushLine(
          p.x + L * c1, p.y + L * s1,
          p.x + (L - 4) * c1 + 4 * s1, p.y + (L - 4) * s1 - 4 * c1,
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
      case "mineral": {
        const s = 6.5;
        R.polyline(
          [
            [p.x, p.y - s],
            [p.x + s, p.y - s * 0.3],
            [p.x + s * 0.6, p.y + s],
            [p.x - s * 0.6, p.y + s],
            [p.x - s, p.y - s * 0.3],
          ],
          true,
          rgba(col, blinkA)
        );
        R.pushLine(p.x, p.y - s, p.x, p.y + s, rgba(col, 0.4 * blinkA));
        break;
      }
    }
  }
}


