/**
 * Рендер-слой: абстрактный интерфейс отрисовки и реализации бэкендов.
 *
 * Игровой код использует только IRenderer. Конкретная реализация
 * выбирается в композиционном корне (GameContext).
 */

export type { IRenderer, RenderMode, RGBA } from "./IRenderer";
export { MAX_DPR, getDpr } from "./config";
export { BaseRenderer } from "./BaseRenderer";
export { PicoGLRenderer } from "./PicoGLRenderer";
export { NullRenderer } from "./NullRenderer";
export type { FrameStats } from "./NullRenderer";