/**
 * CameraSystem — система управления камерой.
 * 
 * Отвечает за:
 * - Плавное слежение за целью (smooth follow)
 * - Управление zoom и resize
 * - Преобразования world/screen через Camera
 * 
 * Камера линейно интерполирует позицию к целевой точке каждый кадр.
 */

import { CAMERA_SMOOTHING, FPS_SMOOTHING_FACTOR } from "../balance";
import { Camera } from "../core/Camera";

export interface CameraPosition {
  x: number;
  y: number;
  zoom: number;
}

export class CameraSystem {
  private camera = new Camera();

  private camX = 0;
  private camY = 0;
  private zoom = 1;

  constructor() {
  }

  /** Exposes internal Camera for systems that need DPR/WebGL dimensions (e.g. MenuScene) */
  getRawCamera(): Camera {
    return this.camera;
  }

  /** Обновляет камеру — плавно следует за targetPos */
  update(targetPos: { x: number; y: number }, dt: number): void {
    const factor = Math.min(1, CAMERA_SMOOTHING * FPS_SMOOTHING_FACTOR);
    const dx = targetPos.x - this.camX;
    const dy = targetPos.y - this.camY;
    this.camX += dx * factor;
    this.camY += dy * factor;
  }

  getPosition(): CameraPosition {
    return { x: this.camX, y: this.camY, zoom: this.zoom };
  }

  setZoom(z: number): void {
    this.zoom = z;
  }

  resize(w: number, h: number, dpr: number): void {
    this.camera.resize(w, h, dpr);
  }
}
