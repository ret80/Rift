/**
 * PlayerSystem - управление игроком.
 * Отвечает за движение, стрельбу, здоровье и состояние игрока.
 */

import type { AudioManager } from './AudioManager';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import { TAU, lerpAngle as lerpAngleMath, rand } from '../math';
import type { RGBA } from '../render';
import {
  massForRadius,
  PLAYER_FIRE_CD,
  PLAYER_MAX_SPEED,
  PLAYER_RADIUS,
  PLAYER_BULLET_SPEED,
  MISSILE_SPEED,
  MISSILE_LIFE,
  MISSILE_DMG,
  MISSILE_TURN_RATE,
  MISSILE_LAUNCH_INTERVAL,
} from '../balance';
import type { Enemy } from '../types';

interface PlayerState {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  invuln: number;
  guns: number;
  rateBoost: number;
  rateT: number;
  thrusting: boolean;
  dashT: number;
  aimA: number | null;
  mass: number;
  // Missile launcher
  missileActive: boolean;
  missilePort: number;
  missileCd: number;
  // Extra guns bonus (from pickup)
  extraGuns: number;
  extraGunsT: number;
}

export class PlayerSystem {
  private eventBus: EventBus;
  private state: GameState;
  private input: InputManager;
  private fx: Fx;
  private audio: AudioManager;
  private getZoneBounds: () => { x: number; y: number; radius: number; active: boolean };
  private spawnPickup: (kind: string, x: number, y: number, vx: number, vy: number) => void;
  private fireAllCallback: (angle: number) => void;
  
  private pState: PlayerState = {
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,
    hp: 100,
    maxHp: 100,
    invuln: 0,
    guns: 1,
    rateBoost: 0,
    rateT: 0,
    thrusting: false,
    dashT: 0,
    aimA: null,
    mass: massForRadius(PLAYER_RADIUS),
    // Missile launcher
    missileActive: false,
    missilePort: 0,
    missileCd: 0,
    // Extra guns bonus
    extraGuns: 0,
    extraGunsT: 0,
  };
  
  private fireCd = 0;
  private aimAngle: number | null = null;
  private isFiring = false;
  private lastFireTime = 0;
  private autoFireEnabled = true;
  // Missile launcher timer
  private missileDurationT = 0;
  
  // Для внешних систем
  public bulletList: Array<{
    x: number; y: number; vx: number; vy: number; life: number; dmg: number;
    homingTarget?: { x: number; y: number; r: number };
    homingTurnRate?: number;
  }> = [];
  
  constructor(
    eventBus: EventBus,
    state: GameState,
    input: InputManager,
    fx: Fx,
    audio: AudioManager,
    getZoneBounds: () => { x: number; y: number; radius: number; active: boolean },
    spawnPickup: (kind: string, x: number, y: number, vx: number, vy: number) => void,
    fireAllCallback: (angle: number) => void
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.input = input;
    this.fx = fx;
    this.audio = audio;
    this.getZoneBounds = getZoneBounds;
    this.spawnPickup = spawnPickup;
    this.fireAllCallback = fireAllCallback;

    // Subscribe to player hit events
    eventBus.on('player_hit', (event) => {
      const data = event.payload as { dmg: number };
      this.hit(data.dmg);
    });
  }
  
  reset(): void {
    this.pState = {
      x: 0,
      y: 0,
      vx: 0,
      vy: 0,
      angle: -Math.PI / 2,
      hp: 100,
      maxHp: 100,
      invuln: 0,
      guns: 1,
      rateBoost: 0,
      rateT: 0,
      thrusting: false,
      dashT: 0,
      aimA: null,
      mass: massForRadius(PLAYER_RADIUS),
      // Missile launcher
      missileActive: false,
      missilePort: 0,
      missileCd: 0,
      // Extra guns bonus
      extraGuns: 0,
      extraGunsT: 0,
    };
    this.fireCd = 0;
    this.bulletList = [];
    this.pState.extraGuns = 0;
    this.pState.extraGunsT = 0;
    this.missileDurationT = 0;
    this.pState.missileActive = false;
    this.pState.missileCd = 0;
    this.pState.missilePort = 0;
    // Спавн игрока в центре экрана (не из разлома)
    const canvasWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    const canvasHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
    this.pState.x = 0;
    this.pState.y = 0;
  }
  
  setGuns(n: number): void {
    this.pState.guns = n;
  }
  
  setRateBoost(b: number): void {
    this.pState.rateBoost = b;
  }
  
  setDashT(t: number): void {
    this.pState.dashT = t;
  }
  
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
  
  /** Returns mutable reference to player state for clamping/constraints */
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

  // Методы для вызова из game.ts
  
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
    this.pState.rateT = 10; // 10 seconds boost
  }

  /** Добавить дополнительное орудие на время (например, из бонуса) */
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

  getRenderState(): import('../systems/RendererSystem').PlayerRenderState {
    return {
      x: this.pState.x,
      y: this.pState.y,
      angle: this.pState.angle,
      aimA: this.aimAngle,
      hp: this.pState.hp,
      maxHp: this.pState.maxHp,
      invuln: this.pState.invuln,
      guns: this.pState.guns,
      rateT: this.pState.rateT,
      rateBoost: this.pState.rateBoost,
      dashT: this.pState.dashT,
      thrusting: this.pState.thrusting,
      pvx: this.pState.vx,
      pvy: this.pState.vy,
    };
  }

  setTouch(active: boolean, x: number, y: number): void {
    this.input.setTouch(active, x, y);
  }
  
  update(dt: number, active: boolean): void {
    if (!active) return;
    
    const mv = this.input.axis;
    let ax = mv.x;
    let ay = mv.y;
    const l = Math.hypot(ax, ay);
    
    this.pState.thrusting = l > 0;
    this.pState.dashT = Math.max(0, this.pState.dashT - dt);
    const dashing = this.pState.dashT > 0;
    
    if (l > 0) {
      const norm = l > 1 ? l : 1;
      ax /= norm;
      ay /= norm;
      this.pState.vx += ax * 1500 * (dashing ? 1.8 : 1) * dt;
      this.pState.vy += ay * 1500 * (dashing ? 1.8 : 1) * dt;
    }
    
    const fr = Math.exp(-2.4 * dt);
    this.pState.vx *= fr;
    this.pState.vy *= fr;
    
    const sp = Math.hypot(this.pState.vx, this.pState.vy);
    const cap = PLAYER_MAX_SPEED * (dashing ? 2.2 : 1);
    if (sp > cap) {
      this.pState.vx *= cap / sp;
      this.pState.vy *= cap / sp;
    }
    
    this.pState.x += this.pState.vx * dt;
    this.pState.y += this.pState.vy * dt;
    
    // dash speed-trail
    if (dashing && sp > 60) {
      for (let i = 0; i < 2; i++) {
        this.fx.emit({
          x: this.pState.x - (this.pState.vx / sp) * 10 + rand(-5, 5),
          y: this.pState.y - (this.pState.vy / sp) * 10 + rand(-5, 5),
          vx: -(this.pState.vx / sp) * rand(40, 130),
          vy: -(this.pState.vy / sp) * rand(40, 130),
          life: rand(0.2, 0.4),
          maxLife: 0.4,
          c: [1, 1, 1, 0.8] as RGBA,
          size: rand(1, 2.2),
        });
      }
    }
    
    // Тело корабля всегда поворачивается в сторону движения (вектор скорости)
    const oldAngle = this.pState.angle;
    if (sp > 20) {
      // Всегда следовать за направлением скорости
      this.pState.angle = lerpAngleMath(this.pState.angle, Math.atan2(this.pState.vy, this.pState.vx), 1 - Math.exp(-10 * dt));
    }
    let angleDelta = this.pState.angle - oldAngle;
    while (angleDelta > Math.PI) angleDelta -= TAU;
    while (angleDelta < -Math.PI) angleDelta += TAU;
    
    this.pState.invuln = Math.max(0, this.pState.invuln - dt);
    
    // Decrease rate boost timer
    if (this.pState.rateT > 0) {
      this.pState.rateT -= dt;
      if (this.pState.rateT <= 0) {
        this.pState.rateBoost = 0;
      }
    }

    // Decrease extra guns timer
    if (this.pState.extraGunsT > 0) {
      this.pState.extraGunsT -= dt;
      if (this.pState.extraGunsT <= 0) {
        this.pState.extraGuns = 0;
      }
    }
    
    this.fireCd = Math.max(0, this.fireCd - dt);
    if (this.fireCd < 0) this.fireCd = 0;
    
    // Авто-стрельба по ближайшему врагу в зоне поражения
    if (this.autoFireEnabled && this.aimAngle !== null) {
      this.checkAndFireAuto(dt);
    }
    
    // Handle shooting (manual fire with LMB)
    if (this.isFiring && this.fireCd <= 0 && this.aimAngle !== null) {
      // Fire rate: interval between shots.
      // Base: 0.455s (~2.2 shots/sec), with rate boost up to ~2.75 shots/sec.
      const fireRate = PLAYER_FIRE_CD / this.getRateMult();
      this.fireCd = fireRate;
      this.lastFireTime = fireRate;
      this.fireAll(this.aimAngle);
    }
  }
  
  /** Проверяет наличие врагов в зоне поражения и стреляет автоматически */
  private checkAndFireAuto(dt: number): void {
    // Получаем список врагов из GameState или через eventBus
    // Для простоты, авто-стрельба работает когда есть прицел
    // Реализация будет в game.ts через подписку на события
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
  
  private fireBullet(offset: number, spread: number, targetAngle: number): void {
    const a = targetAngle + spread;
    const nx = this.pState.x + Math.cos(targetAngle) * 14 - Math.sin(targetAngle) * offset;
    const ny = this.pState.y + Math.sin(targetAngle) * 14 + Math.cos(targetAngle) * offset;
    const sp = 560;
    this.bulletList.push({
      x: nx,
      y: ny,
      vx: Math.cos(a) * sp + this.pState.vx * 0.25,
      vy: Math.sin(a) * sp + this.pState.vy * 0.25,
      life: 1.5,
      dmg: 10,
    });
  }
  
  /* ======================== Missile Launcher ======================== */

  /** Активировать ракетную установку на duration секунд */
  activateMissileLauncher(duration: number): void {
    this.pState.missileActive = true;
    this.pState.missileCd = 0; // готов выстрелить сразу
    this.pState.missilePort = 0;
    this.missileDurationT = duration;
  }

  /** Обновить ракетную установку и запустить ракету если готова */
  launchMissiles(dt: number, enemies: Array<{ x: number; y: number; dead: boolean; r: number }>): void {
    if (!this.pState.missileActive) return;

    // Уменьшаем таймер активации
    this.missileDurationT -= dt;
    if (this.missileDurationT <= 0) {
      this.pState.missileActive = false;
      this.missileDurationT = 0;
      return;
    }

    this.pState.missileCd = Math.max(0, this.pState.missileCd - dt);

    if (this.pState.missileCd > 0) return;

    // Находим ближайшего живого врага
    const px = this.pState.x;
    const py = this.pState.y;
    let nearest: { x: number; y: number; r: number } | null = null;
    let nearDist = Infinity;

    for (const e of enemies) {
      if (e.dead) continue;
      const d = Math.hypot(e.x - px, e.y - py);
      if (d < nearDist) {
        nearDist = d;
        nearest = e;
      }
    }

    if (!nearest) return;

    // Запускаем ракету
    this.fireMissile(nearest);

    // Переключаем порт и ставим cooldown
    this.pState.missilePort = 1 - this.pState.missilePort;
    this.pState.missileCd = MISSILE_LAUNCH_INTERVAL;
  }

  /** Создать самонаводящуюся ракету */
  fireMissile(target: { x: number; y: number; r: number }): void {
    const px = this.pState.x;
    const py = this.pState.y;
    const port = this.pState.missilePort;

    // Смещение порта: перпендикулярно направлению движения
    const sp = Math.hypot(this.pState.vx, this.pState.vy) || 1;
    const vnx = this.pState.vx / sp;
    const vny = this.pState.vy / sp;

    // Порт 0 = левый борт (-), Порт 1 = правый борт (+)
    const portSide = port === 0 ? -1 : 1;
    const offX = -vny * portSide * 12;
    const offY = vnx * portSide * 12;

    const mx = px + offX;
    const my = py + offY;

    // Начальный вектор в сторону цели
    const dx = target.x - mx;
    const dy = target.y - my;
    const dist = Math.hypot(dx, dy) || 1;

    const baseVx = (dx / dist) * MISSILE_SPEED;
    const baseVy = (dy / dist) * MISSILE_SPEED;

    // Добавляем импульс от движения игрока (как у пуль)
    const playerVx = this.pState.vx * 0.25;
    const playerVy = this.pState.vy * 0.25;

    this.bulletList.push({
      x: mx,
      y: my,
      vx: baseVx + playerVx,
      vy: baseVy + playerVy,
      life: MISSILE_LIFE,
      dmg: MISSILE_DMG,
      // Homing data
      homingTarget: { x: target.x, y: target.y, r: target.r },
      homingTurnRate: MISSILE_TURN_RATE,
    });
  }

}
