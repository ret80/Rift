/**
 * RiftAnimation — helpers для анимации rift'ов.
 * Убирает дублирование логики из RendererSystem (drawMenuScene + drawMenuRift).
 */

import { C } from "../../balance";
import type { Renderer } from "../../render";
import { clamp, easeOutCubic } from "../../math";
import { RiftField } from "../../rifts";

/** Фазы анимации rift */
export type RiftPhase = "opening" | "spawning" | "closing" | "hidden";

export interface RiftAnimState {
  state: RiftPhase;
  t: number; // таймер фазы
}

export interface RiftDrawParams {
  x: number;
  y: number;
  size: number;
  seed: number;
  rot: number;
  time: number;
}

/**
 * Вычисляет параметры анимации rift для текущей фазы.
 * Возвращает { lenP, widP, alpha, snake } для отрисовки.
 */
export function calcRiftAnim(
  state: RiftPhase,
  timer: number,
  cycleTime?: number
): { lenP: number; widP: number; alpha: number; snake: number } {
  let lenP = 1;
  let widP = 1;
  let alpha = 1;
  let snake = 1;

  if (state === "opening") {
    if (timer < 0) return { lenP: 0, widP: 0, alpha: 0, snake: 0 };
    const p = clamp(timer / 0.6, 0, 1);
    if (p < 0.42) {
      const q = easeOutCubic(p / 0.42);
      lenP = q;
      widP = 0;
      snake = 0;
      alpha = 0.35 + 0.65 * q;
    } else {
      const q = easeOutCubic((p - 0.42) / 0.58);
      lenP = 1;
      widP = q;
      snake = 1.7 - 0.7 * q;
      alpha = 1;
    }
  } else if (state === "closing") {
    const p = clamp(timer / 0.5, 0, 1);
    if (p < 0.6) {
      const q = easeOutCubic(p / 0.6);
      lenP = 1;
      widP = 1 - q;
      snake = 1 + q * 0.8;
      alpha = 1;
    } else {
      const q = easeOutCubic((p - 0.6) / 0.4);
      lenP = 1 - q;
      widP = 0;
      snake = 0;
      alpha = 1 - q;
    }
  } else if (state === "spawning") {
    lenP = 1 + 0.04 * Math.sin(timer * 6);
    widP = 1 + 0.06 * Math.sin(timer * 6 + 1.4);
    snake = 1;
  } else {
    // hidden
    lenP = 0;
    widP = 0;
    alpha = 0;
  }

  return { lenP, widP, alpha, snake };
}

/**
 * Вычисляет параметры для menu rift (циклическая анимация).
 * Используется в drawMenuScene.
 */
export function calcMenuRiftAnim(cyclePos: number, time: number): {
  lenP: number;
  widP: number;
  alpha: number;
  snake: number;
} {
  const cycleDuration = 4.0;
  const cp = cyclePos % cycleDuration;

  let lenP = 1;
  let widP = 1;
  let alpha = 1;
  let snake = 1;

  // Opening phase: 0.0 - 0.6s
  if (cp < 0.6) {
    const p = cp / 0.6;
    if (p < 0.42) {
      const q = p / 0.42;
      lenP = q;
      widP = 0;
      snake = 0;
      alpha = 0.35 + 0.65 * q;
    } else {
      const q = (p - 0.42) / 0.58;
      lenP = 1;
      widP = q;
      snake = 1.7 - 0.7 * q;
      alpha = 1;
    }
  } else if (cp < 2.6) {
    // Spawning phase: 0.6 - 2.6s
    lenP = 1 + 0.04 * Math.sin(time * 6);
    widP = 1 + 0.06 * Math.sin(time * 6 + 1.4);
    snake = 1.0;
    alpha = 1;
  } else if (cp < 3.6) {
    // Closing phase: 2.6 - 3.6s
    const closeTime = cp - 2.6;
    const p = closeTime / 1.0;
    if (p < 0.6) {
      const q = p / 0.6;
      lenP = 1;
      widP = 1 - q;
      snake = 1 + q * 0.8;
      alpha = 1;
    } else {
      const q = (p - 0.6) / 0.4;
      lenP = 1 - q;
      widP = 0;
      snake = 0;
      alpha = 1 - q;
    }
  } else {
    // Brief pause before restart
    lenP = 0;
    widP = 0;
    alpha = 0;
  }

  return { lenP, widP, alpha, snake };
}

/**
 * Рисует rift с вычисленными параметрами анимации.
 */
export function drawRift(
  R: Renderer,
  params: RiftDrawParams,
  lenP: number,
  widP: number,
  alpha: number,
  snake: number
) {
  if (alpha <= 0.01) return;

  // Small core dot when rift is nearly closed
  if (lenP <= 0.03) {
    const pr = 3 + 1.6 * Math.sin(params.time * 18 + params.seed);
    R.circle(
      params.x,
      params.y,
      Math.max(1.5, pr * lenP),
      [1, 1, 1, 0.9 * alpha],
      10
    );
    return;
  }

  RiftField.drawShape(
    R,
    params.x,
    params.y,
    params.size * lenP,
    params.size * 0.227 * widP,
    params.seed,
    params.time,
    alpha,
    params.rot,
    snake
  );
}


