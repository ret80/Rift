/**
 * EnemySystem - управление врагами.
 * Отвечает за AI, движение, стрельбу и состояние врагов.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { EnemyKind } from '../balance';
import { TAU } from '../math';
import type { Fx } from '../fx';
import type { AudioEngine } from '../audio';

interface Enemy {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  dead: boolean;
  parent: Enemy | null;
}

interface EnemyDef {
  hp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  bolt: number;
}

export class EnemySystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioEngine;
  private enemyFireCallback: (e: Enemy) => void;
  private getZoneBounds: () => { x: number; y: number; radius: number; active: boolean };
  
  private enemies: Enemy[] = [];
  private wave = 1;
  
  // Для отрисовки
  public flock: Enemy[] = [];
  
  constructor(
    eventBus: EventBus,
    state: GameState,
    fx: Fx,
    audio: AudioEngine,
    enemyFireCallback: (e: Enemy) => void,
    getZoneBounds: () => { x: number; y: number; radius: number; active: boolean }
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
    this.enemyFireCallback = enemyFireCallback;
    this.getZoneBounds = getZoneBounds;
  }
  
  reset(): void {
    this.enemies = [];
    this.flock = [];
  }
  
  setWave(wave: number): void {
    this.wave = wave;
  }
  
  getEnemies(): Enemy[] {
    return this.enemies;
  }
  
  getLiveCount(): number {
    return this.enemies.filter(e => !e.dead).length;
  }
  
  addEnemy(kind: EnemyKind, x: number, y: number, def: EnemyDef): void {
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === "drone"
      ? Math.atan2(this.state.player.y - y, this.state.player.x - x)
      : rand(0, TAU);
    this.enemies.push({
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      hp: def.hp,
      maxHp: def.hp,
      r: def.r,
      speed: def.speed,
      contact: def.contact,
      score: def.score,
      boltDmg: def.bolt,
      fireCd: rand(0.3, 1),
      mode: 0,
      modeT: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 100,
      spawnCd: rand(1, 2),
      flash: 0,
      hitCd: 0,
      dead: false,
      parent: null,
    });
  }
  
  update(dt: number, enemyList: Enemy[], playerPos: { x: number; y: number }): void {
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = 0;
    const playerVy = 0;
    const zone = this.getZoneBounds();
    const zoneTarget = zone.radius;
    // gather live drones for the boids flock
    this.flock.length = 0;
    for (const e of this.enemies) {
      if (e.kind === "drone" && !e.dead) this.flock.push(e);
    }
    
    for (const e of this.enemies) {
      if (e.dead) continue;
      
      e.flash = Math.max(0, e.flash - dt * 5);
      e.hitCd = Math.max(0, e.hitCd - dt);
      
      const dx = playerX - e.x;
      const dy = playerY - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      const dirX = dx / dist;
      const dirY = dy / dist;
      
      switch (e.kind) {
        case "drone": {
          /* Boids swarm: separation + alignment + cohesion, still seeking the player. */
          const SEP_R = 36;
          const SEP_R2 = SEP_R * SEP_R;
          const ALI_R2 = 85 * 85;
          const SEP_W = 320;
          const ALIGN = 0.35;
          const COH = 0.7;
          
          let sepX = 0, sepY = 0, aliX = 0, aliY = 0, aliN = 0, cohX = 0, cohY = 0, cohN = 0;
          
          for (const o of this.flock) {
            if (o === e || o.dead) continue;
            const ddx = e.x - o.x;
            const ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            
            if (d2 < ALI_R2 && d2 > 0.0001) {
              aliX += o.vx;
              aliY += o.vy;
              aliN++;
              cohX += o.x;
              cohY += o.y;
              cohN++;
              
              if (d2 < SEP_R2) {
                const d = Math.sqrt(d2);
                const w = 1 - d / SEP_R;
                sepX += (ddx / d) * w;
                sepY += (ddy / d) * w;
              }
            }
          }
          
          let desX = dirX * e.speed;
          let desY = dirY * e.speed;
          desX += sepX * SEP_W;
          desY += sepY * SEP_W;
          
          if (aliN > 0) {
            desX += (aliX / aliN - desX) * ALIGN;
            desY += (aliY / aliN - desY) * ALIGN;
          }
          
          if (cohN > 0) {
            desX += (cohX / cohN - e.x) * COH;
            desY += (cohY / cohN - e.y) * COH;
          }
          
          const k = 1 - Math.exp(-3.2 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          
          const dsp2 = e.vx * e.vx + e.vy * e.vy;
          const dspMax = e.speed * 1.5;
          if (dsp2 > dspMax * dspMax) {
            const s = dspMax / Math.sqrt(dsp2);
            e.vx *= s;
            e.vy *= s;
          }
          
          const dsp = Math.sqrt(dsp2);
          if (dsp > 5) {
            // Плавные повороты: lerp factor снижен с 9 до 5
            e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-5 * dt));
          }
          break;
        }
        
        case "hunter": {
          const leadX = playerX + playerVx * 1.0;
          const leadY = playerY + playerVy * 1.0;
          const hx = leadX - e.x;
          const hy = leadY - e.y;
          const hd = Math.hypot(hx, hy) || 1;
          const k = 1 - Math.exp(-(hd < 120 ? 7.5 : 4.5) * dt);
          e.vx += ((hx / hd) * e.speed - e.vx) * k;
          e.vy += ((hy / hd) * e.speed - e.vy) * k;
          const hv = Math.hypot(e.vx, e.vy);
          if (hv > 5) {
            // Плавные повороты: lerp factor снижен с 10 до 6
            e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-6 * dt));
          }
          break;
        }
        
        case "fighter": {
          e.modeT -= dt;
          if (e.mode === 0) {
            e.vx += (dirX * e.speed - e.vx) * (1 - Math.exp(-4 * dt));
            e.vy += (dirY * e.speed - e.vy) * (1 - Math.exp(-4 * dt));
            if (dist < 300) {
              e.mode = 1;
              e.modeT = rand(1.3, 2);
              e.strafeDir = Math.random() < 0.5 ? -1 : 1;
            }
          } else if (e.mode === 1) {
            const tx = -dirY * e.strafeDir;
            const ty = dirX * e.strafeDir;
            const radial = (dist - 265) * 2.2;
            e.vx += (tx * e.speed * 0.95 + dirX * radial - e.vx) * (1 - Math.exp(-5 * dt));
            e.vy += (ty * e.speed * 0.95 + dirY * radial - e.vy) * (1 - Math.exp(-5 * dt));
            if (e.modeT <= 0) {
              e.mode = 2;
              e.modeT = rand(0.9, 1.4);
            }
          } else {
            const tx = -dirX * 0.7 - dirY * e.strafeDir * 0.7;
            const ty = -dirY * 0.7 + dirX * e.strafeDir * 0.7;
            e.vx += (tx * e.speed - e.vx) * (1 - Math.exp(-4.5 * dt));
            e.vy += (ty * e.speed - e.vy) * (1 - Math.exp(-4.5 * dt));
            if (e.modeT <= 0) e.mode = 0;
          }
          const kAngle = 1 - Math.exp(-6 * dt);
          e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), kAngle);
          break;
        }
        
        case "cruiser": {
          let escort: Enemy | null = null;
          let ed = 1e9;
          for (const o of this.enemies) {
            if (o.kind !== "carrier" || o.dead) continue;
            const dd = Math.hypot(e.x - o.x, e.y - o.y);
            if (dd < ed) {
              ed = dd;
              escort = o;
            }
          }
          
          let desX: number;
          let desY: number;
          
          if (escort && ed < 290) {
            const ox = e.x - escort.x;
            const oy = e.y - escort.y;
            const od = Math.hypot(ox, oy) || 1;
            const radial = (od - 150) * 1.2;
            desX = (ox / od) * radial + (-oy / od) * e.strafeDir * e.speed;
            desY = (oy / od) * radial + (ox / od) * e.strafeDir * e.speed;
          } else {
            const zr = zoneTarget > 0 ? zoneTarget : 420;
            const HOLD = Math.min(400, zr * 0.8);
            const radial = (dist - HOLD) * 1.0;
            desX = dirX * radial + -dirY * e.strafeDir * e.speed * 0.6;
            desY = dirY * radial + dirX * e.strafeDir * e.speed * 0.6;
          }
          
          for (const o of this.enemies) {
            if (o === e || o.dead) continue;
            const ddx = e.x - o.x;
            const ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            const minSep = (e.r + o.r) * 1.1;
            if (d2 < minSep * minSep && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = (minSep - d) / d * 180;
              desX += (ddx / d) * push;
              desY += (ddy / d) * push;
            }
          }
          
          const k = 1 - Math.exp(-2.8 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const sp = Math.hypot(e.vx, e.vy);
          if (sp > 5) {
            // Плавные повороты: lerp factor снижен с 6 до 4
            e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-4 * dt));
          }
          break;
        }
        
        case "carrier": {
          const HOLD = 480;
          const radial = (dist - HOLD) * 0.7;
          let desX = dirX * radial + -dirY * e.strafeDir * e.speed * 0.4;
          let desY = dirY * radial + dirX * e.strafeDir * e.speed * 0.4;
          
          for (const o of this.enemies) {
            if (o === e || o.dead) continue;
            const ddx = e.x - o.x;
            const ddy = e.y - o.y;
            const d2 = ddx * ddx + ddy * ddy;
            const minSep = (e.r + o.r) * 1.05;
            if (d2 < minSep * minSep && d2 > 0.0001) {
              const d = Math.sqrt(d2);
              const push = (minSep - d) / d * 120;
              desX += (ddx / d) * push;
              desY += (ddy / d) * push;
            }
          }
          
          const k = 1 - Math.exp(-2.2 * dt);
          e.vx += (desX - e.vx) * k;
          e.vy += (desY - e.vy) * k;
          const sp = Math.hypot(e.vx, e.vy);
          if (sp > 5) {
            e.angle = lerpAngle(e.angle, Math.atan2(e.vy, e.vx), 1 - Math.exp(-5 * dt));
          }
          
          // spawn drones
          e.spawnCd -= dt;
          if (e.spawnCd <= 0 && this.getLiveCount() < 30) {
            e.spawnCd = rand(3, 5);
            this.eventBus.emit('carrierSpawnDrone', { x: e.x, y: e.y, parent: e });
          }
          break;
        }
      }
      
      // apply velocity
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      
      // shooting logic
      if (e.kind === "fighter" || e.kind === "cruiser" || e.kind === "carrier") {
        e.fireCd -= dt;
        const canShoot = (e.kind === "fighter" && dist < 420) ||
                        (e.kind === "cruiser" && dist < 380) ||
                        (e.kind === "carrier" && dist < 500);
        
        if (e.fireCd <= 0 && canShoot) {
          const heavy = e.kind === "cruiser" || e.kind === "carrier";
          const spread = e.kind === "fighter" ? 0.15 : e.kind === "cruiser" ? 0.1 : 0.18;
          const life = e.kind === "fighter" ? 1.35 : 1.8;
          const speed = e.kind === "fighter" ? 300 : e.kind === "cruiser" ? 260 : 240;
          const rate = e.kind === "fighter" ? 2 : e.kind === "cruiser" ? 3 : 4;
          e.fireCd = rate / (4.4 + this.wave * 0.12);
          
           // Вызываем callback для создания вражеской пули
          this.enemyFireCallback({
            x: e.x,
            y: e.y,
            kind: e.kind,
            angle: e.angle + (Math.random() - 0.5) * 2 * spread,
            r: e.r,
            boltDmg: e.boltDmg,
          });
          
          if (heavy) this.audio.heavyShoot();
          else this.audio.enemyShoot();
        }
      }
    }
  }
  
  damageEnemy(index: number, dmg: number): boolean {
    if (index < 0 || index >= this.enemies.length) return false;
    
    const e = this.enemies[index];
    if (e.dead) return false;
    
    e.hp -= dmg;
    e.hitCd = 0.15;
    
    if (e.hp <= 0) {
      e.dead = true;
      return true; // enemy killed
    }
    
    return false;
  }
  
  removeDead(): void {
    this.enemies = this.enemies.filter(e => !e.dead);
  }

  spawn(kind: EnemyKind, x: number, y: number, parent: Enemy | null, enemyList: Enemy[]): void {
    const def = this.getEnemyDef(kind);
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === "drone"
      ? Math.atan2(this.state.player.y - y, this.state.player.x - x)
      : rand(0, TAU);
    const e: Enemy = {
      kind,
      x,
      y,
      vx: 0,
      vy: 0,
      angle,
      hp: def.hp,
      maxHp: def.hp,
      r: def.r,
      speed: def.speed,
      contact: def.contact,
      score: def.score,
      boltDmg: def.bolt,
      fireCd: rand(0.3, 1),
      mode: 0,
      modeT: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 100,
      spawnCd: rand(1, 2),
      flash: 0,
      hitCd: 0,
      dead: false,
      parent,
    };
    // Добавляем И во внутренний массив И во внешний (enemyList)
    // чтобы рендерер и коллизии видели врага
    this.enemies.push(e);
    enemyList.push(e);
    if (parent) {
      parent.spawnCd = 0;
    }
  }
  
  /** Ограничивает врагов пределами зоны волны */
  clampEnemiesToZone(zoneX: number, zoneY: number, zoneR: number, zoneOn: boolean): void {
    if (!zoneOn || zoneR <= 0) return;
    
    for (const e of this.enemies) {
      if (e.dead) continue;
      
      const dx = e.x - zoneX;
      const dy = e.y - zoneY;
      const dist = Math.hypot(dx, dy);
      const limit = zoneR - e.r;
      
      if (dist > limit) {
        const angle = Math.atan2(dy, dx);
        e.x = zoneX + Math.cos(angle) * limit;
        e.y = zoneY + Math.sin(angle) * limit;
        
        const nx = Math.cos(angle);
        const ny = Math.sin(angle);
        const dot = e.vx * nx + e.vy * ny;
        if (dot > 0) {
          e.vx -= 2 * dot * nx;
          e.vy -= 2 * dot * ny;
        }
      }
    }
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    switch (kind) {
      case "drone":
        return { hp: 8, r: 14, speed: 60, contact: 12, score: 10, bolt: 8 };
      case "hunter":
        return { hp: 20, r: 14, speed: 150, contact: 16, score: 25, bolt: 12 };
      case "fighter":
        return { hp: 35, r: 18, speed: 110, contact: 20, score: 40, bolt: 15 };
      case "cruiser":
        return { hp: 80, r: 26, speed: 80, contact: 24, score: 80, bolt: 20 };
      case "carrier":
        return { hp: 150, r: 36, speed: 60, contact: 30, score: 150, bolt: 25 };
      default:
        return { hp: 10, r: 12, speed: 80, contact: 14, score: 15, bolt: 10 };
    }
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function lerpAngle(a: number, b: number, t: number): number {
  const d = ((b - a) % TAU + TAU * 2) % TAU - TAU;
  return a + d * t;
}
