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
  /** Запрос способности: живёт ровно один тик. */
  ability: boolean;
}

/** Пустое намерение (стоит на месте, не стреляет). */
export function emptyPlayerIntent(): PlayerIntent {
  return { moveX: 0, moveY: 0, aimAngle: null, firing: false, ability: false };
}

/** Управление игроком, доступное игровым системам. */
export interface PlayerControls {
  /** Ось движения в -1..1 (уже нормализована). */
  readonly axis: { x: number; y: number };
  /** Ручной угол прицела; null — автонаведение. */
  readonly aimAngle: number | null;
  /** Игрок держит огонь. */
  readonly firing: boolean;
  /** Одноразовое нажатие способности: true ровно один тик. */
  consumeAbility(): boolean;
}

/**
 * Человеческое управление: единственное место, где игровые системы
 * касаются `InputManager`.
 */
export class HumanControls implements PlayerControls {
  private manualAim: number | null = null;
  private manualFiring = false;

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

  /** Прицел из мыши/тача (угол в мировых координатах). */
  setAim(angle: number | null): void {
    this.manualAim = angle;
  }

  /** Кнопка огня (мышь/тач/геймпад). */
  setFiring(firing: boolean): void {
    this.manualFiring = firing;
  }

  consumeAbility(): boolean {
    return this.input.consumePress("Space");
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

  get axis(): { x: number; y: number } {
    return { x: this.intent.moveX, y: this.intent.moveY };
  }

  get aimAngle(): number | null {
    return this.intent.aimAngle;
  }

  get firing(): boolean {
    return this.intent.firing;
  }

  /** Записать намерение агента на текущий тик. */
  setIntent(intent: PlayerIntent): void {
    this.intent = intent;
    this.abilityPending = intent.ability;
  }

  /** Забыть намерение (мир сброшен, тик не выполнялся). */
  reset(): void {
    this.intent = emptyPlayerIntent();
    this.abilityPending = false;
  }

  consumeAbility(): boolean {
    if (!this.abilityPending) return false;
    this.abilityPending = false;
    return true;
  }
}
