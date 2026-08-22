/**
 * InputSystem — обработка мыши и тач-ввода для прицеливания и стрельбы.
 * Инкапсулирует DOM-события, состояние курсора/тача и callback для обновления
 * угла прицеливания, чтобы Game не работался с raw DOM напрямую.
 */

export interface InputSystemHooks {
  /** Вызывается при изменении позиции мыши (screen-space coordinates + window dimensions). */
  onAimUpdate(mouseX: number, mouseY: number, winW: number, winH: number): void;
  /** Вызывается при изменении состояния стрельбы. */
  onFiringChanged(firing: boolean): void;
}

export class InputSystem {
  private mouseX = 0;
  private mouseY = 0;
  private mouseDown = false;

  private onMouseMove = (e: MouseEvent) => {
    const rect = this.canvas.getBoundingClientRect();
    this.mouseX = e.clientX - rect.left;
    this.mouseY = e.clientY - rect.top;
    this.hooks.onAimUpdate(
      this.mouseX,
      this.mouseY,
      window.innerWidth,
      window.innerHeight
    );
  };

  private onMouseDown = (e: MouseEvent) => {
    this.mouseDown = true;
    this.hooks.onFiringChanged(true);
  };

  private onMouseUp = () => {
    this.mouseDown = false;
    this.hooks.onFiringChanged(false);
  };

  private onMouseLeave = () => {
    this.mouseDown = false;
    this.hooks.onFiringChanged(false);
  };

  private onTouchStart = (e: TouchEvent) => {
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
    this.canvas.addEventListener('touchstart', this.onTouchStart, { passive: true });
    this.canvas.addEventListener('touchend', this.onTouchEnd);
  }

  destroy() {
    this.canvas.removeEventListener('mousemove', this.onMouseMove);
    this.canvas.removeEventListener('mousedown', this.onMouseDown);
    this.canvas.removeEventListener('mouseup', this.onMouseUp);
    this.canvas.removeEventListener('mouseleave', this.onMouseLeave);
    this.canvas.removeEventListener('touchstart', this.onTouchStart);
    this.canvas.removeEventListener('touchend', this.onTouchEnd);
  }

  get mouse(): { x: number; y: number } {
    return { x: this.mouseX, y: this.mouseY };
  }

  get isDown(): boolean {
    return this.mouseDown;
  }
}
