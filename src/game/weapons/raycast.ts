/**
 * raycast — геометрия мгновенных лучей оружия.
 *
 * Луч задаётся точкой вылета и единичным направлением; цель — круг.
 * Функция возвращает расстояние до входа луча в круг (null — луч
 * проходит мимо). Используется лазером, рельсотроном и любым оружием,
 * которое бьёт по линии без снаряда.
 */

/** Расстояние до точки входа луча в круг (null — луч не попадает в круг). */
export function rayCircleEntryDistance(
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  hx: number,
  hy: number,
  r: number,
): number | null {
  const fx = ox - hx;
  const fy = oy - hy;
  const b = fx * dx + fy * dy;
  const c = fx * fx + fy * fy - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  if (t >= 0) return t;
  // Круг цели впереди, но источник уже внутри него — стартуем сразу.
  return c <= 0 ? 0 : null;
}
