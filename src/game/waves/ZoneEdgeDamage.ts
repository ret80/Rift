/**
 * ZoneEdgeDamage — урон и предупреждение за краем зоны.
 *
 * Держит таймеры «вне зоны» и раз в интервал наносит урон. Тост-таймер
 * остаётся у WaveOrchestrator: он же чистит тост при зачистке волны,
 * поэтому наружу отдаётся только запрос длительности.
 */

import { t } from "../../i18n";
import {
  ZONE_EARLY_DAMAGE_THRESHOLD,
  ZONE_EDGE_DAMAGE_AMOUNT,
  ZONE_EDGE_DAMAGE_INTERVAL,
  ZONE_EDGE_MARGIN,
  ZONE_EDGE_SHAKE_STRENGTH,
  ZONE_EDGE_WARNING_DELAY,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";

/** Длительность короткого тоста предупреждения (секунды). */
const TOAST_CLEAR_SHORT = 1.5;

export interface ZoneEdgeHooks {
  onToast: (text: string, color?: string) => void;
  hitPlayer: (amount: number) => void;
  shakeScreen: (strength: number, duration: number) => void;
}

export interface PlayerPosition {
  x: number;
  y: number;
}

export class ZoneEdgeDamage {
  private outTime = 0;
  private tickTime = 0;
  private warned = false;

  /** Сбросить таймеры (новая волна/забег). */
  reset(): void {
    this.outTime = 0;
    this.tickTime = 0;
    this.warned = false;
  }

  /**
   * Тик урона за краем зоны.
   * @param keepToast — запросить очистку тоста через N секунд.
   */
  update(
    dt: number,
    zone: ZoneData,
    playerPos: PlayerPosition,
    hooks: ZoneEdgeHooks,
    keepToast: (seconds: number) => void,
  ): void {
    if (!zone.active) return;

    const dx = playerPos.x - zone.x;
    const dy = playerPos.y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    // Не наносим урон, пока зона не расширилась хотя бы наполовину.
    if (zone.radius < zone.targetRadius * ZONE_EARLY_DAMAGE_THRESHOLD) return;

    if (dist > zone.radius - ZONE_EDGE_MARGIN) {
      this.outTime += dt;
      if (!this.warned && this.outTime > ZONE_EDGE_WARNING_DELAY) {
        this.warned = true;
        hooks.onToast(t("game.zoneWarning"), "#fa5");
        keepToast(TOAST_CLEAR_SHORT);
      }
      if (this.tickTime > ZONE_EDGE_DAMAGE_INTERVAL) {
        this.tickTime = 0;
        hooks.hitPlayer(ZONE_EDGE_DAMAGE_AMOUNT);
        hooks.shakeScreen(ZONE_EDGE_SHAKE_STRENGTH, 0.2);
      }
    } else {
      this.outTime = 0;
      this.tickTime = 0;
      this.warned = false;
    }
  }
}
