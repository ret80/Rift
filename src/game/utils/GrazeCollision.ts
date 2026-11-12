/**
 * GrazeCollision — касание (грейз) вражеских снарядов и пролёт мимо корабля.
 *
 * В bullet hell «касание» — это прохождение вражеского снаряда вплотную
 * к кораблю без попадания. Оно не наносит урона, но даёт очки.
 *
 * Все проверки делаются по отрезку движения снаряда (swept-проверка):
 * быстрый снаряд за один кадр может пересечь хитбокс целиком.
 */

/** Хитбокс игрока. */
export interface PlayerHitbox {
  /** Центр корабля. */
  x: number;
  y: number;
  /** Внешний радиус смертельной зоны. */
  outer: number;
}

/** Результат проверки вражеских снарядов против корабля. */
export interface EnemyBulletCheck {
  /** Индекс снаряда, попавшего в игрока (-1 — попаданий нет). */
  hitIndex: number;
  /** Индексы снарядов, засчитанных как касание. */
  grazeIndices: number[];
}

/**
 * Расстояние от точки до отрезка.
 * Используется для swept-проверки: снаряд считается пролетевшим мимо,
 * если его отрезок движения прошёл рядом с кораблем.
 */
export function distanceToSegment(
  px: number,
  py: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  if (lenSq < 1e-6) return Math.hypot(px - x1, py - y1);
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  if (t < 0) t = 0;
  else if (t > 1) t = 1;
  return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
}

/**
 * Попадает ли снаряд в корабль (по отрезку движения).
 */
export function segmentHitsHitbox(
  hitbox: PlayerHitbox,
  x1: number,
  y1: number,
  x2: number,
  y2: number
): boolean {
  const dist = distanceToSegment(hitbox.x, hitbox.y, x1, y1, x2, y2);
  return dist <= hitbox.outer;
}

/**
 * Засчитывается ли касание (грейз).
 * Снаряд касается, если он прошёл рядом с хитбоксом — снаружи
 * в полосе касания.
 */
export function segmentGrazesHitbox(
  hitbox: PlayerHitbox,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  band: number
): boolean {
  const dist = distanceToSegment(hitbox.x, hitbox.y, x1, y1, x2, y2);
  return dist > hitbox.outer && dist <= hitbox.outer + band;
}
