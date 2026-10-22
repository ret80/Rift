/**
 * GrazeSystem — касания (грейз) и импульс от них.
 *
 * Каждый вражеский снаряд, прошедший рядом с кораблём без попадания,
 * засчитывается как касание. Касание даёт очки и заряжает импульс.
 *
 * Импульс — временный ресурс: он накапливается от плотных пулемётных
 * завесов и утекает со временем. Апгрейд «поглощение импульса»
 * превращает накопленный импульс в прирост скорости корабля.
 *
 * Система ничего не знает о коллизиях: о касаниях ей сообщает шина
 * событий по событию bullet_grazed.
 */

import {
  GRAZE_IMPULSE_DECAY,
  GRAZE_IMPULSE_MAX,
  GRAZE_IMPULSE_PER_GRAZE,
  GRAZE_IMPULSE_SPEED_GAIN,
  GRAZE_SCORE,
} from "../balance/player";
import type { EventBus } from "../core/EventBus";
import type { Fx } from "../fx";
import type { ScoringSystem } from "./ScoringSystem";

/** Цвет искр касания. */
const GRAZE_SPARK_COLOR = "#b9f6ff";

export class GrazeSystem {
  private fx: Fx;
  private scoring: ScoringSystem;
  /** Накопленный импульс, 0..GRAZE_IMPULSE_MAX. */
  private impulse = 0;
  /** Всего касаний за забег — для HUD и статистики. */
  private grazes = 0;
  /** Уровень апгрейда «поглощение импульса». */
  private momentumLevel = 0;

  constructor(eventBus: EventBus, fx: Fx, scoring: ScoringSystem) {
    this.fx = fx;
    this.scoring = scoring;

    eventBus.subscribe("bullet_grazed", (event) => {
      const count = event.payload.count;
      if (count <= 0) return;
      this.grazes += count;
      this.impulse = Math.min(
        GRAZE_IMPULSE_MAX,
        this.impulse + count * GRAZE_IMPULSE_PER_GRAZE
      );
      this.scoring.add(count * GRAZE_SCORE);
      this.fx.burst(
        event.payload.x,
        event.payload.y,
        Math.min(6, count * 2),
        GRAZE_SPARK_COLOR,
        90,
        0.25
      );
    });
  }

  /** Применить уровень апгрейда «поглощение импульса». */
  setMomentumLevel(level: number): void {
    this.momentumLevel = level;
  }

  /** Тик: импульс утекает, если игрок перестал касаться снарядов. */
  update(dt: number): void {
    if (this.impulse <= 0) return;
    this.impulse = Math.max(0, this.impulse - GRAZE_IMPULSE_DECAY * dt);
  }

  /**
   * Множитель скорости от накопленного импульса.
   * Без апгрейда импульс не влияет на движение.
   */
  getSpeedMult(): number {
    if (this.momentumLevel <= 0) return 1;
    return 1 + this.impulse * GRAZE_IMPULSE_SPEED_GAIN * this.momentumLevel;
  }

  /** Текущий заряд импульса, 0..1. */
  getImpulse(): number {
    return this.impulse / GRAZE_IMPULSE_MAX;
  }

  /** Число касаний за забег. */
  getGrazes(): number {
    return this.grazes;
  }

  /** Сбросить состояние — начало забега. */
  reset(): void {
    this.impulse = 0;
    this.grazes = 0;
  }
}
