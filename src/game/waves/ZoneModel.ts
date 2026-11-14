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
 *   3. collapse — пошаговое сжатие рывками (см. ниже).
 *
 * Сжатие — не непрерывное движение края, а серия рывков:
 *   • через `collapse.delay` секунд боя от текущего края появляется
 *     пунктирное кольцо;
 *   • за `collapse.dashTime` оно уезжает внутрь на `collapse.stepFraction`
 *     от радиуса волны, арена при этом не двигается;
 *   • короткая пауза `collapse.pauseTime`;
 *   • арена резко схлопывается до пунктира, пунктир исчезает, край вспыхивает;
 *   • отдых `collapse.cooldown`, затем следующий рывок.
 * Рывки идут, пока арена не потеряет `collapse.maxLoss` радиуса волны.
 *
 * Сжатие уступает буре: пока на кромке идёт телеграф или удар, рывок не
 * начинается. Во время самого рывка буря скрыта (см. ZoneStorm).
 * Урон наносит только край зоны: сам рывок не убивает.
 */

import {
  ZONE_CLEAR_FADE_TIME,
  ZONE_INITIAL_RADIUS,
  ZONE_MAX_ALPHA,
  zoneRadiusFor,
  zoneExpandSpeed,
} from "../balance";
import { DEFAULT_PARAMS, type GameParams } from "../balance/params/GameParams";
import type { ZoneData } from "../core/ZoneTypes";
import { ZONE_NOT_COLLAPSING } from "../core/ZoneTypes";
import { clamp } from "../math";

/** Стадия сжатия: покой/отдых, движение пунктира, пауза перед рывком. */
type CollapseStage = "idle" | "dash" | "pause";

/** Сколько длится вспышка края после схлопывания, секунды. */
const SNAP_FLASH_TIME = 0.35;

/** Запас, ниже которого арена считается доехавшей до дна сжатия, px. */
const FLOOR_EPSILON = 0.5;

export class ZoneModel {
  private readonly zone: ZoneData = {
    active: false,
    x: 0,
    y: 0,
    radius: 0,
    targetRadius: 0,
    alpha: 0,
    collapseT: ZONE_NOT_COLLAPSING,
    dashRadius: 0,
    snapFlash: 0,
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

  /** Текущая стадия сжатия. */
  private stage: CollapseStage = "idle";
  /** Остаток отдыха между рывками, секунды. */
  private cooldown = 0;
  /** Радиус края в начале рывка. */
  private dashFrom = 0;
  /** Радиус, до которого рывок сожмёт арену. */
  private dashTo = 0;
  /** Зона уже доросла до радиуса волны (расширение больше не повторяется). */
  private expanded = false;

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
    this.zone.phase = "expand";
    this.elapsed = 0;
    this.wave = 1;
    this.resetCollapse();
  }

  /** Подготовить зону к новой волне: центр у игрока, радиус 0, выключена. */
  prepare(playerX: number, playerY: number): void {
    this.zone.active = false;
    this.zone.x = playerX;
    this.zone.y = playerY;
    this.zone.radius = 0;
    this.zone.targetRadius = 0;
    this.zone.alpha = 0;
    this.zone.phase = "expand";
    this.elapsed = 0;
    this.resetCollapse();
  }

  /** Скрыть зону между волнами, сохранив геометрию. */
  hide(): void {
    this.zone.active = false;
  }

  /** Волна зачищена: запомнить текущую альфу и оборвать сжатие. */
  beginClear(): void {
    this.clearFromAlpha = this.zone.alpha;
    this.resetCollapse();
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
    this.zone.phase = "expand";
    this.zone.active = true;
    this.wave = wave;
    this.elapsed = 0;
    this.resetCollapse();
  }

  /**
   * Один кадр боя: расширение и пошаговое сжатие рывками.
   * @param speedMult множитель скорости из прокачки «скорость»
   * @param playerMaxSpeed базовая максимальная скорость игрока
   * @param stormBusy на кромке идёт буря — рывок ждёт её окончания
   */
  update(
    dt: number,
    speedMult: number,
    playerMaxSpeed: number,
    stormBusy: boolean = false,
  ): void {
    if (!this.zone.active) return;
    this.elapsed += dt;
    if (this.zone.snapFlash > 0) {
      this.zone.snapFlash = Math.max(0, this.zone.snapFlash - dt / SNAP_FLASH_TIME);
    }

    // 1. Расширение до радиуса волны выполняется ровно один раз за волну:
    // иначе сжатый край снова «отрастал» бы к радиусу волны.
    if (!this.expanded) {
      this.zone.radius = Math.min(
        this.zone.targetRadius,
        this.zone.radius + zoneExpandSpeed(speedMult, playerMaxSpeed) * dt,
      );
      this.zone.alpha = Math.min(ZONE_MAX_ALPHA, this.zone.alpha + dt * 1.2);
      this.zone.phase = "expand";
      if (this.zone.radius >= this.zone.targetRadius) {
        this.zone.radius = this.zone.targetRadius;
        this.expanded = true;
        this.zone.phase = "hold";
      }
      return;
    }

    // 2. Рывок: пунктирное кольцо уезжает внутрь, арена ещё стоит.
    if (this.stage === "dash") {
      const duration = Math.max(0.01, this.params.zone.collapse.dashTime);
      this.zone.collapseT = Math.max(0, this.zone.collapseT - dt);
      const progress = 1 - clamp(this.zone.collapseT / duration, 0, 1);
      this.zone.dashRadius = this.dashFrom + (this.dashTo - this.dashFrom) * progress;
      if (this.zone.collapseT <= 0) {
        this.stage = "pause";
        this.zone.collapseT = Math.max(0, this.params.zone.collapse.pauseTime);
        this.zone.dashRadius = this.dashTo;
      }
      return;
    }

    // 3. Пауза перед схлопыванием: пунктир стоит, арена держит прежний край.
    if (this.stage === "pause") {
      this.zone.collapseT -= dt;
      if (this.zone.collapseT <= 0) {
        this.zone.radius = this.dashTo;
        this.zone.dashRadius = 0;
        this.zone.collapseT = ZONE_NOT_COLLAPSING;
        this.zone.snapFlash = 1;
        this.zone.phase = "hold";
        this.stage = "idle";
        this.cooldown = Math.max(0, this.params.zone.collapse.cooldown);
      }
      return;
    }

    // 4. Отдых между рывками.
    if (this.cooldown > 0) {
      this.cooldown = Math.max(0, this.cooldown - dt);
      return;
    }

    // 5. Пока буря активна, сжатие не начинается.
    if (stormBusy) return;

    const collapse = this.params.zone.collapse;
    if (this.wave < collapse.minWave) return;
    if (this.elapsed < collapse.delay) return;

    const floor = this.zone.targetRadius * (1 - collapse.maxLoss);
    if (this.zone.radius <= floor + FLOOR_EPSILON) return;

    const step = this.zone.targetRadius * collapse.stepFraction;
    this.dashFrom = this.zone.radius;
    this.dashTo = Math.max(floor, this.zone.radius - step);
    this.stage = "dash";
    this.zone.collapseT = Math.max(0.01, collapse.dashTime);
    this.zone.dashRadius = this.dashFrom;
    this.zone.phase = "collapse";
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

  /** Сбросить сжатие и вернуть зону к состоянию «ещё не расширялась». */
  private resetCollapse(): void {
    this.stage = "idle";
    this.cooldown = 0;
    this.dashFrom = 0;
    this.dashTo = 0;
    this.expanded = false;
    this.zone.collapseT = ZONE_NOT_COLLAPSING;
    this.zone.dashRadius = 0;
    this.zone.snapFlash = 0;
  }
}
