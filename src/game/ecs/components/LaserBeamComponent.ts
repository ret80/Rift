/**
 * LaserBeamComponent — ECS-компонент визуального луча лазера игрока.
 *
 * Луч лазера — мгновенный отрезок от ствола до цели. Урон наносится в
 * момент зажигания, поэтому луч живёт только как визуал и не участвует
 * в столкновениях. Компонент хранит чистые данные-поля (без ссылки на
 * внешний объект); время жизни — в отдельном LifeComponent, которое
 * затухает и удаляется ECS-системой BeamSystem.
 */

import type { Component } from "@trixt0r/ecs";

export class LaserBeamComponent implements Component {
  readonly type = "LaserBeam";
  readonly id = "LaserBeam";

  constructor(
    /** Начало отрезка луча (мировые координаты). */
    public x1 = 0,
    public y1 = 0,
    /** Конец отрезка луча (мировые координаты). */
    public x2 = 0,
    public y2 = 0,
    /** Случайная фаза мерцания — чтобы контуры не совпадали между кадрами. */
    public seed = 0,
    /** EntityRef: id ECS-сущности цели, занятой лучом (или null). */
    public targetId: number | string | null = null,
  ) {}
}