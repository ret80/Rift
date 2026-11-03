/* Centralised input: keyboard + virtual touch joystick + gamepad.
   Exposes a single movement axis so the simulation never touches
   raw DOM events. Pause/blur decisions are delegated to the game
   through callbacks, keeping policy out of this class. */

export interface InputHooks {
  /** KeyP / Escape pressed — the game decides whether to pause. */
  onPauseKey(): void;
  /** Window blurred or hidden — the game decides whether to auto-pause. */
  onLoseFocus(): void;
}

/** Movement vector in -1..1 on each axis (keyboard + touch combined). */
export interface MoveAxis {
  x: number;
  y: number;
}

const TOUCH_DEADZONE = 0.12;

/** Импорты типов для геймпада (отложенные, чтобы избежать циклических зависимостей). */
type GamepadInputSource = {
  isButton(code: string): boolean;
  consumePress(code: string): boolean;
  get axisX(): number;
  get axisY(): number;
  clear(): void;
};

export class InputManager {
  private keys = new Set<string>();
  /** Клавиши, нажатые с прошлой проверки consumePress(). */
  private pressed = new Set<string>();
  private touchActive = false;
  private touchX = 0;
  private touchY = 0;
  /** Источник геймпада (опционально). */
  private _gamepad: GamepadInputSource | null = null;

  private onKeyDown = (e: KeyboardEvent) => {
    if (e.code === "KeyP" || e.code === "Escape") {
      this.hooks.onPauseKey();
      return;
    }
    // Автоповтор удерживаемой клавиши не должен считаться новым нажатием.
    if (!e.repeat) this.pressed.add(e.code);
    this.keys.add(e.code);
  };

  private onKeyUp = (e: KeyboardEvent) => {
    this.keys.delete(e.code);
  };

  private onBlur = () => {
    this.clear();
    this.hooks.onLoseFocus();
  };

  private onVis = () => {
    if (document.hidden) this.onBlur();
  };

  constructor(private hooks: InputHooks) {
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    window.addEventListener("blur", this.onBlur);
    document.addEventListener("visibilitychange", this.onVis);
  }

  /**
   * Combined movement axis, normalised to a unit circle.
   * Приоритет: геймпад > клавиатура + тач.
   */
  get axis(): MoveAxis {
    // Геймпад имеет наивысший приоритет.
    if (this._gamepad !== null) {
      const gx = this._gamepad.axisX;
      const gy = this._gamepad.axisY;
      if (Math.abs(gx) > 0.01 || Math.abs(gy) > 0.01) {
        return { x: gx, y: gy };
      }
    }

    let x = 0;
    let y = 0;
    if (this.keys.has("KeyW") || this.keys.has("ArrowUp")) y -= 1;
    if (this.keys.has("KeyS") || this.keys.has("ArrowDown")) y += 1;
    if (this.keys.has("KeyA") || this.keys.has("ArrowLeft")) x -= 1;
    if (this.keys.has("KeyD") || this.keys.has("ArrowRight")) x += 1;
    if (this.touchActive) {
      x += this.touchX;
      y += this.touchY;
    }
    const len = Math.hypot(x, y);
    if (len > 1) {
      x /= len;
      y /= len;
    }
    return { x, y };
  }

  /** Virtual joystick vector, already normalised with a deadzone. */
  setTouch(active: boolean, x: number, y: number) {
    this.touchActive = active;
    const m = Math.hypot(x, y);
    if (m > 1) {
      x /= m;
      y /= m;
    }
    this.touchX = Math.abs(x) < TOUCH_DEADZONE ? 0 : x;
    this.touchY = Math.abs(y) < TOUCH_DEADZONE ? 0 : y;
  }

  /** Check if a key is currently pressed. */
  isKey(code: string): boolean {
    return this.keys.has(code);
  }

  /**
   * Проверить и погасить одиночное нажатие клавиши.
   * Возвращает true один раз на каждое физическое нажатие —
   * так активируются способности, а не «удержание» клавиши.
   * Поддерживает виртуальные коды геймпада.
   */
  consumePress(code: string): boolean {
    // Сначала проверяем геймпад.
    if (this._gamepad !== null && this._gamepad.consumePress(code)) {
      return true;
    }
    if (!this.pressed.has(code)) return false;
    this.pressed.delete(code);
    return true;
  }

  /** Drop all held keys / touch (used on blur and pause). */
  clear() {
    this.keys.clear();
    this.pressed.clear();
    this.touchActive = false;
    this._gamepad?.clear();
  }

  /** Подключить источник ввода геймпада (вызывается из GameContext). */
  setGamepadSource(gp: GamepadInputSource | null): void {
    this._gamepad = gp;
  }

  destroy() {
    window.removeEventListener("keydown", this.onKeyDown);
    window.removeEventListener("keyup", this.onKeyUp);
    window.removeEventListener("blur", this.onBlur);
    document.removeEventListener("visibilitychange", this.onVis);
  }
}
