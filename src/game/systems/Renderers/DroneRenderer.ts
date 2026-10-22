/**
 * DroneRenderer — отрисовка союзных дронов.
 * Извлечён из RendererSystem для разделения ответственности.
 */

import { C } from "../../balance";
import { clamp, rgba } from "../../math";
import type { Renderer, RGBA } from "../../render";
import { DRONE_ORBIT_RADIUS } from "../../weapons/DroneWeapon";
import { drawShipPoly } from "./ShipRenderer";

export interface AllyDroneRenderState {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
  phase: number;
  hp: number;
  maxHp: number;
  target: unknown | null;
  retargetT: number;
  flash: number;
}

export interface PlayerRenderState {
  x: number;
  y: number;
  angle: number;
  aimA: number | null;
  hp: number;
  maxHp: number;
  invuln: number;
  guns: number;
  rateT: number;
  rateBoost: number;
  dashT: number;
  thrusting: boolean;
  pvx: number;
  pvy: number;
}

/**
 * Строит render-state из raw-массива союзных дронов.
 */
export function buildDroneState(drones: unknown[]): AllyDroneRenderState[] {
  return drones as unknown as AllyDroneRenderState[];
}

/**
 * Нарисовать союзных дронов и орбитальное кольцо игрока.
 */
export function renderAllyDrones(
  R: Renderer,
  drones: AllyDroneRenderState[],
  time: number,
  player: PlayerRenderState | null
): void {
  const n = drones.length;
  if (n === 0) return;
  if (player) {
    R.dashedCircle(player.x, player.y, DRONE_ORBIT_RADIUS, rgba(C.mint, 0.12), 20, time * 0.7);
  }
  for (const d of drones) {
    renderDrone(R, d, time);
  }
}

/** Отрисовка одного дрона. */
function renderDrone(R: Renderer, d: AllyDroneRenderState, time: number): void {
  const hpF = clamp(d.hp / d.maxHp, 0, 1);
  const cr = 0.62 + (1 - hpF) * 0.38;
  const cg = 1 - (1 - hpF) * 0.5;
  const cb = 0.91 - (1 - hpF) * 0.6;
  const flash = d.flash > 0 ? 1 : 0;
  const col: RGBA = [
    Math.min(1, cr + flash * 0.5),
    Math.min(1, cg + flash * 0.5),
    Math.min(1, cb + flash * 0.5),
    0.95,
  ];
  drawShipPoly(
    R, d.x, d.y, d.angle,
    [[7, 0], [-5, 5], [-2, 0], [-5, -5]],
    col
  );
  if (hpF < 1) {
    R.dashedCircle(d.x, d.y, 11, [cr, cg, cb, 0.5], 10, time, 0.35);
  }
  R.pushLine(
    d.x - Math.cos(d.angle) * 5,
    d.y - Math.sin(d.angle) * 5,
    d.x - Math.cos(d.angle) * (8 + Math.random() * 3),
    d.y - Math.sin(d.angle) * (8 + Math.random() * 3),
    rgba(C.mint, 0.5)
  );
}
