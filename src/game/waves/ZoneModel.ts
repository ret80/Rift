/**
 * ZoneModel — числовое состояние зоны волны и её расширение.
 *
 * Не знает о волнах, игроке и хуках: только геометрия и тайминги зоны.
 * WaveOrchestrator читает `state` для систем/рендера и вызывает методы
 * активации/расширения в нужные моменты кадра.
 */

import {
  ZONE_CLEAR_EXPAND_DURATION,
  ZONE_CLEAR_EXPAND_MULTIPLIER,
  ZONE_CLEAR_EXPAND_START,
  ZONE_INITIAL_RADIUS,
  zoneExpandSpeed,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import { ZONE_NOT_COLLAPSING } from "../core/ZoneTypes";
import { clamp, easeOutCubic } from "../math";

export class ZoneModel {
  private readonly zone: ZoneData = {
    active: false,
    x: 0,
    y: 0,
    radius: 0,
    targetRadius: 0,
    alpha: 0,
    collapseT: ZONE_NOT_COLLAPSING,
  };

  /** Живое состояние зоны (единственный источник правды). */
  get state(): ZoneData {
    return this.zone;
  }

  /** Полный сброс зоны (новый забег). */
  reset(): void {
    this.zone.active = false;
    this.zone.x = 0;
    this.zone.y = 0;
    this.zone.radius = 0;
    this.zone.targetRadius = 0;
    this.zone.alpha = 0;
    this.zone.collapseT = ZONE_NOT_COLLAPSING;
  }

  /** Подготовить зону к новой волне: центр у игрока, радиус 0, выключена. */
  prepare(playerX: number, playerY: number): void {
    this.zone.active = false;
    this.zone.x = playerX;
    this.zone.y = playerY;
    this.zone.radius = 0;
    this.zone.targetRadius = 0;
    this.zone.alpha = 0;
    this.zone.collapseT = ZONE_NOT_COLLAPSING;
  }

  /** Скрыть зону между волнами, сохранив геометрию. */
  hide(): void {
    this.zone.active = false;
  }

  /** Активировать зону вокруг игрока с радиусом по номеру волны. */
  activate(playerX: number, playerY: number, wave: number): void {
    this.zone.x = playerX;
    this.zone.y = playerY;
    this.zone.targetRadius = Math.max(400, 200 + wave * 50);
    this.zone.radius = ZONE_INITIAL_RADIUS;
    this.zone.alpha = 0;
    this.zone.collapseT = ZONE_NOT_COLLAPSING;
    this.zone.active = true;
  }

  /** Плавное расширение до целевого радиуса во время боя. */
  expand(dt: number, speedMult: number, playerMaxSpeed: number): void {
    if (this.zone.radius >= this.zone.targetRadius) return;
    const expandSpeed = zoneExpandSpeed(speedMult, playerMaxSpeed);
    this.zone.radius = Math.min(
      this.zone.targetRadius,
      this.zone.radius + expandSpeed * dt,
    );
    this.zone.alpha = Math.min(0.5, this.zone.alpha + dt * 1.2);
  }

  /** Расширение и затухание зоны после зачистки волны. */
  applyClearExpansion(clearTime: number): void {
    if (clearTime < ZONE_CLEAR_EXPAND_START) return;
    const progress = clamp(
      (clearTime - ZONE_CLEAR_EXPAND_START) / ZONE_CLEAR_EXPAND_DURATION,
      0,
      1,
    );
    const eased = easeOutCubic(progress);
    // Зона расширяется до 1.5x целевого радиуса и гаснет.
    this.zone.radius = this.zone.targetRadius * (1 + ZONE_CLEAR_EXPAND_MULTIPLIER * eased);
    this.zone.alpha = 0.5 * (1 - eased);
  }
}
