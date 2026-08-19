/**
 * EnemySystem - управление врагами.
 * Отвечает за AI, движение, стрельбу и состояние врагов.
 */

import type { AudioEngine } from '../audio';
import type { EnemyKind } from '../balance';
import { massForRadius } from '../balance';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import { TAU, lerpAngle as lerpAngleMath } from '../math';


// Флаг для отладки вращения кораблей
const DEBUG_ROTATION = false;
const rotationLogCounter = { enemy: 0, player: 0 };
const MAX_ROTATION_LOGS = 50;

function logRotation(tag: string, msg: string): void {
  if (!DEBUG_ROTATION) return;
  if (rotationLogCounter.enemy >= MAX_ROTATION_LOGS) return;
  console.log(`[ROTATION] ${tag}: ${msg}`);
}

interface EnemyFireData {
  x: number;
  y: number;
  kind: EnemyKind;
  angle: number;
  r: number;
  boltDmg: number;
  heavy: boolean;
  cruiser: boolean;
}

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
  mass: number;
  // Cruiser dual turrets (independent cooldowns)
  tCd1?: number;
  tCd2?: number;
  // Carrier burst spawning
  burstSpawned: number; // drones spawned in current burst
  burstActive: boolean; // is burst phase active
  burstRestT: number; // countdown before next burst
  burstCd: number; // cooldown between individual spawns
}

interface EnemyDef {
  hp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  bolt: number;
  mass: number;
}

export class EnemySystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioEngine;
  private enemyFireCallback: (e: EnemyFireData) => void;
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
    enemyFireCallback: (e: EnemyFireData) => void,
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
    logRotation('spawn', `${kind} at (${x.toFixed(0)},${y.toFixed(0)}) angle=${angle.toFixed(3)}`);
    const mass = massForRadius(def.r);
    // Cruiser gets dual turrets with staggered cooldowns
    const tStagger = rand(-0.5, 0.5);
    // Carrier gets burst spawning logic
    const carrierBurstActive = Math.random() < 0.5; // stagger initial state
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;
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
      mass,
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned,
      burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: 0.5,
    });
  }
  
  update(dt: number, enemyList: Enemy[], playerPos: { x: number; y: number }): void {
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = 0;
    const playerVy = 0;
    const zone = this.getZoneBounds();
    const zoneTarget = zone.radius;
    
    for (let i = 0; i < this.enemies.length; i++) {
      const e = this.enemies[i];
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
          // Simple seek player — RVO will handle avoidance
          const k = 1 - Math.exp(-3.2 * dt);
          const prefVx = dirX * e.speed;
          const prefVy = dirY * e.speed;
          e.vx += (prefVx - e.vx) * k;
           e.vy += (prefVy - e.vy) * k;
           
           // Rotation: face movement direction
          const dsp = Math.hypot(e.vx, e.vy);
          if (dsp > 5) {
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-5 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] drone: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)}), spd=${dsp.toFixed(1)}`);
            }
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
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-6 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] hunter: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
            }
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
          const oldAngleF = e.angle;
          e.angle = lerpAngleMath(e.angle, Math.atan2(e.vy, e.vx), kAngle);
          let angleDeltaF = e.angle - oldAngleF;
          while (angleDeltaF > Math.PI) angleDeltaF -= TAU;
          while (angleDeltaF < -Math.PI) angleDeltaF += TAU;
          if (DEBUG_ROTATION && Math.abs(angleDeltaF) > 0.3) {
            rotationLogCounter.enemy++;
            console.log(`[ROTATION] fighter(mode=${e.mode}): angle ${oldAngleF.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDeltaF.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)}), modeT=${e.modeT.toFixed(2)}`);
          }
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
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-4 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] cruiser: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
            }
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
            // Исключаем parent-child коллизии: carrier не должен избегать дроны, которые он спавнит
            if (o.parent === e || e.parent === o) continue;
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
            const targetAngle = Math.atan2(e.vy, e.vx);
            const oldAngle = e.angle;
            e.angle = lerpAngleMath(e.angle, targetAngle, 1 - Math.exp(-5 * dt));
            let angleDelta = e.angle - oldAngle;
            while (angleDelta > Math.PI) angleDelta -= TAU;
            while (angleDelta < -Math.PI) angleDelta += TAU;
            if (DEBUG_ROTATION && Math.abs(angleDelta) > 0.3) {
              rotationLogCounter.enemy++;
              console.log(`[ROTATION] carrier: angle ${oldAngle.toFixed(3)}→${e.angle.toFixed(3)} (delta=${angleDelta.toFixed(3)}), vel=(${e.vx.toFixed(1)},${e.vy.toFixed(1)})`);
            }
          }
          
          // spawn drones in bursts: 10 drones → rest → repeat
          if (e.burstActive) {
            // Burst phase: spawn drones
            e.burstCd -= dt;
            if (e.burstCd <= 0 && this.getLiveCount() < 30 && e.burstSpawned < 10) {
              e.burstCd = 0.5;
              e.burstSpawned++;
              // Random offset so drones don't spawn exactly at carrier center
              const angle = Math.random() * TAU;
              const offset = e.r + 25;
              const spawnX = e.x + Math.cos(angle) * offset;
              const spawnY = e.y + Math.sin(angle) * offset;
              this.eventBus.emit('carrierSpawnDrone', { x: spawnX, y: spawnY, parent: e });
            }
            // End of burst?
            if (e.burstSpawned >= 10) {
              e.burstActive = false;
              e.burstRestT = rand(7, 12); // rest period
            }
          } else {
            // Rest phase: countdown
            e.burstRestT -= dt;
            if (e.burstRestT <= 0) {
              e.burstActive = true;
              e.burstSpawned = 0;
            }
          }
          break;
        }
      }
      
      // apply velocity
      e.x += e.vx * dt;
      e.y += e.vy * dt;
      
      // shooting logic
      if (e.kind === "fighter" || e.kind === "cruiser" || e.kind === "carrier") {
        const canShoot = (e.kind === "fighter" && dist < 420) ||
                        (e.kind === "cruiser" && dist < 380) ||
                        (e.kind === "carrier" && dist < 500);
        
        if (canShoot) {
          // Cruiser: dual independent turrets with staggered cooldowns
          if (e.kind === "cruiser") {
            const spread = 0.1;
            const speed = 260;
            const life = 1.8;
            const rate = 2.2 / (4.4 + this.wave * 0.12);
            
            // Turret 1 (port side)
            e.tCd1! -= dt;
            if (e.tCd1! <= 0) {
              e.tCd1! = rate + rand(-0.2, 0.2);
              const perpA = e.angle + Math.PI / 2;
              const tx = e.x - Math.sin(e.angle) * 14;
              const ty = e.y + Math.cos(e.angle) * 14;
              const tAngle = Math.atan2(playerY - ty, playerX - tx) + (Math.random() - 0.5) * 2 * spread;
              
              this.enemyFireCallback({
                x: tx, y: ty,
                kind: e.kind,
                angle: tAngle,
                r: e.r,
                boltDmg: e.boltDmg,
                heavy: true,
                cruiser: true,
              });
              this.audio.heavyShoot();
            }
            
            // Turret 2 (starboard side)
            e.tCd2! -= dt;
            if (e.tCd2! <= 0) {
              e.tCd2! = rate + rand(-0.2, 0.2);
              const perpA = e.angle + Math.PI / 2;
              const tx = e.x + Math.sin(e.angle) * 14;
              const ty = e.y - Math.cos(e.angle) * 14;
              const tAngle = Math.atan2(playerY - ty, playerX - tx) + (Math.random() - 0.5) * 2 * spread;
              
              this.enemyFireCallback({
                x: tx, y: ty,
                kind: e.kind,
                angle: tAngle,
                r: e.r,
                boltDmg: e.boltDmg,
                heavy: true,
                cruiser: true,
              });
              this.audio.heavyShoot();
            }
          } else {
            // Fighter and carrier: single turret (unchanged)
            e.fireCd -= dt;
            const spread = e.kind === "fighter" ? 0.15 : 0.18;
            const life = e.kind === "fighter" ? 1.35 : 1.8;
            const speed = e.kind === "fighter" ? 300 : 240;
            const rate = e.kind === "fighter" ? 2 : 4;
            e.fireCd = rate / (4.4 + this.wave * 0.12);
            
            if (e.fireCd <= 0) {
              const heavy = e.kind === "carrier";
              
              this.enemyFireCallback({
                x: e.x,
                y: e.y,
                kind: e.kind,
                angle: e.angle + (Math.random() - 0.5) * 2 * spread,
                r: e.r,
                boltDmg: e.boltDmg,
                heavy: heavy,
                cruiser: false,
              });
              
              if (heavy) this.audio.heavyShoot();
              else this.audio.enemyShoot();
            }
          }
        }
      }
    }
    
    // Simple collision avoidance between all enemies (replaces RVO)
    this.applyAvoidance(dt);
  }
  
  /** Мягко раздвигает врагов, которые слишком близко друг к другу */
  private applyAvoidance(dt: number): void {
    const minDist = 50; // минимальное расстояние между центрами врагов
    
    for (let i = 0; i < this.enemies.length; i++) {
      const a = this.enemies[i];
      if (a.dead) continue;
      
      for (let j = i + 1; j < this.enemies.length; j++) {
        const b = this.enemies[j];
        if (b.dead) continue;
        
        // Исключаем parent-child коллизии
        if (a.parent === b || b.parent === a) continue;
        
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const minDistSq = minDist * minDist;
        
        if (distSq < minDistSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          // Soft push: proportional to overlap
          const push = (minDist - dist) / minDist * 0.3;
          const pushX = (dx / dist) * push;
          const pushY = (dy / dist) * push;
          
          // Apply opposite pushes (subtract from current velocity)
          a.vx += pushX * dt;
          a.vy += pushY * dt;
          b.vx -= pushX * dt;
          b.vy -= pushY * dt;
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

  spawn(kind: EnemyKind, x: number, y: number, parent: Enemy | null, enemyList: any[]): void {
    const def = this.getEnemyDef(kind);
    const mass = massForRadius(def.r);
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === "drone"
      ? Math.atan2(this.state.player.y - y, this.state.player.x - x)
      : rand(0, TAU);
    logRotation('spawn', `${kind} at (${x.toFixed(0)},${y.toFixed(0)}) angle=${angle.toFixed(3)}`);
    // Cruiser gets dual turrets with staggered cooldowns
    const tStagger = rand(-0.5, 0.5);
    // Carrier gets burst spawning logic
    const carrierBurstActive = Math.random() < 0.5;
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;
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
      mass,
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned,
      burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: rand(0.7, 1.2),
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
          const oldVx = e.vx;
          const oldVy = e.vy;
          e.vx -= 2 * dot * nx;
          e.vy -= 2 * dot * ny;
          logRotation('clamped', `${e.kind} at (${e.x.toFixed(0)},${e.y.toFixed(0)}) vx ${oldVx.toFixed(1)}→${e.vx.toFixed(1)}, vy ${oldVy.toFixed(1)}→${e.vy.toFixed(1)}`);
        }
      }
    }
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    switch (kind) {
      case "drone":
        return { hp: 8, r: 14, speed: 60, contact: 12, score: 10, bolt: 8, mass: massForRadius(14) };
      case "hunter":
        return { hp: 20, r: 14, speed: 150, contact: 16, score: 25, bolt: 12, mass: massForRadius(14) };
      case "fighter":
        return { hp: 35, r: 18, speed: 110, contact: 20, score: 40, bolt: 15, mass: massForRadius(18) };
      case "cruiser":
        return { hp: 250, r: 26, speed: 80, contact: 24, score: 80, bolt: 18, mass: massForRadius(26) };
      case "carrier":
        return { hp: 350, r: 41, speed: 60, contact: 30, score: 150, bolt: 25, mass: massForRadius(41) };
      default:
        return { hp: 10, r: 12, speed: 80, contact: 14, score: 15, bolt: 10, mass: massForRadius(12) };
    }
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}
