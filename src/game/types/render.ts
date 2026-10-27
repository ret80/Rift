/**
 * RenderScene — DTO кадра для рендера.
 * Содержит только данные; RendererSystem сам строит render-state'ы.
 */

import type { AllyDrone, Bullet, EBullet, Enemy, Pickup, LaserBeam } from "../types";
import type { CameraWorld, PlayerWorld, ViewWorld, ZoneWorld } from "../core/WorldFrame";

/** Снимок щита для рендера. */
export interface ShieldRenderState {
  /** Щит куплен и работает. */
  owned: boolean;
  /** Запас энергии 0..1. */
  energy: number;
  /** Процент блокируемого урона 0..1. */
  block: number;
  /** Щит в перезагрузке. */
  overloaded: boolean;
  /** Остаток перезагрузки, секунды. */
  overloadLeft: number;
  /** Остаток вспышки после срабатывания 0..1. */
  flash: number;
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
  shield: ShieldRenderState;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EBullet[];
  pickups: Pickup[];
  allyDrones: AllyDrone[];
  beams: LaserBeam[];
  zone: ZoneWorld | null;
  camera: CameraWorld;
  view: ViewWorld;
}