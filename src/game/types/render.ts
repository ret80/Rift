/**
 * RenderScene — DTO кадра для рендера.
 * Содержит только данные; RendererSystem сам строит render-state'ы.
 */

import type { AllyDrone, Bullet, EBullet, Enemy, Pickup, WeaveThread, LaserBeam } from "../types";
import type { CameraWorld, PlayerWorld, ViewWorld, ZoneWorld } from "../core/WorldFrame";

/** Снимок временных бонусов для HUD/рендера. */
export interface BonusRenderState {
  rateT: number;
  rateBoost: number;
  dashT: number;
}

/** ДТО кадра отрисовки. */
export interface RenderScene {
  /** Состояние FSM как строка (menu | playing | active | dying | over). */
  state: string;
  time: number;
  wave: number;
  score: number;
  player: PlayerWorld | null;
  aim: number | null;
  guns: number;
  bonus: BonusRenderState;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EBullet[];
  pickups: Pickup[];
  allyDrones: AllyDrone[];
  weaves: WeaveThread[];
  beams: LaserBeam[];
  zone: ZoneWorld | null;
  camera: CameraWorld;
  view: ViewWorld;
  phantomLevel: number;
}