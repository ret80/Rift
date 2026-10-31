/**
 * PlayerRenderer — отрисовка корабля игрока.
 * Извлечён из RendererSystem для разделения ответственности.
 */

import { C } from "../../balance";
import { clamp, rgba } from "../../math";
import type { IRenderer } from "../../render/index";
import { CANNON_BARREL_OFFSETS } from "../../weapons/CannonWeapon";
import { drawShipPoly } from "./ShipRenderer";

export interface PlayerRenderState {
  x: number;
  y: number;
  angle: number;
  aimA: number | null;
  hp: number;
  maxHp: number;
  invuln: number;
  guns: number;
  thrusting: boolean;
  pvx: number;
  pvy: number;
  /** Запас энергии щита 0..1. */
  shieldEnergy: number;
  /** Щит куплен и работает. */
  shieldOwned: boolean;
  /** Щит в перезагрузке. */
  shieldOverloaded: boolean;
  /** Остаток вспышки щита 0..1. */
  shieldFlash: number;
}

/** Снимок щита для buildState. */
export interface PlayerShieldSnapshot {
  /** Щит куплен и работает. */
  owned: boolean;
  /** Запас энергии 0..1. */
  energy: number;
  /** Щит в перезагрузке. */
  overloaded: boolean;
  /** Остаток вспышки после срабатывания 0..1. */
  flash: number;
}

/**
 * Строит render-state из raw-данных игрока.
 * Единственный источник правды для преобразования PlayerState → PlayerRenderState.
 */
export function buildPlayerState(
  x: number,
  y: number,
  angle: number,
  hp: number,
  maxHp: number,
  invuln: number,
  thrusting: boolean,
  pvx: number,
  pvy: number,
  aimA: number | null,
  guns: number,
  shield: PlayerShieldSnapshot
): PlayerRenderState {
  return {
    x, y, angle, aimA,
    hp, maxHp, invuln,
    guns,
    thrusting,
    pvx, pvy,
    shieldEnergy: shield.energy,
    shieldOwned: shield.owned,
    shieldOverloaded: shield.overloaded,
    shieldFlash: shield.flash,
  };
}

/**
 * Нарисовать корабль игрока со всеми эффектами.
 */
export function renderPlayer(
  R: IRenderer,
  player: PlayerRenderState,
  time: number
): void {
  const blink = player.invuln > 0 ? (Math.sin(time * 30) > 0 ? 0.35 : 1) : 1;

  // thruster
  if (player.thrusting) {
    const cos = Math.cos(player.angle);
    const sin = Math.sin(player.angle);
    const len = 10 + Math.random() * 8;
    R.pushLine(
      player.x - cos * 12, player.y - sin * 12,
      player.x - cos * (12 + len), player.y - sin * (12 + len),
      rgba(C.player, 0.6 * blink)
    );
  }

  // shield stripes
  renderShieldStripes(R, player, time);

  // hull
  drawShipPoly(
    R, player.x, player.y, player.angle,
    [[16, 0], [-11, 10], [-6, 0], [-11, -10]],
    rgba(C.player, blink)
  );

  // turret
  renderTurret(R, player, blink);
}

/**
 * Отрисовка щита — шеврон (треугольник) вокруг корпуса, как у прежнего рывка.
 * Вершина вынесена вперёд, лучи уходят за борта и за корму, поэтому контур
 * читается как треугольник возле рёбер корабля. Яркость зависит от остатка
 * энергии; при поглощении урона контур мигает, при перезагрузке щита его нет.
 */
function renderShieldStripes(R: IRenderer, player: PlayerRenderState, time: number): void {
  if (!player.shieldOwned || player.shieldOverloaded) return;
  const energy = clamp(player.shieldEnergy, 0, 1);
  if (energy <= 0.001) return;

  const ca = Math.cos(player.angle);
  const sa = Math.sin(player.angle);
  const L = 30;
  const Wd = 20;

  let glow = 0.35 + energy * 0.55;
  if (player.shieldFlash > 0) {
    // Жёсткое мигание после срабатывания: контур то вспыхивает, то почти гаснет.
    glow = Math.sin(time * 45) > 0 ? 1 : 0.08;
  }

  const tipX = player.x + ca * L;
  const tipY = player.y + sa * L;
  const w1x = player.x - ca * L * 0.55 - sa * Wd;
  const w1y = player.y - sa * L * 0.55 + ca * Wd;
  const w2x = player.x - ca * L * 0.55 + sa * Wd;
  const w2y = player.y - sa * L * 0.55 - ca * Wd;
  R.pushLine(tipX, tipY, w1x, w1y, rgba(C.shieldStripe, 0.95 * glow));
  R.pushLine(tipX, tipY, w2x, w2y, rgba(C.shieldStripe, 0.95 * glow));

  const L2 = L * 0.62;
  const W2 = Wd * 0.62;
  R.pushLine(
    player.x + ca * L2, player.y + sa * L2,
    player.x - ca * L2 * 0.55 - sa * W2, player.y - sa * L2 * 0.55 + ca * W2,
    rgba(C.shieldStripe, 0.4 * glow)
  );
  R.pushLine(
    player.x + ca * L2, player.y + sa * L2,
    player.x - ca * L2 * 0.55 + sa * W2, player.y - sa * L2 * 0.55 - ca * W2,
    rgba(C.shieldStripe, 0.4 * glow)
  );
}

/** Отрисовка турели игрока. */
function renderTurret(R: IRenderer, player: PlayerRenderState, blink: number): void {
  const ba = player.aimA !== null ? player.aimA : player.angle;
  const gcos = Math.cos(ba);
  const gsin = Math.sin(ba);
  for (let i = 0; i < player.guns; i++) {
    const o = CANNON_BARREL_OFFSETS[i] ?? 0;
    const bx = player.x + 8 * gcos - o * gsin;
    const by = player.y + 8 * gsin + o * gcos;
    R.pushLine(bx, by, bx + 8 * gcos, by + 8 * gsin, rgba(C.mint, 0.85 * blink));
  }
  if (player.aimA !== null) {
    R.pushLine(
      player.x + Math.cos(player.aimA) * 20, player.y + Math.sin(player.aimA) * 20,
      player.x + Math.cos(player.aimA) * 30, player.y + Math.sin(player.aimA) * 30,
      rgba(C.mint, 0.3 * blink)
    );
  }
}
