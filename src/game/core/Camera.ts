/**
 * Camera - управляет камерой игрового мира.
 * 
 * Координаты мира:
 * - (0, 0) = центр камеры
 * - width/2, height/2 = правый нижний угол в мировых координатах
 * - -width/2, -height/2 = левый верхний угол в мировых координатах
 * 
 * Методы:
 * - screenToWorld(x, y) → {x, y}: экранные CSS пиксели → мировые координаты
 * - worldToScreen(x, y) → {x, y}: мировые координаты → экранные CSS пиксели
 * - applyTo(renderer): применяет камеру к Renderer
 * - getWorldBounds(): возвращает границы мира для рендеринга
 */

import type { Renderer } from "../render";

export class Camera {
  private _width = 800;
  private _height = 600;
  private _dpr = 1;

  get width(): number { return this._width; }
  get height(): number { return this._height; }
  get dpr(): number { return this._dpr; }
  get webGLWidth(): number { return Math.floor(this._width * this._dpr); }
  get webGLHeight(): number { return Math.floor(this._height * this._dpr); }

  /** Центрированная видимая область в мировых координатах */
  get worldLeft(): number { return -this._width / 2; }
  get worldRight(): number { return this._width / 2; }
  get worldTop(): number { return -this._height / 2; }
  get worldBottom(): number { return this._height / 2; }

  /** Преобразует экранные CSS пиксели (от 0,0 в левом верхнем углу) в мировые координаты */
  screenToWorld(sx: number, sy: number): { x: number; y: number } {
    const wx = -this._width / 2 + sx;
    const wy = -this._height / 2 + sy;
    return { x: wx, y: wy };
  }

  /** Преобразует мировые координаты в экранные CSS пиксели */
  worldToScreen(wx: number, wy: number): { x: number; y: number } {
    const sx = wx + this._width / 2;
    const sy = wy + this._height / 2;
    return { x: sx, y: sy };
  }

  /** Проверяет что мировая точка внутри экрана с запасой margin */
  isVisible(wx: number, wy: number, margin: number = 0): boolean {
    return (
      wx > this.worldLeft - margin &&
      wx < this.worldRight + margin &&
      wy > this.worldTop - margin &&
      wy < this.worldBottom + margin
    );
  }

  /** Применяет камеру к Renderer для рендеринга в мировых координатах */
  applyTo(renderer: Renderer, shakeX: number = 0, shakeY: number = 0): void {
    renderer.setCamera(0, 0, 1, shakeX, shakeY);
  }

  resize(width: number, height: number, dpr: number = 1): void {
    this._width = width;
    this._height = height;
    this._dpr = dpr;
  }
}
