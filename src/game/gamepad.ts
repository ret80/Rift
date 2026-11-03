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
 *   9 — Start / Options (пауза), 8 — Select / Share
 *   12 — D-pad up
 *   13 — D-pad down
 *   14 — D-pad left
 *   15 — D-pad right
 *
 * Устройства делятся на два профиля:
 *   - standard — `mapping === "standard"` или неизвестное устройство:
 *     стандартные индексы кнопок, D-pad кнопками 12-15;
 *   - 8bitdo_dinput — 8BitDo Lite 2 и совместимые в D-input:
 *     X/Y = 3/4, L/R = 6/7, Select/Start = 10/11, D-pad — HID hat switch
 *     на оси 9.
 *
 * Оси:
 *   0, 1 — левый стик (x, y)
 *   9 — hat switch D-pad (только профиль 8bitdo_dinput)
 */

/** Виртуальные коды кнопок геймпада для consumePress(). */
export const GAMEPAD_CODES = {
  A: "GamepadA" as const,
  B: "GamepadB" as const,
  X: "GamepadX" as const,
  Y: "GamepadY" as const,
  LB: "GamepadLB" as const,
  RB: "GamepadRB" as const,
  Start: "GamepadStart" as const,
  Select: "GamepadSelect" as const,
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
  Start: 9,   // Options / Start / Plus
  Select: 8,  // Share / View / Minus
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

/** Профиль устройства: стандартный, 8BitDo D-input или общий D-input. */
type GamepadProfile = "standard" | "8bitdo_dinput" | "generic_dinput";

/** Раскладка кнопок, не зависящая от `gamepad.mapping`. */
interface ButtonLayout {
  A: number;
  B: number;
  X: number;
  Y: number;
  LB: number;
  RB: number;
  Start: number;
  Select: number;
}

/** Стандартная раскладка W3C Gamepad. */
const STANDARD_BUTTONS: ButtonLayout = {
  A: 0,
  B: 1,
  X: 2,
  Y: 3,
  LB: 4,
  RB: 5,
  Select: 8,
  Start: 9,
};

/**
 * Раскладка 8BitDo Lite 2 и совместимых в D-input режиме.
 *
 * Отличия от стандартной: X/Y сдвинуты (3/4), L/R — 6/7, Select/Start — 10/11.
 * D-pad приходит как HID hat switch на оси 9, не кнопками 12-15.
 */
const DINPUT_8BITDO_BUTTONS: ButtonLayout = {
  A: 0,
  B: 1,
  X: 3,
  Y: 4,
  LB: 6,
  RB: 7,
  Select: 10,
  Start: 11,
};

/**
 * Определить профиль устройства.
 *
 * Ключевое правило: если браузер выставляет `gamepad.mapping === "standard"`,
 * мы всегда используем стандартный профиль — D-pad кнопками, стандартные индексы.
 * Только при отсутствии стандартного маппинга мы пробуем угадать D-input профиль.
 */
function resolveGamepadProfile(gp: Gamepad): GamepadProfile {
  if (gp.mapping === "standard") return "standard";
  if (/8bitdo|2dc8/i.test(gp.id)) return "8bitdo_dinput";
  // D-input с hat-switch на оси 9, но без «8BitDo» в id. Точную раскладку
  // кнопок у такого устройства не угадать, поэтому это общий профиль:
  // общие индексы D-input + диагностика в debug-оверлее.
  if (gp.axes.length > 9) return "generic_dinput";
  return "standard";
}

/** Раскладка кнопок для профиля. */
function getButtonLayout(profile: GamepadProfile): ButtonLayout {
  return profile === "standard" ? STANDARD_BUTTONS : DINPUT_8BITDO_BUTTONS;
}

/**
 * Раскодировать HID hat switch (одна ось) в направление D-pad.
 *
 * Значения восьми направлений равномерно распределены в [-1..1]:
 * up = -1, up-right = -0.714, right = -0.429, down-right = -0.143,
 * down = 0.143, down-left = 0.429, left = 0.714, up-left = 1.
 * В нейтральном положении ось читается вне диапазона (например, 1.286)
 * или нулём — такие значения игнорируем.
 */
function decodeHat(value: number): { x: number; y: number } {
  if (!Number.isFinite(value) || value < -1.05 || value > 1.05 || Math.abs(value) < 0.01) {
    return { x: 0, y: 0 };
  }
  const up = (value >= -1 && value < -0.7) || (value >= 0.95 && value <= 1);
  const right = value >= -0.75 && value < -0.1;
  const down = value >= -0.2 && value < 0.45;
  const left = value >= 0.4 && value <= 1;
  return {
    x: (right ? 1 : 0) - (left ? 1 : 0),
    y: (down ? 1 : 0) - (up ? 1 : 0),
  };
}

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
  private _pressedX = false;
  private _pressedY = false;
  private _pressedLB = false;
  private _pressedRB = false;
  private _pressedStart = false;
  private _pressedSelect = false;
  private _pressedDpadUp = false;
  private _pressedDpadDown = false;
  private _pressedDpadLeft = false;
  private _pressedDpadRight = false;

  /** Одноразовые нажатия (для consumePress). */
  private _justPressedA = false;
  private _justPressedB = false;
  private _justPressedX = false;
  private _justPressedY = false;
  private _justPressedLB = false;
  private _justPressedRB = false;
  private _justPressedStart = false;
  private _justPressedSelect = false;
  private _justPressedDpadUp = false;
  private _justPressedDpadDown = false;
  private _justPressedDpadLeft = false;
  private _justPressedDpadRight = false;

  /** Мёртвая зона левого стика. */
  private deadzone: number;
  /** Мёртвая зона кнопок (триггеры, D-pad). */
  private buttonDeadzone: number;

  /** Профиль последнего опрошенного устройства. */
  private _profile: GamepadProfile = "standard";

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

  /** Краткая диагностика устройства для debug-оверлея. */
  get diagnostics(): string | null {
    const gp = this._gamepad;
    if (!gp) return null;
    const axes = Array.from(gp.axes, (v) => v.toFixed(2)).join(" ");
    const pressed = gp.buttons
      .map((b, i) => (b.pressed ? i : -1))
      .filter((i) => i >= 0)
      .join(",");
    return (
      `${gp.id.slice(0, 26)} | ${gp.mapping || "no-map"} | ${this._profile}` +
      ` | axes ${axes} | btn ${pressed || "-"}`
    );
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
      case GAMEPAD_CODES.X:
        return this._pressedX;
      case GAMEPAD_CODES.Y:
        return this._pressedY;
      case GAMEPAD_CODES.LB:
        return this._pressedLB;
      case GAMEPAD_CODES.RB:
        return this._pressedRB;
      case GAMEPAD_CODES.Start:
        return this._pressedStart;
      case GAMEPAD_CODES.Select:
        return this._pressedSelect;
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
      case GAMEPAD_CODES.X: {
        if (!this._justPressedX) return false;
        this._justPressedX = false;
        return true;
      }
      case GAMEPAD_CODES.Y: {
        if (!this._justPressedY) return false;
        this._justPressedY = false;
        return true;
      }
      case GAMEPAD_CODES.LB: {
        if (!this._justPressedLB) return false;
        this._justPressedLB = false;
        return true;
      }
      case GAMEPAD_CODES.RB: {
        if (!this._justPressedRB) return false;
        this._justPressedRB = false;
        return true;
      }
      case GAMEPAD_CODES.Start: {
        if (!this._justPressedStart) return false;
        this._justPressedStart = false;
        return true;
      }
      case GAMEPAD_CODES.Select: {
        if (!this._justPressedSelect) return false;
        this._justPressedSelect = false;
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
    this._pressedX = false;
    this._pressedY = false;
    this._pressedLB = false;
    this._pressedRB = false;
    this._pressedStart = false;
    this._pressedSelect = false;
    this._pressedDpadUp = false;
    this._pressedDpadDown = false;
    this._pressedDpadLeft = false;
    this._pressedDpadRight = false;
    this._justPressedA = false;
    this._justPressedB = false;
    this._justPressedX = false;
    this._justPressedY = false;
    this._justPressedLB = false;
    this._justPressedRB = false;
    this._justPressedStart = false;
    this._justPressedSelect = false;
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

    // Раскладка зависит от устройства: стандартный mapping или D-input 8BitDo.
    const profile = resolveGamepadProfile(gp);
    const layout = getButtonLayout(profile);
    this._profile = profile;

    // --- D-pad: кнопки + оси (для нестандартных геймпадов) ---
    let dpadX = 0;
    let dpadY = 0;

    // 1) Пробуем кнопки 12-15 (только для стандартного профиля).
    //    В D-input на этих индексах могут быть L3/R3 и другие кнопки,
    //    поэтому для нестандартного профиля читаем только hat switch.
    if (profile === "standard" && gp.buttons.length > 15) {
      const dpadUpBtn = gp.buttons[GAMEPAD_BUTTONS.DpadUp]?.value ?? 0;
      const dpadDownBtn = gp.buttons[GAMEPAD_BUTTONS.DpadDown]?.value ?? 0;
      const dpadLeftBtn = gp.buttons[GAMEPAD_BUTTONS.DpadLeft]?.value ?? 0;
      const dpadRightBtn = gp.buttons[GAMEPAD_BUTTONS.DpadRight]?.value ?? 0;

      if (dpadUpBtn > this.buttonDeadzone) dpadY -= 1;
      if (dpadDownBtn > this.buttonDeadzone) dpadY += 1;
      if (dpadLeftBtn > this.buttonDeadzone) dpadX -= 1;
      if (dpadRightBtn > this.buttonDeadzone) dpadX += 1;
    }

    // 2) 8BitDo D-input: D-pad — hat switch на оси 9.
    if (
      profile !== "standard" &&
      dpadX === 0 &&
      dpadY === 0 &&
      gp.axes.length > 9
    ) {
      const d = decodeHat(gp.axes[9]);
      dpadX = d.x;
      dpadY = d.y;
    }

    // 3) Неизвестный нестандартный геймпад: легаси D-pad на осях 5/6.
    //    Не применяем к стандартному mapping и многокоординатным устройствам,
    //    где оси 4-6 — стик/триггеры.
    if (
      profile === "standard" &&
      gp.mapping !== "standard" &&
      dpadX === 0 &&
      dpadY === 0 &&
      gp.axes.length <= 6
    ) {
      const hatThreshold = 0.5;
      // Axis 5: vertical (up = -1, down = +1)
      if (gp.axes.length > 5) {
        if (gp.axes[5] < -hatThreshold) dpadY -= 1;
        else if (gp.axes[5] > hatThreshold) dpadY += 1;
      }
      // Axis 6: horizontal (left = -1, right = +1)
      if (gp.axes.length > 6) {
        if (gp.axes[6] < -hatThreshold) dpadX -= 1;
        else if (gp.axes[6] > hatThreshold) dpadX += 1;
      }
      // Fallback: axes 4/5 (некоторые геймпады)
      if (dpadX === 0 && dpadY === 0 && gp.axes.length > 5) {
        if (gp.axes[4] < -hatThreshold) dpadY -= 1;
        else if (gp.axes[4] > hatThreshold) dpadY += 1;
        if (gp.axes[5] < -hatThreshold) dpadX -= 1;
        else if (gp.axes[5] > hatThreshold) dpadX += 1;
      }
    }

    // Проверяем, активен ли стик (выходит за мёртвую зону).
    const stickActive = Math.abs(stickX) > this.deadzone || Math.abs(stickY) > this.deadzone;

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
    this._pressedA = buttons[layout.A]?.pressed ?? false;
    this._justPressedA = this._pressedA && !wasA;

    // Кнопка B (отмена).
    const wasB = this._pressedB;
    this._pressedB = buttons[layout.B]?.pressed ?? false;
    this._justPressedB = this._pressedB && !wasB;

    // Кнопка X.
    const wasX = this._pressedX;
    this._pressedX = buttons[layout.X]?.pressed ?? false;
    this._justPressedX = this._pressedX && !wasX;

    // Кнопка Y.
    const wasY = this._pressedY;
    this._pressedY = buttons[layout.Y]?.pressed ?? false;
    this._justPressedY = this._pressedY && !wasY;

    // Кнопка LB (L1 / L).
    const wasLB = this._pressedLB;
    this._pressedLB = buttons[layout.LB]?.pressed ?? false;
    this._justPressedLB = this._pressedLB && !wasLB;

    // Кнопка RB (R1 / R).
    const wasRB = this._pressedRB;
    this._pressedRB = buttons[layout.RB]?.pressed ?? false;
    this._justPressedRB = this._pressedRB && !wasRB;

    // Кнопка Start (пауза).
    const wasStart = this._pressedStart;
    this._pressedStart = buttons[layout.Start]?.pressed ?? false;
    this._justPressedStart = this._pressedStart && !wasStart;

    // Кнопка Select.
    const wasSelect = this._pressedSelect;
    this._pressedSelect = buttons[layout.Select]?.pressed ?? false;
    this._justPressedSelect = this._pressedSelect && !wasSelect;

    // D-pad: состояние кнопок + осей для consumePress.
    const dpadWasUp = this._pressedDpadUp;
    const dpadWasDown = this._pressedDpadDown;
    const dpadWasLeft = this._pressedDpadLeft;
    const dpadWasRight = this._pressedDpadRight;

    // Объединяем: для стандартного профиля кнопки ИЛИ оси; для D-input
    // 8BitDo кнопки 12–15 могут быть совсем другими — только hat-ось.
    const dpadButtons =
      profile === "standard" && gp.buttons.length > 15
        ? buttons
        : null;
    this._pressedDpadUp = (dpadButtons?.[GAMEPAD_BUTTONS.DpadUp]?.pressed ?? false) || dpadY < 0;
    this._pressedDpadDown = (dpadButtons?.[GAMEPAD_BUTTONS.DpadDown]?.pressed ?? false) || dpadY > 0;
    this._pressedDpadLeft = (dpadButtons?.[GAMEPAD_BUTTONS.DpadLeft]?.pressed ?? false) || dpadX < 0;
    this._pressedDpadRight = (dpadButtons?.[GAMEPAD_BUTTONS.DpadRight]?.pressed ?? false) || dpadX > 0;

    this._justPressedDpadUp = this._pressedDpadUp && !dpadWasUp;
    this._justPressedDpadDown = this._pressedDpadDown && !dpadWasDown;
    this._justPressedDpadLeft = this._pressedDpadLeft && !dpadWasLeft;
    this._justPressedDpadRight = this._pressedDpadRight && !dpadWasRight;
  }
}
