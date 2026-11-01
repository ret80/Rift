/**
 * ZoneModel — числовое состояние зоны волны и её расширение.
 *
 * Не знает о волнах, игроке и хуках: только геометрия и тайминги зоны.
 * WaveOrchestrator читает `state` для систем/рендера и вызывает методы
 * активации/расширения в нужные моменты кадра.
 */

import {
  ZONE_CLEAR_FADE_TIME,
  ZONE_INITIAL_RADIUS,
  ZONE_MAX_ALPHA,
  zoneExpandSpeed,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";
import { ZONE_NOT_COLLAPSING } from "../core/ZoneTypes";
import { clamp } from "../math";

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

  /** Альфа в момент начала зачистки волны — от неё гасим зону. */
  private clearFromAlpha = 0;

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

  /** Волна зачищена: запомнить текущую альфу для плавного гашения. */
  beginClear(): void {
    this.clearFromAlpha = this.zone.alpha;
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
    this.zone.alpha = Math.min(ZONE_MAX_ALPHA, this.zone.alpha + dt * 1.2);
  }

  /**
   * Исчезновение зоны после зачистки волны: край уходит со скоростью
   * расширения (×1.3 текущей скорости игрока), альфа гаснет до 0 за
   * ZONE_CLEAR_FADE_TIME. После этого зона считается исчезнувшей.
   */
  applyClearExpansion(
    dt: number,
    clearTime: number,
    speedMult: number,
    playerMaxSpeed: number,
  ): void {
    if (!this.zone.active) return;

    this.zone.radius += zoneExpandSpeed(speedMult, playerMaxSpeed) * dt;

    const fade = clamp(clearTime / ZONE_CLEAR_FADE_TIME, 0, 1);
    this.zone.alpha = this.clearFromAlpha * (1 - fade);

    if (clearTime >= ZONE_CLEAR_FADE_TIME) {
      this.zone.alpha = 0;
      this.zone.active = false;
    }
  }
}
