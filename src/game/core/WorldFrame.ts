/**
 * WorldFrame — сечение мира игры за один кадр.
 * Владелец — Game; системы читают и мутируют только свои пулы,
 * а не получают 9–18 позиционных аргументов.
 */

import type { AllyDrone, Bullet, EBullet, Enemy, Pickup, LaserBeam } from "../types";
import type { AsteroidKind } from "../balance";

/** Астероид в том виде, в котором видят его системы. */
export interface AsteroidWorld {
  x: number;
  y: number;
  r: number;
  vx: number;
  vy: number;
  mass: number;
  kind: AsteroidKind;
  dead?: boolean;
}

/** Игрок в том виде, в котором видят его системы. */
export interface PlayerWorld {
  x: number;
  y: number;
  angle: number;
  vx: number;
  vy: number;
  r: number;
  hp: number;
  maxHp: number;
  invuln: number;
  mass: number;
  thrusting: boolean;
}

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
  player: PlayerWorld;
  enemies: Enemy[];
  bullets: Bullet[];
  enemyBullets: EBullet[];
  pickups: Pickup[];
  allyDrones: AllyDrone[];
  beams: LaserBeam[];
  asteroids: AsteroidWorld[];
  zone?: ZoneWorld | null;
}