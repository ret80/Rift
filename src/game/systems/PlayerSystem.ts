/**
 * PlayerSystem - управление игроком.
 * Композиция модулей: PlayerState, PlayerMovement, PlayerCombat.
 */

import type { AudioManager } from './AudioManager';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import { PLAYER_FIRE_CD, RATE_BOOST_TIME } from '../balance';
import {
  createPlayerState,
  resetPlayerState,
  updateTimers,
  type PlayerState,
} from './PlayerState';
import { getRenderState as getRenderStateHelper } from './PlayerState';
import { updateFireCooldown } from './PlayerCombat';
import { updateMovement } from './PlayerMovement';
import {
  launchMissiles,
  activateMissileLauncher,
} from './PlayerCombat';

export class PlayerSystem {
  private eventBus: EventBus;
  private state: GameState;
  private input: InputManager;
  private fx: Fx;
  private audio: AudioManager;
  private getZoneBounds: () => { x: number; y: number; radius: number; active: boolean };
  private spawnPickup: (kind: string, x: number, y: number, vx: number, vy: number) => void;
  private fireAllCallback: (angle: number) => void;

  private pState: PlayerState;
  private fireCd = 0;
  private aimAngle: number | null = null;
  private isFiring = false;
  private lastFireTime = 0;
  private autoFireEnabled = true;

  constructor(
    eventBus: EventBus,
    state: GameState,
    input: InputManager,
    fx: Fx,
    audio: AudioManager,
    getZoneBounds: () => { x: number; y: number; radius: number; active: boolean },
    spawnPickup: (kind: string, x: number, y: number, vx: number, vy: number) => void,
    fireAllCallback: (angle: number) => void,
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.input = input;
    this.fx = fx;
    this.audio = audio;
    this.getZoneBounds = getZoneBounds;
    this.spawnPickup = spawnPickup;
    this.fireAllCallback = fireAllCallback;

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
    this.fireCd = 0;
  }

  // ---- Setters ----

  setGuns(n: number): void {
    this.pState.guns = n;
  }

  setRateBoost(b: number): void {
    this.pState.rateBoost = b;
  }

  setDashT(t: number): void {
    this.pState.dashT = t;
  }

  // ---- HP ----

  addHp(delta: number): void {
    this.pState.hp = Math.max(0, Math.min(this.pState.maxHp, this.pState.hp + delta));
  }

  setMaxHp(max: number): void {
    this.pState.maxHp = max;
    this.pState.hp = Math.min(this.pState.hp, max);
  }

  resetHp(): void {
    this.pState.hp = this.pState.maxHp;
  }

  setInvuln(t: number): void {
    this.pState.invuln = t;
  }

  // ---- Getters ----

  getState(): PlayerState {
    return {
      ...this.pState,
      aimA: this.aimAngle,
      guns: Math.min(5, this.pState.guns + this.pState.extraGuns),
    };
  }

  getPosition(): { x: number; y: number } {
    return { x: this.pState.x, y: this.pState.y };
  }

  getPlayerRef(): { x: number; y: number; vx: number; vy: number } {
    return this.pState;
  }

  getVelocity(): { vx: number; vy: number } {
    return { vx: this.pState.vx, vy: this.pState.vy };
  }

  getHp(): number {
    return this.pState.hp;
  }

  getMaxHp(): number {
    return this.pState.maxHp;
  }

  getGuns(): number {
    return Math.min(5, this.pState.guns + this.pState.extraGuns);
  }

  getRateBoost(): number {
    return this.pState.rateBoost;
  }

  getDashT(): number {
    return this.pState.dashT;
  }

  getInvuln(): number {
    return this.pState.invuln;
  }

  isThrusting(): boolean {
    return this.pState.thrusting;
  }

  getAngle(): number {
    return this.pState.angle;
  }

  getAimA(): number | null {
    return this.pState.aimA;
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

  addGun(): void {
    this.pState.guns++;
  }

  boostRate(): void {
    this.pState.rateBoost = Math.min(1.0, this.pState.rateBoost + 0.2);
    this.pState.rateT = RATE_BOOST_TIME;
  }

  addGunBonus(count: number, duration: number): void {
    this.pState.extraGuns = Math.min(5, this.pState.extraGuns + count);
    this.pState.extraGunsT = duration;
  }

  getRateMult(): number {
    return 1 + this.pState.rateBoost;
  }

  getRateT(): number {
    return this.pState.rateT;
  }

  /** Remaining reload of the main cannon. */
  getFireCd(): number {
    return this.fireCd;
  }

  /** Full reload of the main cannon at the current fire rate. */
  getFireCdMax(): number {
    return PLAYER_FIRE_CD / this.getRateMult();
  }

  /** Remaining lifetime of the missile launcher (0 when inactive). */
  getMissileT(): number {
    return this.pState.missileT;
  }

  /** Remaining lifetime of the extra-barrels bonus. */
  getGunsT(): number {
    return this.pState.extraGunsT;
  }

  getRenderState(): import('./RendererSystem').PlayerRenderState {
    return getRenderStateHelper(this.pState, this.aimAngle);
  }

  // ---- Input delegation ----

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }

  setAim(angle: number | null): void {
    this.aimAngle = angle;
  }

  setIsFiring(firing: boolean): void {
    this.isFiring = firing;
  }

  private fireAll(angle: number): void {
    this.fireAllCallback(angle);
    this.audio.shoot();
  }

  /** Проверяет наличие врагов в зоне поражения и стреляет автоматически.
   * TODO: Реализовать авто-стрельбу — сейчас заглушка.
   */
  private checkAndFireAuto(_dt: number): void {
    // Получаем список врагов из GameState или через eventBus
    // Для простоты, авто-стрельба работает когда есть прицел
    // Реализация будет в game.ts через подписку на события
  }

  // ---- Main update ----

  update(dt: number, active: boolean): void {
    if (!active) return;

    const mv = this.input.axis;
    let ax = mv.x;
    let ay = mv.y;

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

    // Fire cooldown
    this.fireCd = updateFireCooldown(this.fireCd, dt);

    // Auto-fire (stub)
    if (this.autoFireEnabled && this.aimAngle !== null) {
      this.checkAndFireAuto(dt);
    }

    // Manual fire
    if (this.isFiring && this.fireCd <= 0 && this.aimAngle !== null) {
      const fireRate = PLAYER_FIRE_CD / this.getRateMult();
      this.fireCd = fireRate;
      this.lastFireTime = fireRate;
      this.fireAll(this.aimAngle);
    }
  }

  // ---- Missile launcher ----

  activateMissileLauncher(duration: number): void {
    activateMissileLauncher(this.pState, duration);
  }

  launchMissiles(
    dt: number,
    enemies: Array<{ x: number; y: number; dead: boolean; r: number }>,
    bullets: Array<any>,
  ): void {
    launchMissiles(
      this.pState,
      dt,
      enemies,
      bullets,
      this.pState.x,
      this.pState.y,
      this.pState.vx,
      this.pState.vy,
    );
  }
}
