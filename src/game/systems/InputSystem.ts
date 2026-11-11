/**
 * InputSystem — обработка мыши и тач-ввода для прицеливания и стрельбы.
 * Инкапсулирует DOM-события, состояние курсора/тача и callback для обновления
 * угла прицеливания, чтобы Game не работался с raw DOM напрямую.
 */

import { getViewport } from "../core/env";

export interface InputSystemHooks {
  /** Вызывается при изменении позиции мыши (screen-space coordinates + window dimensions). */
  onAimUpdate(mouseX: number, mouseY: number, winW: number, winH: number): void;
  /** Вызывается при изменении состояния стрельбы. */
  onFiringChanged(firing: boolean): void;
  /** Вызывается при изменении состояния альтернативного огня (правая кнопка). */
  onAltFiringChanged(altFiring: boolean): void;
}

export class InputSystem {
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;
  private altDown = false;

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    const { width, height } = getViewport();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.hooks.onAimUpdate(this.mouseX, this.mouseY, width, height);
  };

  private onMouseDown = (e: MouseEvent) => {
    // Правая кнопка — альтернативный огонь, левая — основной.
    if (e.button === 2) {
      this.altDown = true;
      this.hooks.onAltFiringChanged(true);
      return;
    }
    if (e.button !== 0) return;
    this.mouseDown = true;
    this.hooks.onFiringChanged(true);
  };

  private onMouseUp = (e: MouseEvent) => {
    if (e.button === 2) {
      this.altDown = false;
      this.hooks.onAltFiringChanged(false);
      return;
    }
    if (e.button !== 0) return;
    this.mouseDown = false;
    this.hooks.onFiringChanged(false);
  };

  private onMouseLeave = () => {
    this.mouseDown = false;
    this.hooks.onFiringChanged(false);
    this.altDown = false;
    this.hooks.onAltFiringChanged(false);
  };

  /** Правая кнопка не должна открывать контекстное меню браузера. */
  private onContextMenu = (e: Event) => {
    e.preventDefault();
  };

  private onTouchStart = (_e: TouchEvent) => {
    this.mouseDown = true;
    this.hooks.onFiringChanged(true);
  };

  private onTouchEnd = () => {
    this.mouseDown = false;
    this.hooks.onFiringChanged(false);
  };

  constructor(
    private canvas: HTMLCanvasElement,
    private hooks: InputSystemHooks
  ) {
    // Use the renderer's canvas for mouse events, and the original canvas for touch
    this.canvas.addEventListener('mousemove', this.onMouseMove);
    this.canvas.addEventListener('mousedown', this.onMouseDown);
    this.canvas.addEventListener('mouseup', this.onMouseUp);
    this.canvas.addEventListener('mouseleave', this.onMouseLeave);
    this.canvas.addEventListener('contextmenu', this.onContextMenu);
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
  }

  destroy() {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('contextmenu', this.onContextMenu);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
  }

  get mouse(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY };
  }

  get isDown(): boolean {
    return this.mouseDown;
  }

  get isAltDown(): boolean {
    return this.altDown;
  }
}
