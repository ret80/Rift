/**
 * NullRenderer — отладочная реализация IRenderer без WebGL.
 *
 * Рисует на Canvas 2D (примитивы аппроксимируются отрезками), но главное —
 * накапливает debug-метрики кадра: сколько линий/лучей/полигонов/окружностей
 * и т.п. пришло в рендер. Это позволяет отлаживать игру в окружениях без
 * WebGL (например, в headless-браузере), не ломая логику кадрового цикла.
 *
 * Подключается через URL-параметр ?renderer=null в GameContext.
 */

import type { IRenderer, RenderMode, RGBA } from "./IRenderer";
import { getDpr } from "./config";

/** Метрики отрисованных примитивов за один кадр. */
export interface FrameStats {
  lines: number;
  beams: number;
  polylines: number;
  circles: number;
  dashedCircles: number;
  polygons: number;
}

export class NullRenderer implements IRenderer {
  readonly canvas: HTMLCanvasElement;
  width = 0;
  height = 0;

  /** Debug-счётчики за последний завершённый кадр. */
  stats: FrameStats = {
    lines: 0,
    beams: 0,
    polylines: 0,
    circles: 0,
    dashedCircles: 0,
    polygons: 0,
  };

  private mode: RenderMode = "world";
  private camX = 0;
  private camY = 0;
  private zoom = 1;
  private shakeX = 0;
  private shakeY = 0;
  private ctx: CanvasRenderingContext2D | null = null;
  private dpr = 1;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    if (!this.ctx) throw new Error("NullRenderer: Canvas 2D не поддерживается");
  }

  resize(cssW: number, cssH: number) {
    this.dpr = getDpr();
    const w = Math.max(1, Math.floor(cssW * this.dpr));
    const h = Math.max(1, Math.floor(cssH * this.dpr));
    if (w === this.width && h === this.height) return;
    this.width = w;
    this.height = h;
    this.canvas.width = w;
    this.canvas.height = h;
  }

  beginFrame() {
    this.stats = { lines: 0, beams: 0, polylines: 0, circles: 0, dashedCircles: 0, polygons: 0 };
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    ctx.fillStyle = "rgba(0,0,0,1)";
    ctx.fillRect(0, 0, this.width, this.height);
    this.mode = "world";
  }

  clear() {
    const ctx = this.ctx;
    if (!ctx) return;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
  }

  setMode(mode: RenderMode) {
    this.mode = mode;
  }

  setCamera(camX: number, camY: number, zoom: number, shakeX: number, shakeY: number) {
    this.camX = camX;
    this.camY = camY;
    this.zoom = zoom;
    this.shakeX = shakeX;
    this.shakeY = shakeY;
  }

  /** Спроецировать мировую точку в экранные пиксели. */
  private toScreen(x: number, y: number): [number, number] {
    const z = this.mode === "world" ? this.zoom : 1;
    const cx = this.mode === "world" ? this.camX : 0;
    const cy = this.mode === "world" ? this.camY : 0;
    const ox = this.width / 2 - cx * z + (this.mode === "world" ? this.shakeX * this.dpr : 0);
    const oy = this.height / 2 - cy * z + (this.mode === "world" ? this.shakeY * this.dpr : 0);
    return [x * z + ox, y * z + oy];
  }

  private rgba(c: RGBA): string {
    return `rgba(${Math.round(c[0] * 255)},${Math.round(c[1] * 255)},${Math.round(c[2] * 255)},${c[3]})`;
  }

  pushLine(x1: number, y1: number, x2: number, y2: number, c: RGBA) {
    this.stats.lines++;
    const ctx = this.ctx;
    if (!ctx) return;
    const [sx1, sy1] = this.toScreen(x1, y1);
    const [sx2, sy2] = this.toScreen(x2, y2);
    ctx.strokeStyle = this.rgba(c);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sx1, sy1);
    ctx.lineTo(sx2, sy2);
    ctx.stroke();
  }

  pushBeam(x1: number, y1: number, x2: number, y2: number, width: number, c: RGBA, _seed: number) {
    this.stats.beams++;
    this.pushLine(x1, y1, x2, y2, c);
  }

  polyline(pts: Array<[number, number]>, closed: boolean, c: RGBA) {
    this.stats.polylines++;
    for (let i = 0; i < pts.length - 1; i++) {
      this.pushLine(pts[i][0], pts[i][1], pts[i + 1][0], pts[i + 1][1], c);
    }
    if (closed && pts.length > 2) {
      const a = pts[pts.length - 1];
      const b = pts[0];
      this.pushLine(a[0], a[1], b[0], b[1], c);
    }
  }

  circle(cx: number, cy: number, r: number, c: RGBA, _segs = 48, _alphaScale = 1) {
    this.stats.circles++;
    const ctx = this.ctx;
    if (!ctx) return;
    const [sx, sy] = this.toScreen(cx, cy);
    ctx.strokeStyle = this.rgba(c);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(sx, sy, r * this.zoom, 0, Math.PI * 2);
    ctx.stroke();
  }

  dashedCircle(cx: number, cy: number, r: number, c: RGBA, dashes: number, phase: number, _gapRatio = 0.45) {
    this.stats.dashedCircles++;
    const ctx = this.ctx;
    if (!ctx) return;
    const [sx, sy] = this.toScreen(cx, cy);
    ctx.strokeStyle = this.rgba(c);
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(sx, sy, r * this.zoom, phase, phase + Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  drawPolygon(x: number, y: number, angle: number, pts: Array<[number, number]>, c: RGBA, closed = true) {
    this.stats.polygons++;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    for (let i = 0; i < pts.length; i++) {
      const [px, py] = pts[i];
      const wx = x + px * cos - py * sin;
      const wy = y + px * sin + py * cos;
      const next = pts[(i + 1) % pts.length];
      const nx = x + next[0] * cos - next[1] * sin;
      const ny = y + next[0] * sin + next[1] * cos;
      if (closed || i < pts.length - 1) {
        this.pushLine(wx, wy, nx, ny, c);
      }
    }
  }

  finish(_time: number) {
    // Нет GPU-постобработки. Debug-метрики доступны через this.stats.
  }
}