/**
 * PlayerSystem — управление игроком.
 *
 * Отвечает только за корабль: движение, корпус, неуязвимость.
 * Временные бонусы (темп огня, доп. стволы, рывок) живут в модуле
 * бонусов под управлением BonusManager, поэтому система ничего о них
 * не знает: рендер и оружие читают бонусы напрямую из менеджера.
 *
 * Множитель скорости складывается из двух источников:
 *   • апгрейд «скорость» — постоянный, задаётся через setSpeedMult();
 *   • импульс от касаний — временный, приходит из GrazeSystem.
 */

import { PLAYER_HIT_INVULN } from '../balance/player';
import type { EventBus } from '../core/EventBus';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import { updateMovement } from './PlayerMovement';
import {
  createPlayerState,
  resetPlayerState,
  type PlayerState,
} from './PlayerState';

export class PlayerSystem {
  private eventBus: EventBus;
  private input: InputManager;
  private fx: Fx;
  /** Постоянный множитель скорости из апгрейдов. */
  private speedMult = 1;
  /** Поставщик временного множителя скорости (импульс касаний). */
  private getMomentumMult: () => number;

  private pState: PlayerState;

  constructor(
    eventBus: EventBus,
    input: InputManager,
    fx: Fx,
    getMomentumMult: () => number = () => 1,
  ) {
    this.eventBus = eventBus;
    this.input = input;
    this.fx = fx;
    this.getMomentumMult = getMomentumMult;

    this.pState = createPlayerState();

    // Subscribe to player damage events
    eventBus.subscribe('player_damaged', (event) => {
      const data = event.payload as { dmg: number };
      this.hit(data.dmg);
    });

    // Subscribe to drone push events (soft avoidance)
    eventBus.subscribe('drone_push_player', (event) => {
      const data = event.payload as { vx: number; vy: number };
      this.pState.vx += data.vx;
      this.pState.vy += data.vy;
    });
  }

  reset(): void {
    resetPlayerState(this.pState);
  }

  // ---- HP ----

  setMaxHp(max: number): void {
    this.pState.maxHp = max;
    this.pState.hp = Math.min(this.pState.hp, max);
  }

  resetHp(): void {
    this.pState.hp = this.pState.maxHp;
  }

  // ---- Persistent upgrades ----

  /** Постоянный множитель скорости из апгрейда «скорость». */
  setSpeedMult(mult: number): void {
    this.speedMult = mult;
  }

  /** Радиус безопасного ядра хитбокса (апгрейд «фантомный хитбокс»). */
  setCoreRadius(radius: number): void {
    this.pState.core = radius;
  }

  // ---- Getters ----

  /** Живая ссылка на состояние игрока. */
  getPlayerRef(): PlayerState {
    return this.pState;
  }

  getPosition(): { x: number; y: number } {
    return { x: this.pState.x, y: this.pState.y };
  }

  getHp(): number {
    return this.pState.hp;
  }

  getMaxHp(): number {
    return this.pState.maxHp;
  }

  /**
   * Мгновенно перенести корабль в точку, сбросив скорость.
   * Используется активной способностью «телепорт-подмена».
   */
  teleportTo(x: number, y: number): void {
    this.pState.x = x;
    this.pState.y = y;
    this.pState.vx = 0;
    this.pState.vy = 0;
  }

  // ---- Core methods ----

  hit(dmg: number): void {
    if (this.pState.invuln > 0) return;
    this.pState.hp -= dmg;
    // Кадры неуязвимости после попадания: спасают от залпа в упор.
    this.pState.invuln = PLAYER_HIT_INVULN;
    if (this.pState.hp <= 0) {
      this.pState.hp = 0;
      this.eventBus.publish('game_over', {});
    }
  }

  heal(amount: number): void {
    this.pState.hp = Math.min(this.pState.maxHp, this.pState.hp + amount);
  }

  // ---- Input delegation ----

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }

  // ---- Main update ----

  update(dt: number, active: boolean, dashT: number): void {
    if (!active) return;

    const mv = this.input.axis;
    const ax = mv.x;
    const ay = mv.y;

    // Movement module
    updateMovement(
      this.pState,
      dt,
      ax,
      ay,
      this.fx,
      ax * ax + ay * ay > 0,
      dashT,
      this.speedMult * this.getMomentumMult(),
    );

    // Invulnerability timer
    this.pState.invuln = Math.max(0, this.pState.invuln - dt);
  }
}
