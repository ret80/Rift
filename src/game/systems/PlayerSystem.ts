/**
 * PlayerSystem - управление игроком.
 * Отвечает за движение, стрельбу, здоровье и состояние игрока.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import { TAU } from '../math';
import { C } from '../balance';
import type { InputManager } from '../input';
import type { Fx } from '../fx';
import type { AudioEngine } from '../audio';

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
}

export class PlayerSystem {
  private eventBus: EventBus;
  private state: GameState;
  private input: InputManager;
  private fx: Fx;
  private audio: AudioEngine;
  
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
  };
  
  private fireCd = 0;
  private zoneX = 0;
  private zoneY = 0;
  private zoneR = 0;
  private zoneOn = false;
  private zoneAlpha = 0;
  
  // Для внешних систем
  public bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }> = [];
  
  constructor(eventBus: EventBus, state: GameState, input: InputManager, fx: Fx, audio: AudioEngine) {
    this.eventBus = eventBus;
    this.state = state;
    this.input = input;
    this.fx = fx;
    this.audio = audio;
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
    };
    this.fireCd = 0;
    this.bullets = [];
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
    return { ...this.player };
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
  
  update(dt: number, wave: number, asteroids: Array<{ x: number; y: number; vx: number; vy: number }>, enemies: Array<{ x: number; y: number; dead: boolean }>): void {
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
    const cap = 420 * (dashing ? 2.2 : 1);
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
          c: rgba(C.dash, 0.8),
          size: rand(1, 2.2),
        });
      }
    }
    
    if (sp > 20) {
      this.player.angle = lerpAngle(this.player.angle, Math.atan2(this.player.vy, this.player.vx), 1 - Math.exp(-8 * dt));
    }
    
    this.player.invuln = Math.max(0, this.player.invuln - dt);
    
    // turret: aim & fire at the nearest target (enemies preferred over rocks).
    const zoneLive = this.zoneOn && this.zoneAlpha > 0.4 && this.zoneR > 60;
    const inZone = (x: number, y: number) => !zoneLive || Math.hypot(x - this.zoneX, y - this.zoneY) <= this.zoneR;
    
    const rate = Math.min(8.5, 4.4 + wave * 0.12) * (1 + this.player.rateBoost);
    let bestX = 0;
    let bestY = 0;
    let bestVX = 0;
    let bestVY = 0;
    let bestD = 1e9;
    
    for (const e of enemies) {
      if (e.dead || !inZone(e.x, e.y)) continue;
      const d = Math.hypot(e.x - this.player.x, e.y - this.player.y) * 0.85;
      if (d < bestD) {
        bestD = d;
        bestX = e.x;
        bestY = e.y;
        bestVX = 0;
        bestVY = 0;
      }
    }
    
    for (const a of asteroids) {
      if (!inZone(a.x, a.y)) continue;
      const d = Math.hypot(a.x - this.player.x, a.y - this.player.y);
      if (d < bestD) {
        bestD = d;
        bestX = a.x;
        bestY = a.y;
        bestVX = a.vx;
        bestVY = a.vy;
      }
    }
    
    if (bestD < 620) {
      const leadT = (bestD / 560) * 0.6;
      const tx = bestX + bestVX * leadT - this.player.x;
      const ty = bestY + bestVY * leadT - this.player.y;
      this.player.aimA = Math.atan2(ty, tx);
      
      this.fireCd -= dt;
      while (this.fireCd <= 0) {
        this.fireCd += 1 / rate;
        this.fireAll(this.player.aimA);
      }
    } else {
      this.player.aimA = null;
      if (this.fireCd < 0) this.fireCd = 0;
    }
  }
  
  private fireAll(angle: number): void {
    const GUN_OFFS = [0];
    for (let i = 0; i < this.player.guns; i++) {
      this.fireBullet(GUN_OFFS[i] || 0, (Math.random() - 0.5) * 0.06, angle);
    }
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

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a) % TAU + TAU * 2) % TAU - TAU;
  return a + d * t;
}

function rgba(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}
