/**
 * Общие константы рендер-слоя.
 *
 * MAX_DPR ограничивает devicePixelRatio сверху, чтобы на экранах с высокой
 * плотностью пикселей буферы не разрастались до неразумных размеров.
 * Значение единое для всех бэкендов: расхождение DPR между слоями ломает
 * соответствие координат.
 */

import { getDevicePixelRatio } from "../core/env";

export const MAX_DPR = 1.75;

/**
 * Ограниченный devicePixelRatio для текущего окна.
 * В средах без `window` (SSR/тесты) возвращает 1.
 */
export function getDpr(): number {
  return Math.min(getDevicePixelRatio(), MAX_DPR);
}
