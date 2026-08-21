/**
 * PlayerSystem - управление игроком.
 * Отвечает за движение, стрельбу, здоровье и состояние игрока.
 */

import type { AudioEngine } from '../audio';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import type { InputManager } from '../input';
import { TAU, lerpAngle as lerpAngleMath } from '../math';
import type { RGBA } from '../render';
import { massForRadius, PLAYER_FIRE_CD, PLAYER_MAX_SPEED, PLAYER_RADIUS } from '../balance';

// Флаг для отладки вращения кораблей
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;

function logRotation(tag: string, msg: string): void {
  if (!DEBUG_ROTATION) return;
  if (rotationLogCounter.player >= MAX_ROTATION_LOGS) return;
  console.log(`[ROTATION-P] ${tag}: ${msg}`);
}

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
}

export class PlayerSystem {
  private eventBus: EventBus;
  private state: GameState;
  private input: InputManager;
  private fx: Fx;
  private audio: AudioEngine;
  private getZoneBounds: () => { x: number; y: number; radius: number; active: boolean };
  private spawnPickup: (kind: string, x: number, y: number, vx: number, vy: number) => void;
  private fireAllCallback: (angle: number) => void;
  
  private player: PlayerState = {
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
  };
  
  private fireCd = 0;
  private zoneX = 0;
  private zoneY = 0;
  private zoneR = 0;
  private zoneOn = false;
  private zoneAlpha = 0;
  private aimAngle: number | null = null;
  private isFiring = false;
  private lastFireTime = 0;
  private autoFireEnabled = true;
  
  // Для внешних систем
  public bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }> = [];
  
  constructor(
    eventBus: EventBus,
    state: GameState,
    input: InputManager,
    fx: Fx,
    audio: AudioEngine,
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
  }
  
  reset(): void {
    this.player = {
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
    };
    this.fireCd = 0;
    this.bullets = [];
    // Спавн игрока в центре экрана (не из разлома)
    const canvasWidth = typeof window !== 'undefined' ? window.innerWidth : 800;
    const canvasHeight = typeof window !== 'undefined' ? window.innerHeight : 600;
    this.player.x = 0;
    this.player.y = 0;
  }
  
  setZone(x: number, y: number, r: number, on: boolean, alpha: number): void {
    this.zoneX = x;
    this.zoneY = y;
    this.zoneR = r;
    this.zoneOn = on;
    this.zoneAlpha = alpha;
  }
  
  setGuns(n: number): void {
    this.player.guns = n;
  }
  
  setRateBoost(b: number): void {
    this.player.rateBoost = b;
  }
  
  setDashT(t: number): void {
    this.player.dashT = t;
  }
  
  addHp(delta: number): void {
    this.player.hp = Math.max(0, Math.min(this.player.maxHp, this.player.hp + delta));
  }
  
  setMaxHp(max: number): void {
    this.player.maxHp = max;
    this.player.hp = Math.min(this.player.hp, max);
  }
  
  setInvuln(t: number): void {
    this.player.invuln = t;
  }
  
  getState(): PlayerState {
    return { 
      ...this.player,
      aimA: this.aimAngle,
    };
  }
  
  getPosition(): { x: number; y: number } {
    return { x: this.player.x, y: this.player.y };
  }
  
  getVelocity(): { vx: number; vy: number } {
    return { vx: this.player.vx, vy: this.player.vy };
  }
  
  getHp(): number {
    return this.player.hp;
  }
  
  getMaxHp(): number {
    return this.player.maxHp;
  }
  
  getGuns(): number {
    return this.player.guns;
  }
  
  getRateBoost(): number {
    return this.player.rateBoost;
  }
  
  getDashT(): number {
    return this.player.dashT;
  }
  
  getInvuln(): number {
    return this.player.invuln;
  }
  
  isThrusting(): boolean {
    return this.player.thrusting;
  }
  
  getAngle(): number {
    return this.player.angle;
  }
  
  getAimA(): number | null {
    return this.player.aimA;
  }

  // Методы для вызова из game.ts
  
  hit(dmg: number): void {
    if (this.player.invuln > 0) return;
    this.player.hp -= dmg;
    if (this.player.hp <= 0) {
      this.player.hp = 0;
      this.eventBus.publish('game_over', {});
    }
  }

  heal(amount: number): void {
    this.player.hp = Math.min(this.player.maxHp, this.player.hp + amount);
    this.eventBus.publish('player_healed', { hp: this.player.hp });
  }

  addGun(): void {
    this.player.guns++;
  }

  boostRate(): void {
    this.player.rateBoost = Math.min(1.0, this.player.rateBoost + 0.2);
    this.player.rateT = 10; // 10 seconds boost
  }

  getRateMult(): number {
    return 1 + this.player.rateBoost;
  }

  getRateT(): number {
    return this.player.rateT;
  }

  getRenderState(): import('../systems/RendererSystem').PlayerRenderState {
    return {
      x: this.player.x,
      y: this.player.y,
      angle: this.player.angle,
      aimA: this.aimAngle,
      hp: this.player.hp,
      maxHp: this.player.maxHp,
      invuln: this.player.invuln,
      guns: this.player.guns,
      rateT: this.player.rateT,
      rateBoost: this.player.rateBoost,
      dashT: this.player.dashT,
      thrusting: this.player.thrusting,
      pvx: this.player.vx,
      pvy: this.player.vy,
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
    
    this.player.thrusting = l > 0;
    this.player.dashT = Math.max(0, this.player.dashT - dt);
    const dashing = this.player.dashT > 0;
    
    if (l > 0) {
      const norm = l > 1 ? l : 1;
      ax /= norm;
      ay /= norm;
      this.player.vx += ax * 1500 * (dashing ? 1.8 : 1) * dt;
      this.player.vy += ay * 1500 * (dashing ? 1.8 : 1) * dt;
    }
    
    const fr = Math.exp(-2.4 * dt);
    this.player.vx *= fr;
    this.player.vy *= fr;
    
    const sp = Math.hypot(this.player.vx, this.player.vy);
    const cap = PLAYER_MAX_SPEED * (dashing ? 2.2 : 1);
    if (sp > cap) {
      this.player.vx *= cap / sp;
      this.player.vy *= cap / sp;
    }
    
    this.player.x += this.player.vx * dt;
    this.player.y += this.player.vy * dt;
    
    // dash speed-trail
    if (dashing && sp > 60) {
      for (let i = 0; i < 2; i++) {
        this.fx.emit({
          x: this.player.x - (this.player.vx / sp) * 10 + rand(-5, 5),
          y: this.player.y - (this.player.vy / sp) * 10 + rand(-5, 5),
          vx: -(this.player.vx / sp) * rand(40, 130),
          vy: -(this.player.vy / sp) * rand(40, 130),
          life: rand(0.2, 0.4),
          maxLife: 0.4,
          c: [1, 1, 1, 0.8] as RGBA,
          size: rand(1, 2.2),
        });
      }
    }
    
    // Тело корабля всегда поворачивается в сторону движения (вектор скорости)
    const oldAngle = this.player.angle;
    if (sp > 20) {
      // Всегда следовать за направлением скорости
      this.player.angle = lerpAngleMath(this.player.angle, Math.atan2(this.player.vy, this.player.vx), 1 - Math.exp(-10 * dt));
    }
    let angleDelta = this.player.angle - oldAngle;
    while (angleDelta > Math.PI) angleDelta -= TAU;
    while (angleDelta < -Math.PI) angleDelta += TAU;
    if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
      rotationLogCounter.player++;
      logRotation('turn', `angle ${oldAngle.toFixed(3)}→${this.player.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${this.player.vx.toFixed(1)},${this.player.vy.toFixed(1)})`);
    }
    
    this.player.invuln = Math.max(0, this.player.invuln - dt);
    
    // Decrease rate boost timer
    if (this.player.rateT > 0) {
      this.player.rateT -= dt;
      if (this.player.rateT <= 0) {
        this.player.rateBoost = 0;
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
    const nx = this.player.x + Math.cos(targetAngle) * 14 - Math.sin(targetAngle) * offset;
    const ny = this.player.y + Math.sin(targetAngle) * 14 + Math.cos(targetAngle) * offset;
    const sp = 560;
    this.bullets.push({
      x: nx,
      y: ny,
      vx: Math.cos(a) * sp + this.player.vx * 0.25,
      vy: Math.sin(a) * sp + this.player.vy * 0.25,
      life: 1.5,
      dmg: 10,
    });
  }
  
  /** Жёсткий барьер зоны для игрока — отталкивает обратно при выходе за границу. */
  clampPlayerToZone(zoneX: number, zoneY: number, zoneR: number, zoneOn: boolean, overdrive: number): void {
    if (!zoneOn || zoneR <= 0) return;
    const dx = this.player.x - zoneX;
    const dy = this.player.y - zoneY;
    const dist = Math.hypot(dx, dy);
    const limit = zoneR - overdrive;
    if (dist > limit) {
      const angle = Math.atan2(dy, dx);
      this.player.x = zoneX + Math.cos(angle) * limit;
      this.player.y = zoneY + Math.sin(angle) * limit;
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const dot = this.player.vx * nx + this.player.vy * ny;
      if (dot > 0) {
        const oldVx = this.player.vx;
        const oldVy = this.player.vy;
        this.player.vx -= 2 * dot * nx;
        this.player.vy -= 2 * dot * ny;
        rotationLogCounter.player++;
        logRotation('clamped', `player vx ${oldVx.toFixed(1)}→${this.player.vx.toFixed(1)}, vy ${oldVy.toFixed(1)}→${this.player.vy.toFixed(1)}`);
      }
    }
  }

  clampToZone(obj: { x: number; y: number; vx: number; vy: number }, overdrive: number): void {
    if (!this.zoneOn) return;
    
    const dx = obj.x - this.zoneX;
    const dy = obj.y - this.zoneY;
    const dist = Math.hypot(dx, dy);
    const limit = this.zoneR - overdrive;
    
    if (dist > limit) {
      const angle = Math.atan2(dy, dx);
      obj.x = this.zoneX + Math.cos(angle) * limit;
      obj.y = this.zoneY + Math.sin(angle) * limit;
      
      const nx = Math.cos(angle);
      const ny = Math.sin(angle);
      const dot = obj.vx * nx + obj.vy * ny;
      if (dot > 0) {
        obj.vx -= 2 * dot * nx;
        obj.vy -= 2 * dot * ny;
      }
    }
  }
}

// Helper functions (should be imported from math.ts)
function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
