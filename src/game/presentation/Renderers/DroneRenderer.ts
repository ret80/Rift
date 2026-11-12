/**
 * DroneRenderer — отрисовка союзных дронов.
 * Извлечён из RendererSystem для разделения ответственности.
 */

import { C } from "../../balance";
import { clamp, rgba } from "../../math";
import type { IRenderer, RGBA } from "../../render/index";
import { DRONE_ORBIT_RADIUS } from "../../weapons/DroneWeapon";
import { drawShipPoly } from "./ShipRenderer";
import type { PlayerRenderState } from "./PlayerRenderer";
import type { DroneRef } from "../../ecs";

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

/**
 * Строит render-state из живых связок компонентов союзных дронов.
 * Читает позицию/радиус/жизнь из базовых компонентов, остальное — из маркера.
 */
export function buildDroneState(drones: DroneRef[]): AllyDroneRenderState[] {
  return drones.map((d) => ({
    x: d.position.x,
    y: d.position.y,
    angle: d.marker.angle,
    fireCd: d.marker.fireCd,
    phase: d.marker.phase,
    hp: d.life.remaining,
    maxHp: d.life.max,
    target: d.marker.targetId,
    retargetT: d.marker.retargetT,
    flash: d.marker.flash,
  }));
}

/**
 * Нарисовать союзных дронов и орбитальное кольцо игрока.
 */
export function renderAllyDrones(
  R: IRenderer,
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
function renderDrone(R: IRenderer, d: AllyDroneRenderState, time: number): void {
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