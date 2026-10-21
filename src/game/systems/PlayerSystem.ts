/**
 * PlayerSystem — управление игроком.
 *
 * Отвечает только за состояние игрока: движение, корпус и таймеры
 * временных бонусов. Оружие, наведение и стрельба живут в модуле
 * оружия (WeaponManager), поэтому система ничего о них не знает.
 */

import type { EventBus } from '../core/EventBus';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import { RATE_BOOST_TIME } from '../balance';
import type { PlayerBonuses } from '../weapons/Weapon';
import {
  createPlayerState,
  resetPlayerState,
  updateTimers,
  type PlayerState,
} from './PlayerState';
import { getRenderState as getRenderStateHelper } from './PlayerState';
import { updateMovement } from './PlayerMovement';

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

  // ---- Setters ----

  setDashT(t: number): void {
    this.pState.dashT = t;
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

  getDashT(): number {
    return this.pState.dashT;
  }

  /** Множитель темпа огня от временного бонуса. */
  getRateMult(): number {
    return 1 + this.pState.rateBoost;
  }

  getRateT(): number {
    return this.pState.rateT;
  }

  /** Остаток бонуса «доп. стволы». */
  getGunsT(): number {
    return this.pState.extraGunsT;
  }

  /** Текущие бонусы игрока для модуля оружия и строки снаряжения. */
  getBonuses(): PlayerBonuses {
    return {
      rateMult: this.getRateMult(),
      rateT: this.pState.rateT,
      extraBarrels: this.pState.extraGuns,
      extraBarrelsT: this.pState.extraGunsT,
      dashT: this.pState.dashT,
    };
  }

  getRenderState(aimAngle: number | null, barrelCount: number): import('./RendererSystem').PlayerRenderState {
    return getRenderStateHelper(this.pState, aimAngle, barrelCount);
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

  /** Временное ускорение стрельбы. */
  boostRate(): void {
    this.pState.rateBoost = Math.min(1.0, this.pState.rateBoost + 0.2);
    this.pState.rateT = RATE_BOOST_TIME;
  }

  /** Временное добавление стволов. */
  addGunBonus(count: number, duration: number): void {
    this.pState.extraGuns += count;
    this.pState.extraGunsT = duration;
  }

  // ---- Input delegation ----

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }

  // ---- Main update ----

  update(dt: number, active: boolean): void {
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
      this.pState.dashT,
    );

    // Invulnerability timer
    this.pState.invuln = Math.max(0, this.pState.invuln - dt);

    // Bonus timers (rate boost, extra guns)
    updateTimers(this.pState, dt);
  }
}
