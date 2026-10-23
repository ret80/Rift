/**
 * GrazeSystem — касания (грейз).
 *
 * Каждый вражеский снаряд, прошедший рядом с кораблём без попадания,
 * засчитывается как касание и даёт очки.
 *
 * Система ничего не знает о коллизиях: о касаниях ей сообщает шина
 * событий по событию bullet_grazed.
 */

import {
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
  /** Всего касаний за забег — для HUD и статистики. */
  private grazes = 0;

  constructor(eventBus: EventBus, fx: Fx, scoring: ScoringSystem) {
    this.fx = fx;
    this.scoring = scoring;

    eventBus.subscribe("bullet_grazed", (event) => {
      const count = event.payload.count;
      if (count <= 0) return;
      this.grazes += count;
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

  /** Число касаний за забег. */
  getGrazes(): number {
    return this.grazes;
  }

  /** Сбросить состояние — начало забега. */
  reset(): void {
    this.grazes = 0;
  }
}
