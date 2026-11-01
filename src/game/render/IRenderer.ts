/**
 * IRenderer — абстрактный интерфейс системы отрисовки.
 *
 * Вся игровая логика рендера (RendererSystem, рендереры объектов,
 * starfield, fx и т.д.) работает только через этот контракт.
 * Конкретные бэкенды (raw WebGL / PicoGL) инкапсулируются в
 * реализациях, поэтому WebGL-вызовы не размазаны по коду игры.
 */

/** Цвет в формате [r, g, b, a], компоненты 0..1. */
export type RGBA = [number, number, number, number];

/** Режим координат: "world" — с камерой, "screen" — в пикселях вьюпорта. */
export type RenderMode = "screen" | "world";

/**
 * Слой отрисовки.
 *  - "scene" — объекты, которые попадают в bloom (пули, враги, лучи, эффекты);
 *  - "flat"  — ровная графика без постобработки (зона), рисуется под сценой.
 */
export type RenderLayer = "scene" | "flat";

export interface IRenderer {
  /** Канвас, на который выполняется отрисовка. */
  readonly canvas: HTMLCanvasElement;

  /** Ширина поверхности в device-пикселях. */
  width: number;
  /** Высота поверхности в device-пикселях. */
  height: number;

  /** Обновить размеры канваса (CSS-пиксели; DPR учитывается внутри). */
  resize(cssW: number, cssH: number): void;

  /** Начать кадр: очистить offscreen-сцену и сбросить батчи. */
  beginFrame(): void;

  /** Очистить весь канвас (для меню/дебага). */
  clear(): void;

  /** Переключить режим координат (world/screen). */
  setMode(mode: RenderMode): void;

  /**
   * Переключить целевой слой отрисовки.
   *
   * "flat" используется для графики, которая должна лежать ПОД объектами
   * сцены и не должна попадать в bloom (например, заливка игровой зоны).
   * Переключение сбрасывает накопленные батчи, поэтому порядок вызовов
   * внутри одного слоя сохраняется.
   */
  setLayer(layer: RenderLayer): void;

  /** Установить камеру: центр мира, зум и тряску экрана. */
  setCamera(camX: number, camY: number, zoom: number, shakeX: number, shakeY: number): void;

  /** Добавить отрезок в батч линий. */
  pushLine(x1: number, y1: number, x2: number, y2: number, c: RGBA): void;

  /**
   * Залить кольцо между радиусами rInner и rOuter.
   * Цвет и альфа линейно интерполируются от внутреннего края к внешнему.
   */
  fillRing(
    cx: number, cy: number, rInner: number, rOuter: number,
    cInner: RGBA, cOuter: RGBA, segs?: number
  ): void;

  /** Добавить лазерный луч (светящийся квад с ядром и ореолом). */
  pushBeam(
    x1: number, y1: number, x2: number, y2: number,
    width: number, c: RGBA, seed: number
  ): void;

  /** Нарисовать ломаную по точкам. */
  polyline(pts: Array<[number, number]>, closed: boolean, c: RGBA): void;

  /** Нарисовать окружность из отрезков. */
  circle(cx: number, cy: number, r: number, c: RGBA, segs?: number, alphaScale?: number): void;

  /** Нарисовать пунктирную окружность. */
  dashedCircle(
    cx: number, cy: number, r: number,
    c: RGBA, dashes: number, phase: number, gapRatio?: number
  ): void;

  /** Нарисовать полигон с центром, поворотом и точками. */
  drawPolygon(
    x: number, y: number, angle: number,
    pts: Array<[number, number]>, c: RGBA, closed?: boolean
  ): void;

  /** Завершить кадр: сбросить батчи, выполнить постобработку (bloom). */
  finish(time: number): void;

  /** Освободить ресурсы и снять обработчики контекста (при уничтожении игры). */
  destroy?(): void;
}