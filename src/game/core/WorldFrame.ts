/**
 * WorldFrame — сечение мира игры за один кадр.
 * Владелец — Game; системы читают и мутируют только свои пулы,
 * а не получают 9–18 позиционных аргументов.
 */

import type { Bullet, EBullet, Pickup, LaserBeam } from "../types";
import type { AsteroidRef, DroneRef, EnemyRef, PlayerRef } from "../ecs";

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

/** Мир кадра: ссылки на пулы сущностей. */
export interface WorldFrame {
  player: PlayerRef;
  enemies: EnemyRef[];
  bullets: Bullet[];
  enemyBullets: EBullet[];
  pickups: Pickup[];
  allyDrones: DroneRef[];
  beams: LaserBeam[];
  asteroids: AsteroidRef[];
  zone?: ZoneWorld | null;
}