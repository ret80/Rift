/**
 * WorldFrame — сечение мира игры за один кадр.
 *
 * Владелец — GameContext: объект создаётся один раз, а массивы пулов
 * переиспользуются через out-параметры доменов. Все поля — живые связки
 * компонентов ECS, поэтому рендер, коллизии и HUD читают актуальные
 * значения без копирования DTO каждый кадр.
 */

import type { ZonePhase } from "./ZoneTypes";
import type {
  AsteroidRef,
  BeamRef,
  BulletRef,
  DroneRef,
  EnemyBulletRef,
  EnemyRef,
  PickupRef,
  PlayerRef,
} from "../ecs";

/** Состояние зоны арены. */
export interface ZoneWorld {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  /** Остаток текущей стадии сжатия; < 0 — сжатие не идёт. */
  collapseT: number;
  /** Радиус пунктирного кольца; 0 — пунктира нет. */
  dashRadius: number;
  /** Вспышка края после схлопывания арены: 1 → 0. */
  snapFlash: number;
  /** Фаза зоны внутри волны. */
  phase: ZonePhase;
}

/** Камера: позиция и масштаб мировых координат. */
export interface CameraWorld {
  x: number;
  y: number;
  zoom: number;
}

/** Размер вьюпорта в CSS-пикселях. */
export interface ViewWorld {
  width: number;
  height: number;
}

/** Мир кадра: живые связки компонентов всех пулов и состояние зоны. */
export interface WorldFrame {
  player: PlayerRef;
  enemies: EnemyRef[];
  bullets: BulletRef[];
  enemyBullets: EnemyBulletRef[];
  pickups: PickupRef[];
  allyDrones: DroneRef[];
  beams: BeamRef[];
  asteroids: AsteroidRef[];
  zone: ZoneWorld | null;
}
