/**
 * PlayerSystem — управление игроком.
 *
 * Отвечает только за корабль: движение, корпус, неуязвимость.
 * Временные бонусы (темп огня, доп. стволы, рывок) живут в модуле
 * бонусов под управлением BonusManager, поэтому система ничего о них
 * не знает: рендер и оружие читают бонусы напрямую из менеджера.
 */

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

  private pState: PlayerState;

  constructor(eventBus: EventBus, input: InputManager, fx: Fx) {
    this.eventBus = eventBus;
    this.input = input;
    this.fx = fx;

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

  // ---- Core methods ----

  hit(dmg: number): void {
    if (this.pState.invuln > 0) return;
    this.pState.hp -= dmg;
    if (this.pState.hp <= 0) {
      this.pState.hp = 0;
      this.eventBus.publish('game_over', {});
    }
  }

  heal(amount: number): void {
    this.pState.hp = Math.min(this.pState.maxHp, this.pState.hp + amount);
    this.eventBus.publish('player_healed', { hp: this.pState.hp });
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
    );

    // Invulnerability timer
    this.pState.invuln = Math.max(0, this.pState.invuln - dt);
  }
}
