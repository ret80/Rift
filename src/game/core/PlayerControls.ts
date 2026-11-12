/**
 * PlayerControls — узкий порт управления игроком.
 *
 * Игровые системы (`PlayerSystem`, `AbilitySystem`) больше не знают ни о
 * `InputManager`, ни о мыши/геймпаде: им нужны только ось движения, угол
 * прицела, готовность стрелять и одноразовое нажатие способности.
 *
 * Реализации:
 *   • `HumanControls` — оборачивает `InputManager` (клавиатура/мышь/геймпад);
 *   • `AgentControls` — принимает `PlayerIntent` от `PlayerAgent`.
 *
 * Порт не даёт доступа к состоянию мира: агент видит только `PlayerView`.
 */

import type { InputManager } from "../input";

/** Намерение игрока на один тик. */
export interface PlayerIntent {
  /** Ось движения -1..1 по X. */
  moveX: number;
  /** Ось движения -1..1 по Y. */
  moveY: number;
  /** Угол прицела, радианы; null — автонаведение. */
  aimAngle: number | null;
  /** Готовность стрелять. */
  firing: boolean;
  /**
   * Альтернативный огонь.
   *
   * Необязателен: записи сессий v1 сняты до появления alt-fire, и повтор
   * такого забега не должен падать. Отсутствие поля — «не нажат».
   */
  altFiring?: boolean;
  /** Запрос способности: живёт ровно один тик. */
  ability: boolean;
  /**
   * Удержание активного щита.
   *
   * Необязательно: записи сессий до появления щита не содержат поля,
   * отсутствие означает «не удерживает».
   */
  shield?: boolean;
}

/** Пустое намерение (стоит на месте, не стреляет). */
export function emptyPlayerIntent(): PlayerIntent {
  return { moveX: 0, moveY: 0, aimAngle: null, firing: false, altFiring: false, ability: false };
}

/** Управление игроком, доступное игровым системам. */
export interface PlayerControls {
  /** Ось движения в -1..1 (уже нормализована). */
  readonly axis: { x: number; y: number };
  /** Ручной угол прицела; null — автонаведение. */
  readonly aimAngle: number | null;
  /** Игрок держит огонь. */
  readonly firing: boolean;
  /** Игрок держит альтернативный огонь (правая кнопка мыши). */
  readonly altFiring: boolean;
  /** Игрок удерживает активный щит (сектор перед кораблём). */
  readonly shieldHeld: boolean;
  /** Одноразовое нажатие способности: true ровно один тик. */
  consumeAbility(): boolean;
  /**
   * Одноразовый запрос форсажа: true ровно один тик.
   *
   * Форсаж — базовый глагол игрока, а не способность из пикапа: он не
   * занимает слот нагрузки и доступен всегда, но срабатывает только
   * при полном заряде энергии.
   */
  consumeBoost(): boolean;
  /**
   * Была ли способность потреблена на текущем тике.
   *
   * Нужно для сэмпла поведения без повторного `consumeAbility()`: второй
   * вызов съел бы нажатие и изменил игру. Реализуют только агентские порты;
   * у человеческого ввода источник правды — `RecordingControls.noteAbility`.
   */
  readonly lastConsumedAbility?: boolean;
}

/**
 * Человеческое управление: единственное место, где игровые системы
 * касаются `InputManager`.
 */
export class HumanControls implements PlayerControls {
  private manualAim: number | null = null;
  private manualFiring = false;
  private manualAltFiring = false;

  constructor(private readonly input: InputManager) {}

  get axis(): { x: number; y: number } {
    return this.input.axis;
  }

  get aimAngle(): number | null {
    return this.manualAim;
  }

  get firing(): boolean {
    return this.manualFiring;
  }

  get altFiring(): boolean {
    return this.manualAltFiring;
  }

  get shieldHeld(): boolean {
    return this.input.isKey("KeyQ");
  }

  /** Прицел из мыши/тача (угол в мировых координатах). */
  setAim(angle: number | null): void {
    this.manualAim = angle;
  }

  /** Кнопка огня (мышь/тач/геймпад). */
  setFiring(firing: boolean): void {
    this.manualFiring = firing;
  }

  /** Кнопка альтернативного огня (правая кнопка мыши). */
  setAltFiring(altFiring: boolean): void {
    this.manualAltFiring = altFiring;
  }

  consumeAbility(): boolean {
    return this.input.consumePress("Space");
  }

  consumeBoost(): boolean {
    // Второй вызов consumePress выполняется только если первый не сработал:
    // иначе одно нажатие съедало бы два запроса.
    return this.input.consumePress("ShiftLeft") || this.input.consumePress("ShiftRight");
  }
}

/**
 * Управление от агента: хранит последнее `PlayerIntent`.
 *
 * `ability` гасится при первом `consumeAbility()`, поэтому способность
 * не «съедается» дважды за тик и не тянется на следующие тики.
 */
export class AgentControls implements PlayerControls {
  private intent: PlayerIntent = emptyPlayerIntent();
  private abilityPending = false;
  private _lastConsumedAbility = false;

  get axis(): { x: number; y: number } {
    return { x: this.intent.moveX, y: this.intent.moveY };
  }

  get aimAngle(): number | null {
    return this.intent.aimAngle;
  }

  get firing(): boolean {
    return this.intent.firing;
  }

  get altFiring(): boolean {
    return this.intent.altFiring === true;
  }

  get shieldHeld(): boolean {
    return this.intent.shield === true;
  }

  get lastConsumedAbility(): boolean {
    return this._lastConsumedAbility;
  }

  /** Записать намерение агента на текущий тик. */
  setIntent(intent: PlayerIntent): void {
    this.intent = intent;
    this.abilityPending = intent.ability;
    this._lastConsumedAbility = false;
  }

  /** Забыть намерение (мир сброшен, тик не выполнялся). */
  reset(): void {
    this.intent = emptyPlayerIntent();
    this.abilityPending = false;
    this._lastConsumedAbility = false;
  }

  consumeAbility(): boolean {
    if (!this.abilityPending) return false;
    this.abilityPending = false;
    this._lastConsumedAbility = true;
    return true;
  }

  /**
   * Агенты пока не умеют в форсаж: `PlayerIntent` не содержит этого поля.
   * Мир всё равно остаётся детерминированным, а человек получает глагол
   * из HUD/клавиатуры.
   */
  consumeBoost(): boolean {
    return false;
  }
}
