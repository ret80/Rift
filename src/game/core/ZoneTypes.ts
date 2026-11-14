/**
 * ZoneTypes - unified types for zone management.
 * Single source of truth for ZoneData definition.
 */

/** Sentinel value: zone is not collapsing */
export const ZONE_NOT_COLLAPSING = -1;

/**
 * Фаза зоны внутри волны:
 *  • expand — зона растёт из точки старта до радиуса волны;
 *  • hold — держится на радиусе волны (фаза «чтения» арены);
 *  • collapse — рывок сжатия: пунктирное кольцо ползёт внутрь, затем
 *    арена резко схлопывается до него.
 */
export type ZonePhase = "expand" | "hold" | "collapse";

export interface ZoneData {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  /**
   * Остаток текущей стадии сжатия (рывка или паузы), секунды;
   * ZONE_NOT_COLLAPSING, когда сжатие не идёт.
   */
  collapseT: number;
  /** Радиус пунктирного кольца; 0 — пунктир не показывается. */
  dashRadius: number;
  /** Вспышка края после схлопывания: 1 сразу после рывка, 0 — погасла. */
  snapFlash: number;
  /** Текущая фаза зоны внутри волны. */
  phase: ZonePhase;
}
