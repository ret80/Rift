/**
 * GamepadManager — опрос состояния геймпада через Web Gamepad API.
 *
 * Отвечает только за нормализацию данных геймпада: оси движения (левый стик +
 * D-pad) и кнопки (A, B, Start). Не знает об игровой логике — только сырые
 * данные ввода.
 *
 * Маппинг кнопок (стандартный Gamepad API):
 *   0 — A / Cross (подтвердить)
 *   1 — B / Circle (отмена)
 *   8 — Start / Options (пауза)
 *   12 — D-pad up
 *   13 — D-pad down
 *   14 — D-pad left
 *   15 — D-pad right
 *
 * Оси:
 *   0, 1 — левый стик (x, y)
 *   12-15 — D-pad (эмулируется через кнопки)
 */

/** Виртуальные коды кнопок геймпада для consumePress(). */
export const GAMEPAD_CODES = {
  A: "GamepadA" as const,
  B: "GamepadB" as const,
  Start: "GamepadStart" as const,
} as const;

/** Виртуальные коды D-pad для consumePress(). */
export const GAMEPAD_DPAD_CODES = {
  Up: "GamepadDpadUp" as const,
  Down: "GamepadDpadDown" as const,
  Left: "GamepadDpadLeft" as const,
  Right: "GamepadDpadRight" as const,
} as const;

export type GamepadButtonCode =
  (typeof GAMEPAD_CODES)[keyof typeof GAMEPAD_CODES]
  | (typeof GAMEPAD_DPAD_CODES)[keyof typeof GAMEPAD_DPAD_CODES];

/** Стандартные кнопки геймпада по индексам. */
export const GAMEPAD_BUTTONS = {
  A: 0,       // Cross / A
  B: 1,       // Circle / B
  X: 2,       // Square / X
  Y: 3,       // Triangle / Y
  LB: 4,      // L1
  RB: 5,      // R1
  LT: 6,      // L2 (trigger)
  RT: 7,      // R2 (trigger)
  Start: 8,   // Options / Start
  Select: 9,  // Share / View
  L3: 10,     // Left stick click
  R3: 11,     // Right stick click
  DpadUp: 12,
  DpadDown: 13,
  DpadLeft: 14,
  DpadRight: 15,
} as const;

/** Мёртвая зона левого стика (по умолчанию 0.15). */
const DEFAULT_DEADZONE = 0.15;
/** Мёртвая зона D-pad (по умолчанию 0.5 — полунажатие). */
const DEFAULT_BUTTON_DEADZONE = 0.5;

export class GamepadManager {
  /** Индекс подключённого геймпада (-1 если ни одного). */
  private gamepadIndex = -1;
  /** Быстрая ссылка на текущий объект gamepad. */
  private _gamepad: Gamepad | null = null;

  /** Нормализованная ось движения (левый стик + D-pad). */
  private _axisX = 0;
  private _axisY = 0;

  /** Флаг: зажатая кнопка (для isButton). */
  private _pressedA = false;
  private _pressedB = false;
  private _pressedStart = false;
  private _pressedDpadUp = false;
  private _pressedDpadDown = false;
  private _pressedDpadLeft = false;
  private _pressedDpadRight = false;

  /** Одноразовые нажатия (для consumePress). */
  private _justPressedA = false;
  private _justPressedB = false;
  private _justPressedStart = false;
  private _justPressedDpadUp = false;
  private _justPressedDpadDown = false;
  private _justPressedDpadLeft = false;
  private _justPressedDpadRight = false;

  /** Мёртвая зона левого стика. */
  private deadzone: number;
  /** Мёртвая зона кнопок (триггеры, D-pad). */
  private buttonDeadzone: number;

  constructor(
    options: { deadzone?: number; buttonDeadzone?: number } = {},
  ) {
    this.deadzone = options.deadzone ?? DEFAULT_DEADZONE;
    this.buttonDeadzone = options.buttonDeadzone ?? DEFAULT_BUTTON_DEADZONE;
  }

  /** Подключён ли геймпад. */
  get isConnected(): boolean {
    return this.gamepadIndex >= 0 && this._gamepad !== null;
  }

  /** Нормализованная ось движения. */
  get axisX(): number {
    return this._axisX;
  }

  get axisY(): number {
    return this._axisY;
  }

  /** Опросить состояние геймпада. Вызывается каждый кадр. */
  poll(): void {
    // Если геймпад был подключён, но исчез — отключаемся.
    if (this.gamepadIndex >= 0) {
      const gamepads = navigator.getGamepads();
      if (gamepads[this.gamepadIndex] === null) {
        this._disconnect();
        return;
      }
    }

    // Если геймпад не подключён — ищем первый доступный.
    if (this.gamepadIndex < 0) {
      const gamepads = navigator.getGamepads();
      for (let i = 0; i < gamepads.length; i++) {
        const gp = gamepads[i];
        if (gp !== null) {
          this._connect(i, gp);
          break;
        }
      }
    }

    // Если геймпад подключён — опрашиваем.
    if (this._gamepad === null) return;

    this._pollState();
  }

  /** Проверить, зажата ли кнопка. */
  isButton(code: GamepadButtonCode): boolean {
    switch (code) {
      case GAMEPAD_CODES.A:
        return this._pressedA;
      case GAMEPAD_CODES.B:
        return this._pressedB;
      case GAMEPAD_CODES.Start:
        return this._pressedStart;
      case GAMEPAD_DPAD_CODES.Up:
        return this._pressedDpadUp;
      case GAMEPAD_DPAD_CODES.Down:
        return this._pressedDpadDown;
      case GAMEPAD_DPAD_CODES.Left:
        return this._pressedDpadLeft;
      case GAMEPAD_DPAD_CODES.Right:
        return this._pressedDpadRight;
      default:
        return false;
    }
  }

  /**
   * Проверить и погасить одноразовое нажатие кнопки.
   * Возвращает true один раз на каждое физическое нажатие.
   */
  consumePress(code: GamepadButtonCode): boolean {
    switch (code) {
      case GAMEPAD_CODES.A: {
        if (!this._justPressedA) return false;
        this._justPressedA = false;
        return true;
      }
      case GAMEPAD_CODES.B: {
        if (!this._justPressedB) return false;
        this._justPressedB = false;
        return true;
      }
      case GAMEPAD_CODES.Start: {
        if (!this._justPressedStart) return false;
        this._justPressedStart = false;
        return true;
      }
      case GAMEPAD_DPAD_CODES.Up: {
        if (!this._justPressedDpadUp) return false;
        this._justPressedDpadUp = false;
        return true;
      }
      case GAMEPAD_DPAD_CODES.Down: {
        if (!this._justPressedDpadDown) return false;
        this._justPressedDpadDown = false;
        return true;
      }
      case GAMEPAD_DPAD_CODES.Left: {
        if (!this._justPressedDpadLeft) return false;
        this._justPressedDpadLeft = false;
        return true;
      }
      case GAMEPAD_DPAD_CODES.Right: {
        if (!this._justPressedDpadRight) return false;
        this._justPressedDpadRight = false;
        return true;
      }
      default:
        return false;
    }
  }

  /** Установить мёртвую зону стика. */
  setDeadzone(z: number): void {
    this.deadzone = z;
  }

  /** Установить мёртвую зону кнопок. */
  setButtonDeadzone(z: number): void {
    this.buttonDeadzone = z;
  }

  /** Сбросить все состояния (при паузе / потере фокуса). */
  clear(): void {
    this._axisX = 0;
    this._axisY = 0;
    this._pressedA = false;
    this._pressedB = false;
    this._pressedStart = false;
    this._pressedDpadUp = false;
    this._pressedDpadDown = false;
    this._pressedDpadLeft = false;
    this._pressedDpadRight = false;
    this._justPressedA = false;
    this._justPressedB = false;
    this._justPressedStart = false;
    this._justPressedDpadUp = false;
    this._justPressedDpadDown = false;
    this._justPressedDpadLeft = false;
    this._justPressedDpadRight = false;
  }

  // ===== Private =====

  private _connect(index: number, gamepad: Gamepad): void {
    this.gamepadIndex = index;
    this._gamepad = gamepad;
  }

  private _disconnect(): void {
    this.gamepadIndex = -1;
    this._gamepad = null;
  }

  private _pollState(): void {
    const gp = this._gamepad;
    if (gp === null) return;

    // Обновляем ссылку (объект Gamepad может заменяться браузером).
    const gamepads = navigator.getGamepads();
    if (gamepads[this.gamepadIndex] !== null) {
      this._gamepad = gamepads[this.gamepadIndex];
    }

    // --- Оси: левый стик ---
    let stickX = 0;
    let stickY = 0;
    if (gp.axes.length >= 2) {
      stickX = gp.axes[0];
      stickY = gp.axes[1];
    }

    // --- D-pad (как оси, если поддерживается) ---
    // Некоторые геймпады (DualShock, Xbox) эмулируют D-pad через оси.
    let dpadX = 0;
    let dpadY = 0;

    // Проверяем, активен ли стик (выходит за мёртвую зону).
    const stickActive = Math.abs(stickX) > this.deadzone || Math.abs(stickY) > this.deadzone;

    if (!stickActive) {
      // Если стик в мёртвой зоне — используем кнопки D-pad.
      if (gp.buttons.length > 15) {
        const dpadUp = gp.buttons[GAMEPAD_BUTTONS.DpadUp]?.value ?? 0;
        const dpadDown = gp.buttons[GAMEPAD_BUTTONS.DpadDown]?.value ?? 0;
        const dpadLeft = gp.buttons[GAMEPAD_BUTTONS.DpadLeft]?.value ?? 0;
        const dpadRight = gp.buttons[GAMEPAD_BUTTONS.DpadRight]?.value ?? 0;

        if (dpadUp > this.buttonDeadzone) dpadY -= 1;
        if (dpadDown > this.buttonDeadzone) dpadY += 1;
        if (dpadLeft > this.buttonDeadzone) dpadX -= 1;
        if (dpadRight > this.buttonDeadzone) dpadX += 1;
      }
    }

    // Мёрджим стик и D-pad (если оба активны — стик имеет приоритет).
    const finalX = stickActive ? stickX : dpadX;
    const finalY = stickActive ? stickY : dpadY;

    // Нормализуем к единичной окружности.
    const len = Math.hypot(finalX, finalY);
    if (len > 1) {
      this._axisX = finalX / len;
      this._axisY = finalY / len;
    } else {
      this._axisX = finalX;
      this._axisY = finalY;
    }

    // --- Кнопки ---
    const buttons = gp.buttons;

    // Кнопка A (подтвердить).
    const wasA = this._pressedA;
    this._pressedA = buttons[GAMEPAD_BUTTONS.A]?.pressed ?? false;
    this._justPressedA = this._pressedA && !wasA;

    // Кнопка B (отмена).
    const wasB = this._pressedB;
    this._pressedB = buttons[GAMEPAD_BUTTONS.B]?.pressed ?? false;
    this._justPressedB = this._pressedB && !wasB;

    // Кнопка Start (пауза).
    const wasStart = this._pressedStart;
    this._pressedStart = buttons[GAMEPAD_BUTTONS.Start]?.pressed ?? false;
    this._justPressedStart = this._pressedStart && !wasStart;

    // D-pad.
    const dpadWasUp = this._pressedDpadUp;
    const dpadWasDown = this._pressedDpadDown;
    const dpadWasLeft = this._pressedDpadLeft;
    const dpadWasRight = this._pressedDpadRight;

    this._pressedDpadUp = buttons[GAMEPAD_BUTTONS.DpadUp]?.pressed ?? false;
    this._pressedDpadDown = buttons[GAMEPAD_BUTTONS.DpadDown]?.pressed ?? false;
    this._pressedDpadLeft = buttons[GAMEPAD_BUTTONS.DpadLeft]?.pressed ?? false;
    this._pressedDpadRight = buttons[GAMEPAD_BUTTONS.DpadRight]?.pressed ?? false;

    this._justPressedDpadUp = this._pressedDpadUp && !dpadWasUp;
    this._justPressedDpadDown = this._pressedDpadDown && !dpadWasDown;
    this._justPressedDpadLeft = this._pressedDpadLeft && !dpadWasLeft;
    this._justPressedDpadRight = this._pressedDpadRight && !dpadWasRight;
  }
}
