/**
 * EnemyRenderer — отрисовка врагов.
 * Извлечён из RendererSystem (drawEnemies).
 */

import { C, EnemyKind } from "../../balance";
import type { Renderer, RGBA } from "../../render";

export interface EnemyRenderState {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  dead: boolean;
  droneState?: 'orbiting' | 'attacking' | 'none' | 'accumulating' | 'waiting';
  orbitRadius?: number;
  parent: EnemyRenderState | null;
}

export function renderEnemies(
  R: Renderer,
  enemies: EnemyRenderState[],
  _time: number
) {
  // Debug: log enemy types
  const droneCount = enemies.filter(e => e.kind === EnemyKind.Drone).length;
  if (droneCount > 0 && Math.random() < 0.01) {
    console.log(`[RENDER] Rendering ${enemies.length} enemies, ${droneCount} drones`);
  }
  for (const e of enemies) {
    if (e.dead) continue;
    const base = kindColor(e.kind);
    const flash = e.flash > 0 ? 1 : 0;
    const [r, g, b] = rgba(base, 1);
    const col: RGBA = [
      Math.min(1, r + flash * 0.6),
      Math.min(1, g + flash * 0.6),
      Math.min(1, b + flash * 0.6),
      1,
    ];
    switch (e.kind) {
      case EnemyKind.Drone: {
        // Атакующий дрон — яркий, орбитальный — тусклый
        let droneCol = col;
        if (e.droneState === 'attacking') {
          droneCol = [
            Math.min(1, col[0] + 0.4),
            Math.min(1, col[1] + 0.2),
            Math.min(1, col[2] + 0.2),
            col[3],
          ];
        }
        drawShipPoly(R, e.x, e.y, e.angle, [[9, 0], [-7, 7], [-4, 0], [-7, -7]], droneCol);
        break;
      }
      case EnemyKind.Hunter: {
        drawShipPoly(R, e.x, e.y, e.angle, [[13, 0], [-8, 6], [-4, 0], [-8, -6]], col);
        R.circle(
          e.x + Math.cos(e.angle) * 5,
          e.y + Math.sin(e.angle) * 5,
          2,
          rgba(C.hunter, 0.95),
          8
        );
        R.pushLine(
          e.x + Math.cos(e.angle) * 16,
          e.y + Math.sin(e.angle) * 16,
          e.x + Math.cos(e.angle) * 24,
          e.y + Math.sin(e.angle) * 24,
          rgba(C.hunter, 0.45)
        );
        break;
      }
      case EnemyKind.Fighter: {
        drawShipPoly(R, e.x, e.y, e.angle, [[14, 0], [-10, 9], [-5, 0], [-10, -9]], col);
        break;
      }
      case EnemyKind.Cruiser: {
        drawShipPoly(R, e.x, e.y, e.angle, [[22, 0], [8, 14], [-18, 12], [-18, -12], [8, -14]], col);
        R.circle(e.x, e.y, 8, rgba(base, 0.5), 16);
        break;
      }
      case EnemyKind.Carrier: {
        drawShipPoly(R, e.x, e.y, e.angle, [[30, 0], [10, 20], [-24, 16], [-24, -16], [10, -20]], col);
        R.circle(e.x, e.y, 12, rgba(base, 0.4), 20);
        R.dashedCircle(e.x, e.y, 20, rgba(base, 0.3), 8, _time * 0.8);
        // Визуализация орбиты для дронов (всегда рисуется вокруг Carrier)
        R.dashedCircle(e.x, e.y, e.orbitRadius || 121, rgba(base, 0.15), 12, _time * 0.3);
        break;
      }
    }
    if (e.maxHp > 40 && e.hp < e.maxHp) {
      const f = clamp(e.hp / e.maxHp, 0, 1);
      R.dashedCircle(e.x, e.y, e.r + 6, rgba(base, 0.4), Math.max(3, Math.round(10 * f)), _time, 0.4);
    }
  }
}

function kindColor(kind: EnemyKind): string {
  switch (kind) {
    case EnemyKind.Drone: return C.drone;
    case EnemyKind.Hunter: return C.hunter;
    case EnemyKind.Fighter: return C.fighter;
    case EnemyKind.Cruiser: return C.cruiser;
    case EnemyKind.Carrier: return C.carrier;
  }
}

function rgba(base: string, a: number): [number, number, number, number] {
  const hex = base.startsWith("#") ? base.slice(1) : base;
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;
  return [r, g, b, a];
}

function drawShipPoly(
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

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}
