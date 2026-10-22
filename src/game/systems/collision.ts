/**
 * collision.ts — утилиты для обнаружения столкновений кругов.
 * Заменяет дублирующийся паттерн:
 *   const dx = a.x - b.x;
 *   const dy = a.y - b.y;
 *   const dist = Math.hypot(dx, dy);
 *   const minDist = a.r + b.r;
 *   if (dist < minDist) { /* collision * / }
 */

/** Результат проверки столкновения двух кругов. */
export interface CollisionResult {
  /** true если круги пересеклись */
  collided: boolean;
  /** Расстояние между центрами (только если collided === true) */
  dist: number;
  /** Нормализованный вектор от a к b (только если collided === true) */
  nx: number;
  ny: number;
}

/**
 * Проверить столкновение двух кругов.
 *
 * @param ax, ay — позиция круга A
 * @param ar — радиус круга A
 * @param bx, by — позиция круга B
 * @param br — радиус круга B
 * @param onCollision — callback, вызываемый при столкновении.
 *                      Получает нормаль (nx, ny) и расстояние dist.
 *                      Если callback возвращает true — проверка останавливается.
 * @returns true если столкновение найдено, false если нет.
 *          Если onCollision не передан — возвращает boolean.
 */
export function checkCircleCollision(
  ax: number,
  ay: number,
  ar: number,
  bx: number,
  by: number,
  br: number,
  onCollision?: (result: CollisionResult) => boolean
): boolean {
  const dx = ax - bx;
  const dy = ay - by;
  const dist = Math.hypot(dx, dy);
  const minDist = ar + br;

  if (dist < minDist && dist > 0.0001) {
    const nx = dx / dist;
    const ny = dy / dist;

    if (onCollision) {
      return onCollision({ collided: true, dist, nx, ny });
    }
    return true;
  }

  return false;
}

/**
 * Проверить столкновение круга с одним объектом.
 * Возвращает true если столкновение произошло.
 *
 * @param cx, cy — позиция круга
 * @param cr — радиус круга
 * @param ox, oy — позиция объекта
 * @param or — радиус объекта
 * @param onCollision — callback, вызываемый при столкновении.
 *                      Получает нормаль (nx, ny) и расстояние dist.
 * @returns true если onCollision вызван и вернул true (остановить поиск).
 */
export function checkOneCollision(
  cx: number,
  cy: number,
  cr: number,
  ox: number,
  oy: number,
  or: number,
  onCollision: (nx: number, ny: number, dist: number) => boolean
): boolean {
  const dx = cx - ox;
  const dy = cy - oy;
  const dist = Math.hypot(dx, dy);
  const minDist = cr + or;

  if (dist < minDist && dist > 0.0001) {
    return onCollision(dx / dist, dy / dist, dist);
  }
  return false;
}
