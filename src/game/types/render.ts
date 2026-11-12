/**
 * RenderScene — DTO кадра для рендера.
 * Содержит только данные; RendererSystem сам строит render-state'ы.
 * RenderFrame — тот же кадр после преобразования refs в render-state'ы:
 * один объект вместо 15 позиционных аргументов `draw`.
 */

import type { GameStateId } from "../core/GameFSM";
import type { CameraWorld, ViewWorld, ZoneWorld } from "../core/WorldFrame";
import type { IRenderer } from "../render/index";
import type {
  BeamRef,
  BulletRef,
  DroneRef,
  EnemyBulletRef,
  EnemyRef,
  PickupRef,
  PlayerRef,
} from "../ecs";
import type { PlayerRenderState } from "../presentation/Renderers/PlayerRenderer";
import type { EnemyRenderState } from "../presentation/Renderers/EnemyRenderer";
import type {
  BulletRenderState,
  EBulletRenderState,
} from "../presentation/Renderers/BulletRenderer";
import type { PickupRenderState } from "../presentation/Renderers/PickupRenderer";
import type { AllyDroneRenderState } from "../presentation/Renderers/DroneRenderer";
import type { ZoneRenderState } from "../presentation/Renderers/ZoneRenderer";
import type { ZoneStormState } from "../waves/ZoneStorm";

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
  /** Игрок удерживает активный щит. */
  active: boolean;
  /** Направление сектора активного щита, радианы. */
  angle: number;
  /** Ширина сектора активного щита, радианы. */
  sector: number;
}

/** ДТО кадра отрисовки. */
export interface RenderScene {
  renderer: IRenderer;
  /** Состояние FSM. */
  state: GameStateId;
  time: number;
  wave: number;
  score: number;
  player: PlayerRef | null;
  aim: number | null;
  guns: number;
  shield: ShieldRenderState;
  enemies: EnemyRef[];
  bullets: BulletRef[];
  enemyBullets: EnemyBulletRef[];
  pickups: PickupRef[];
  allyDrones: DroneRef[];
  beams: BeamRef[];
  zone: ZoneWorld | null;
  /** Буря на кромке: сектор во внешней полосе зоны. */
  storm: ZoneStormState | null;
  camera: CameraWorld;
  view: ViewWorld;
}

/** Кадр после сборки render-state'ов — вход для `RendererSystem.draw`. */
export interface RenderFrame {
  renderer: IRenderer;
  state: GameStateId;
  time: number;
  camera: CameraWorld;
  view: ViewWorld;
  player: PlayerRenderState | null;
  enemies: EnemyRenderState[];
  bullets: BulletRenderState[];
  enemyBullets: EBulletRenderState[];
  pickups: PickupRenderState[];
  allyDrones: AllyDroneRenderState[];
  zone: ZoneRenderState | null;
  storm: ZoneStormState | null;
  beams: BeamRef[];
}
