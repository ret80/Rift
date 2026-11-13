/**
 * ZoneModel — числовое состояние зоны волны и её расширение/сжатие.
 *
 * Не знает о волнах, игроке и хуках: только геометрия и тайминги зоны.
 * WaveOrchestrator читает `state` для систем/рендера и вызывает `update`
 * каждый кадр боя.
 *
 * Фазы волны:
 *   1. expand  — зона растёт из точки старта до радиуса волны;
 *   2. hold    — держится на радиусе (по ней игрок читает арену);
 *   3. collapse — через ZONE_COLLAPSE_DELAY секунд боя включается телеграф
 *      на ZONE_COLLAPSE_TELEGRAPH секунд, затем зона сжимается к
 *      ZONE_COLLAPSE_TARGET_FRACTION от радиуса волны и там останавливается.
 *
 * Сжатие всегда медленнее игрока: выйти из него можно, но только двигаясь
 * внутрь, сквозь толпу. Само по себе сжатие не убивает — урон наносит
 * только край зоны.
 */

import {
  ZONE_CLEAR_FADE_TIME,
  ZONE_COLLAPSE_MIN_WAVE,
  ZONE_COLLAPSE_TELEGRAPH,
  ZONE_INITIAL_RADIUS,
  ZONE_MAX_ALPHA,
  zoneRadiusFor,
  zoneExpandSpeed,
} from "../balance";
import { DEFAULT_PARAMS, type GameParams } from "../balance/params/GameParams";
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
    phase: "expand",
  };

  /** Альфа в момент начала зачистки волны — от неё гасим зону. */
  private clearFromAlpha = 0;

  /** Время боя с момента активации зоны, секунды. */
  private elapsed = 0;
  /** Номер волны, на которой сжатие разрешено. */
  private wave = 1;
  /** Параметры мира: геометрия арены и тайминги сжатия. */
  private params: GameParams = DEFAULT_PARAMS;

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
    this.zone.phase = "expand";
    this.elapsed = 0;
    this.wave = 1;
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
    this.zone.phase = "expand";
    this.elapsed = 0;
  }

  /** Скрыть зону между волнами, сохранив геометрию. */
  hide(): void {
    this.zone.active = false;
  }

  /** Волна зачищена: запомнить текущую альфу для плавного гашения. */
  beginClear(): void {
    this.clearFromAlpha = this.zone.alpha;
  }

  /** Передать параметры мира (профиль + отладочные сдвиги). */
  setParams(params: GameParams): void {
    this.params = params;
    if (!this.zone.active) return;
    this.zone.targetRadius = zoneRadiusFor(this.wave, params);
  }

  /** Активировать зону вокруг игрока с радиусом по номеру волны. */
  activate(playerX: number, playerY: number, wave: number): void {
    this.zone.x = playerX;
    this.zone.y = playerY;
    // Единый источник радиуса зоны: те же значения использует спавн и ИИ.
    this.zone.targetRadius = zoneRadiusFor(wave, this.params);
    this.zone.radius = ZONE_INITIAL_RADIUS;
    this.zone.alpha = 0;
    this.zone.collapseT = ZONE_NOT_COLLAPSING;
    this.zone.phase = "expand";
    this.zone.active = true;
    this.wave = wave;
    this.elapsed = 0;
  }

  /**
   * Один кадр боя: расширение, удержание, телеграф и сжатие.
   * @param speedMult множитель скорости из прокачки «скорость»
   * @param playerMaxSpeed базовая максимальная скорость игрока
   */
  update(dt: number, speedMult: number, playerMaxSpeed: number): void {
    if (!this.zone.active) return;
    this.elapsed += dt;

    // 1. Расширение до радиуса волны.
    if (this.zone.radius < this.zone.targetRadius) {
      const expandSpeed = zoneExpandSpeed(speedMult, playerMaxSpeed);
      this.zone.radius = Math.min(
        this.zone.targetRadius,
        this.zone.radius + expandSpeed * dt,
      );
      this.zone.alpha = Math.min(ZONE_MAX_ALPHA, this.zone.alpha + dt * 1.2);
      this.zone.phase = "expand";
      return;
    }
    if (this.zone.phase === "expand") this.zone.phase = "hold";

    // 2. Телеграф сжатия: зона уже не растёт, но ещё не сжимается.
    if (this.zone.collapseT >= 0) {
      this.zone.collapseT -= dt;
      if (this.zone.collapseT <= 0) {
        this.zone.collapseT = ZONE_NOT_COLLAPSING;
        this.zone.phase = "collapse";
      }
      return;
    }

    // 3. Запуск телеграфа по времени боя.
    if (this.zone.phase === "hold") {
      if (
        this.wave >= ZONE_COLLAPSE_MIN_WAVE &&
        this.elapsed >= this.params.zone.collapse.delay
      ) {
        this.zone.collapseT = ZONE_COLLAPSE_TELEGRAPH;
        this.zone.phase = "collapse";
      }
      return;
    }

    // 4. Сжатие до нижней границы. Скорость ниже скорости игрока.
    const floor = this.zone.targetRadius * this.params.zone.collapse.targetFraction;
    if (this.zone.radius > floor) {
      const collapseSpeed = playerMaxSpeed * speedMult * this.params.zone.collapse.speedMult;
      this.zone.radius = Math.max(floor, this.zone.radius - collapseSpeed * dt);
    }
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
