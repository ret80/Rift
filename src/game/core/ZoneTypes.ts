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
 *  • collapse — телеграф и сжатие к доле целевого радиуса.
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
   * Остаток телеграфа перед сжатием; ZONE_NOT_COLLAPSING, когда
   * телеграфа нет (зона не сжимается или уже сжимается).
   */
  collapseT: number;
  /** Текущая фаза зоны внутри волны. */
  phase: ZonePhase;
}
