/**
 * Данные меню и кадр отрисовки меню.
 *
 * Меню — презентационная сцена: у неё свои разломы и корабли, которые не
 * живут в игровом ECS. Здесь только чистые типы, чтобы MenuScene и
 * RendererSystem не дублировали inline-структуры.
 */

import type { EnemyKind } from "../../balance";
import type { ViewWorld } from "../../core/WorldFrame";
import type { IRenderer } from "../../render";
import type { AsteroidField } from "../../asteroids";
import type { RiftField } from "../../rifts";
import type { Starfield } from "../../starfield";

/** Разлом в анимации меню. */
export interface MenuRift {
  x: number;
  y: number;
  t: number;
  state: "opening" | "spawning" | "closing";
  queue: EnemyKind[];
  timer: number;
  seed: number;
  rot: number;
  size: number;
  nextSpawnT: number;
}

/** Корабль, вылетевший из разлома меню. */
export interface MenuEnemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: EnemyKind;
  angle: number;
  seed: number;
}

/** Один кадр отрисовки меню. */
export interface MenuFrame {
  renderer: IRenderer;
  starfield: Starfield;
  asteroidField: AsteroidField;
  riftField: RiftField;
  rifts: MenuRift[];
  enemies: MenuEnemy[];
  view: ViewWorld;
}
