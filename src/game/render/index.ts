/**
 * Рендер-слой: абстрактный интерфейс отрисовки и реализации бэкендов.
 *
 * Игровой код использует только IRenderer. Конкретная реализация
 * выбирается в композиционном корне (GameContext).
 */

export { getDpr, MAX_DPR } from "./config";
export type { IRenderer, RenderLayer, RenderMode, RGBA } from "./IRenderer";
export { NullRenderer } from "./NullRenderer";
export type { FrameStats } from "./NullRenderer";
export { PicoGLRenderer } from "./PicoGLRenderer";

