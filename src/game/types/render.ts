/**
 * RenderScene — DTO кадра для рендера.
 * Содержит только данные; RendererSystem сам строит render-state'ы.
 */

import type { Bullet, EBullet, Pickup, LaserBeam } from "../types";
import type { CameraWorld, ViewWorld, ZoneWorld } from "../core/WorldFrame";
import type { DroneRef, EnemyRef, PlayerRef } from "../ecs";

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
  player: PlayerRef | null;
  aim: number | null;
  guns: number;
  shield: ShieldRenderState;
  enemies: EnemyRef[];
  bullets: Bullet[];
  enemyBullets: EBullet[];
  pickups: Pickup[];
  allyDrones: DroneRef[];
  beams: LaserBeam[];
  zone: ZoneWorld | null;
  camera: CameraWorld;
  view: ViewWorld;
}