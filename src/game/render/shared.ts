/**
 * Общие помощники WebGL-бэкендов.
 *
 * Здесь только то, что действительно совпадает у `BaseRenderer` и
 * `PicoGLRenderer`: обработка потери контекста, расчёт размеров буфера
 * по DPR и смещение камеры. Сам рендеринг остаётся в бэкендах.
 */

import { getDpr } from "./config";

/** Размеры backing-store с учётом ограниченного DPR. */
export interface BackingSize {
  dpr: number;
  width: number;
  height: number;
}

/** Посчитать физические размеры canvas по CSS-размерам. */
export function backingSize(cssW: number, cssH: number): BackingSize {
  const dpr = getDpr();
  return {
    dpr,
    width: Math.max(2, Math.floor(cssW * dpr)),
    height: Math.max(2, Math.floor(cssH * dpr)),
  };
}

/** Смещение камеры в пикселях backing-store. */
export interface CameraOffset {
  offX: number;
  offY: number;
}

/** Пересчитать смещение камеры для текущего размера буфера. */
export function cameraOffset(
  width: number,
  height: number,
  dpr: number,
  camX: number,
  camY: number,
  zoom: number,
  shakeX: number,
  shakeY: number,
): CameraOffset {
  return {
    offX: width / 2 - camX * zoom + shakeX * dpr,
    offY: height / 2 - camY * zoom + shakeY * dpr,
  };
}

/** Обработчики потери/восстановления WebGL-контекста. */
export interface ContextLossHandlers {
  onLost: (e: Event) => void;
  onRestored: () => void;
}

/**
 * Подписаться на потерю/восстановление контекста.
 * Возвращает обработчики — их нужно снять в `destroy()`.
 */
export function watchContextLoss(
  canvas: HTMLCanvasElement,
  setLost: (lost: boolean) => void,
  restore: () => void,
): ContextLossHandlers {
  const onLost = (e: Event) => {
    e.preventDefault();
    setLost(true);
  };
  const onRestored = () => {
    setLost(false);
    restore();
  };
  canvas.addEventListener("webglcontextlost", onLost, false);
  canvas.addEventListener("webglcontextrestored", onRestored, false);
  return { onLost, onRestored };
}
