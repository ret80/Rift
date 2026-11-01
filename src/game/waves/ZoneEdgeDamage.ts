/**
 * ZoneEdgeDamage — урон и предупреждение за краем зоны.
 *
 * Зона проницаема для игрока: как только центр корабля оказывается за
 * реальной границей (radius + epsilon), сразу показывается предупреждение
 * и начинается непрерывный урон долей от максимального здоровья. Урон идёт
 * в обход щита — вне зоны игрок теряет ровно 10% max HP в секунду.
 *
 * Возврат внутрь фиксируется с гистерезисом (radius - hysteresis), чтобы
 * на самой границе урон и тост не мигали каждый кадр.
 *
 * Тост-таймер остаётся у WaveOrchestrator: он же чистит тост при зачистке
 * волны, поэтому наружу отдаётся только запрос длительности.
 */

import { t } from "../../i18n";
import {
  ZONE_EARLY_DAMAGE_THRESHOLD,
  ZONE_EDGE_DAMAGE_FRACTION_PER_SEC,
  ZONE_EDGE_DAMAGE_INTERVAL,
  ZONE_EDGE_SHAKE_STRENGTH,
  ZONE_EXIT_EPSILON,
  ZONE_REENTRY_HYSTERESIS,
} from "../balance";
import type { ZoneData } from "../core/ZoneTypes";

/** Длительность короткого тоста предупреждения (секунды). */
const TOAST_CLEAR_SHORT = 1.5;

export interface ZoneEdgeHooks {
  onToast: (text: string, color?: string) => void;
  /** Урон в обход щита: ровно 10%/с от максимального HP. */
  hitPlayerRaw: (amount: number) => void;
  shakeScreen: (strength: number, duration: number) => void;
}

export interface PlayerPosition {
  x: number;
  y: number;
}

export class ZoneEdgeDamage {
  /** Игрок сейчас считается находящимся вне зоны. */
  private outside = false;
  /** Таймер пульсов тряски. */
  private tickTime = 0;

  /** Игрок вне зоны (используется индикатором направления). */
  get isOutside(): boolean {
    return this.outside;
  }

  /** Сбросить состояние (новая волна/забег). */
  reset(): void {
    this.outside = false;
    this.tickTime = 0;
  }

  /**
   * Тик урона за краем зоны.
   * @param playerMaxHp — максимальное здоровье игрока (база для 10%/с).
   * @param keepToast — запросить очистку тоста через N секунд.
   */
  update(
    dt: number,
    zone: ZoneData,
    playerPos: PlayerPosition,
    playerMaxHp: number,
    hooks: ZoneEdgeHooks,
    keepToast: (seconds: number) => void,
  ): void {
    if (!zone.active || zone.radius <= 0) {
      this.reset();
      return;
    }

    // Не наносим урон, пока зона не расширилась хотя бы наполовину:
    // на старте волны она ещё «растёт» из точки под игроком.
    if (zone.radius < zone.targetRadius * ZONE_EARLY_DAMAGE_THRESHOLD) {
      this.reset();
      return;
    }

    const dx = playerPos.x - zone.x;
    const dy = playerPos.y - zone.y;
    const dist = Math.sqrt(dx * dx + dy * dy);

    if (!this.outside) {
      if (dist > zone.radius + ZONE_EXIT_EPSILON) {
        this.outside = true;
        this.tickTime = 0;
        hooks.onToast(t("game.zoneWarning"), "#fa5");
        keepToast(TOAST_CLEAR_SHORT);
        hooks.shakeScreen(ZONE_EDGE_SHAKE_STRENGTH, 0.2);
      }
    } else if (dist < zone.radius - ZONE_REENTRY_HYSTERESIS) {
      this.outside = false;
      this.tickTime = 0;
    }

    if (!this.outside) return;

    // Непрерывный урон в обход щита: 10% максимального здоровья в секунду.
    hooks.hitPlayerRaw(playerMaxHp * ZONE_EDGE_DAMAGE_FRACTION_PER_SEC * dt);

    // Встряска — не каждый кадр, а пульсами, чтобы не залить экран.
    this.tickTime += dt;
    if (this.tickTime >= ZONE_EDGE_DAMAGE_INTERVAL) {
      this.tickTime = 0;
      hooks.shakeScreen(ZONE_EDGE_SHAKE_STRENGTH, 0.2);
    }
  }
}
