/**
 * ZoneTypes - унифицированные типы для управления зоной.
 * Единственный источник определения ZoneData.
 */

export interface ZoneData {
  active: boolean;
  x: number;
  y: number;
  radius: number;
  targetRadius: number;
  alpha: number;
  collapseT: number; // -1 = не схлопывается, >=0 = время схлопывания
}
