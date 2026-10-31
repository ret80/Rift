/**
 * WorldFrame — сечение мира игры за один кадр.
 *
 * Владелец — GameContext: объект создаётся один раз, а массивы пулов
 * переиспользуются через out-параметры доменов. Все поля — живые связки
 * компонентов ECS, поэтому рендер, коллизии и HUD читают актуальные
 * значения без копирования DTO каждый кадр.
 */

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
