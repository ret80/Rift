/**
 * ZoneTypes - unified types for zone management.
 * Single source of truth for ZoneData definition.
 */

/** Sentinel value: zone is not collapsing */
export const ZONE_NOT_COLLAPSING = -1;

export interface ZoneData {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  /** Time until zone collapse; -1 means not collapsing */
  collapseT: number;
}
