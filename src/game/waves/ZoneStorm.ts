/**
 * ZoneStorm — периодическая буря на кромке зоны.
 *
 * Сжатие зоны (см. ZoneModel) заставляет игрока сменить радиус раз за волну,
 * но между сжатиями кромка остаётся спокойной: урон наносит только сам выход
 * за границу, а стоять в внешних 18 % радиуса безопасно. Поэтому кромка — не
 * «опасное место», а «место, где ничего не происходит».
 *
 * Буря делает кромку ритмичной: каждые ZONE_STORM_PERIOD секунд сектор
 * ZONE_STORM_SECTOR шириной во внешней полосе вспыхивает. За
 * ZONE_STORM_TELEGRAPH секунд до вспышки сектор виден, поэтому удар честный:
 * его можно обойти по кромке или уйти внутрь. Сам сектор медленно смещается
 * по кругу — «стоять на кромке» нельзя, «двигаться по кромке» можно.
 *
 * Модель не знает о рендере и мире: только геометрия, таймеры и один хук
 * урона. Урон идёт через щит (в отличие от урона за краем зоны) и не
 * упирается в кадры неуязвимости: это среда, а не попадание снаряда.
 */

import {
  ZONE_STORM_BAND,
  ZONE_STORM_DAMAGE_PER_SEC,
  ZONE_STORM_DURATION,
  ZONE_STORM_MIN_WAVE,
  ZONE_STORM_PERIOD,
  ZONE_STORM_SECTOR,
  ZONE_STORM_SPIN,
  ZONE_STORM_TELEGRAPH,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";

/** Фаза бури: покой, телеграф, удар. */
export type ZoneStormPhase = "idle" | "telegraph" | "active";

/** Снимок бури для рендера и HUD. */
export interface ZoneStormState {
  /** Буря в текущем кадре видна (телеграф или удар). */
  active: boolean;
  phase: ZoneStormPhase;
  /** Центр зоны (и сектора), мировые координаты. */
  cx: number;
  cy: number;
  /** Центр сектора, радианы. */
  angle: number;
  /** Половина углового размера сектора, радианы. */
  halfAngle: number;
  /** Внутренний радиус полосы, px. */
  innerRadius: number;
  /** Внешний радиус полосы (совпадает с краем зоны), px. */
  outerRadius: number;
  /** Прогресс телеграфа 0..1 (для пульсации). */
  telegraph: number;
}

export interface ZoneStormHooks {
  /** Урон игроку через щит (буря — среда, а не попадание). */
  hitPlayerShielded: (amount: number) => void;
}

/** Длительность паузы между вспышками, секунды. */
const IDLE_TIME = ZONE_STORM_PERIOD - ZONE_STORM_TELEGRAPH - ZONE_STORM_DURATION;

function emptyState(): ZoneStormState {
  return {
    active: false,
    phase: "idle",
    cx: 0,
    cy: 0,
    angle: 0,
    halfAngle: ZONE_STORM_SECTOR / 2,
    innerRadius: 0,
    outerRadius: 0,
    telegraph: 0,
  };
}

export class ZoneStorm {
  private stateValue: ZoneStormState = emptyState();
  private phase: ZoneStormPhase = "idle";
  /** Остаток текущей фазы, секунды. */
  private timer = IDLE_TIME;
  /** Текущий угол смещения сектора, радианы. */
  private sweep = 0;
  /** Угол, зафиксированный на момент телеграфа. */
  private strikeAngle = 0;

  /** Живое состояние бури (единственный источник правды). */
  get state(): ZoneStormState {
    return this.stateValue;
  }

  /** Полный сброс (новая волна/забег). */
  reset(): void {
    this.stateValue = emptyState();
    this.phase = "idle";
    this.timer = IDLE_TIME;
    this.sweep = 0;
    this.strikeAngle = 0;
  }

  /**
   * Один кадр боя.
   *
   * @param zone — текущее состояние зоны;
   * @param playerPos — позиция игрока;
   * @param playerMaxHp — максимальный корпус (база для урона в долях);
   * @param wave — номер волны (до ZONE_STORM_MIN_WAVE буря выключена).
   */
  update(
    dt: number,
    zone: ZoneData,
    playerPos: { x: number; y: number },
    playerMaxHp: number,
    wave: number,
    hooks: ZoneStormHooks,
  ): void {
    const usable =
      zone.active &&
      zone.radius > 60 &&
      zone.radius >= zone.targetRadius * 0.9 &&
      zone.phase !== "expand" &&
      wave >= ZONE_STORM_MIN_WAVE;

    if (!usable) {
      this.stateValue.active = false;
      this.stateValue.phase = "idle";
      this.stateValue.telegraph = 0;
      this.phase = "idle";
      this.timer = IDLE_TIME;
      return;
    }

    // Сектор смещается всё время, кроме самой вспышки: телеграф должен
    // показывать ту точку, куда придётся удар.
    if (this.phase !== "active") this.sweep += ZONE_STORM_SPIN * dt;

    this.timer -= dt;
    if (this.timer <= 0) this.advancePhase();

    const inner = zone.radius * (1 - ZONE_STORM_BAND);
    this.stateValue.phase = this.phase;
    this.stateValue.active = this.phase !== "idle";
    this.stateValue.cx = zone.x;
    this.stateValue.cy = zone.y;
    this.stateValue.angle = this.phase === "idle" ? this.sweep : this.strikeAngle;
    this.stateValue.innerRadius = inner;
    this.stateValue.outerRadius = zone.radius;
    this.stateValue.telegraph =
      this.phase === "telegraph"
        ? 1 - Math.max(0, this.timer) / ZONE_STORM_TELEGRAPH
        : 0;

    if (this.phase !== "active") return;

    // Удар: игрок в полосе кромки и внутри сектора.
    const dx = playerPos.x - zone.x;
    const dy = playerPos.y - zone.y;
    const dist = Math.hypot(dx, dy);
    if (dist < inner || dist > zone.radius) return;

    let diff = Math.atan2(dy, dx) - this.strikeAngle;
    diff = Math.atan2(Math.sin(diff), Math.cos(diff));
    if (Math.abs(diff) > ZONE_STORM_SECTOR / 2) return;

    hooks.hitPlayerShielded(playerMaxHp * ZONE_STORM_DAMAGE_PER_SEC * dt);
  }

  /** Переход между фазами цикла. */
  private advancePhase(): void {
    switch (this.phase) {
      case "idle":
        this.phase = "telegraph";
        this.timer = ZONE_STORM_TELEGRAPH;
        this.strikeAngle = this.sweep;
        break;
      case "telegraph":
        this.phase = "active";
        this.timer = ZONE_STORM_DURATION;
        break;
      default:
        this.phase = "idle";
        this.timer = IDLE_TIME;
        this.sweep = this.strikeAngle + ZONE_STORM_SPIN * ZONE_STORM_DURATION;
        break;
    }
  }
}
