/**
 * EnemySystem - управление врагами.
 * Отвечает за AI, движение, стрельбу и состояние врагов.
 */

import type { AudioManager } from './AudioManager';
import { EnemyAI } from '../ai/EnemyAI';
import { GameContext } from '../ai/GameContext';
import { EnemyKind, massForRadius, DRONE_BASE_SPEED, HUNTER_SPEED, FIGHTER_BASE_SPEED, CRUISER_BASE_SPEED, CARRIER_BASE_SPEED, CRUISER_FIRE_RANGE } from '../balance';
import type { Enemy } from '../types';
import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Fx } from '../fx';
import { TAU } from '../math';


export interface EnemyFireData {
  x: number;
  y: number;
  kind: EnemyKind;
  angle: number;
  r: number;
  boltDmg: number;
  heavy: boolean;
  cruiser: boolean;
}

/** Пуля врага для уклонения от неё */
interface EnemyBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
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
  private ai: EnemyAI;
  private context: GameContext;
  
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioManager;
  private enemyFireCallback: (e: EnemyFireData) => void;
  private getZoneBounds: () => { x: number; y: number; radius: number; active: boolean };
  
  private wave = 1;
  
  // Для отрисовки
  private enemyList: Enemy[] = [];
  
  constructor(
    eventBus: EventBus,
    state: GameState,
    fx: Fx,
    audio: AudioManager,
    enemyFireCallback: (e: EnemyFireData) => void,
    getZoneBounds: () => { x: number; y: number; radius: number; active: boolean }
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
    this.enemyFireCallback = enemyFireCallback;
    this.getZoneBounds = getZoneBounds;
    this.ai = new EnemyAI();
    this.context = new GameContext(this.state, this.eventBus);
  }
  
  reset(): void {
    this.enemyList = [];
    this.wave = 1;
  }
  
  setWave(wave: number): void {
    this.wave = wave;
  }
  
  getEnemyList(): Enemy[] {
    return this.enemyList;
  }
  
  getLiveCount(): number {
    return this.enemyList.filter(e => !e.dead).length;
  }



  addEnemy(kind: EnemyKind, x: number, y: number, def: EnemyDef, playerPos?: { x: number; y: number }): void {
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === EnemyKind.Drone && playerPos
      ? Math.atan2(playerPos.y - y, playerPos.x - x)
      : rand(0, TAU);
    const mass = massForRadius(def.r);
    // Cruiser gets dual turrets with staggered cooldowns
    const tStagger = rand(-0.5, 0.5);
    // Carrier gets burst spawning logic
    const carrierBurstActive = Math.random() < 0.5; // stagger initial state
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;
    // dodgeWeight: насколько сильно враг избегает других
    const dodgeWeight = this.getDodgeWeight(kind);
    this.enemyList.push({
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
      dodgeWeight,
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned,
      burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: 0.5,
      dodgeDir: 0,
      dodgeTimer: 0,
    });
  }
  
  update(dt: number, enemyList: Enemy[], playerPos: { x: number; y: number }, enemyBullets?: EnemyBullet[]): void {
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = 0;
    const playerVy = 0;
    const zone = this.getZoneBounds();
    
    // Update game context for strategies
    this.context.update(
      dt,
      playerX, playerY, playerVx, playerVy,
      0, 0, 0,
      this.wave,
      enemyBullets || []
    );
    
    // AI movement via strategy pattern
    this.ai.updateAI(enemyList, this.context, dt);
    
    // Apply velocity and update state
    for (let i = 0; i < enemyList.length; i++) {
      const e = enemyList[i];
      if (e.dead) continue;
      
      e.flash = Math.max(0, e.flash - dt * 5);
      e.hitCd = Math.max(0, e.hitCd - dt);
      
      // apply velocity
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    
    // shooting logic
    this.updateFiring(enemyList, dt);
    
    // Simple collision avoidance between all enemies
    this.applyAvoidance(enemyList, dt);
  }
  
  /** Enemy shooting logic */
  private updateFiring(enemyList: Enemy[], dt: number): void {
    for (const e of enemyList) {
      if (e.dead) continue;
      
      // Только стреляющие типы
      if (e.kind !== EnemyKind.Fighter && e.kind !== EnemyKind.Cruiser && e.kind !== EnemyKind.Carrier) continue;
      
      const dx = this.context.playerX - e.x;
      const dy = this.context.playerY - e.y;
      const dist = Math.hypot(dx, dy) || 1;
      
      const canShoot = (e.kind === EnemyKind.Fighter && dist < 500) ||
                       (e.kind === EnemyKind.Cruiser && dist < CRUISER_FIRE_RANGE) ||
                       (e.kind === EnemyKind.Carrier && dist < 500);
      
      if (!canShoot) continue;
      
      if (e.kind === EnemyKind.Cruiser) {
        // Cruiser: dual independent turrets
        const accuracy = this.getAccuracy(this.wave);
        const spread = (1 - accuracy) * 0.8;
        const rate = 1.5 / (3 + this.wave * 0.08);
        
        e.tCd1! -= dt;
        if (e.tCd1! <= 0) {
          e.tCd1! = rate + rand(-0.15, 0.15);
          const tx = e.x - Math.sin(e.angle) * 14;
          const ty = e.y + Math.cos(e.angle) * 14;
          const tAngle = Math.atan2(this.context.playerY - ty, this.context.playerX - tx) + (Math.random() - 0.5) * 2 * spread;
          this.enemyFireCallback({ x: tx, y: ty, kind: e.kind, angle: tAngle, r: e.r, boltDmg: e.boltDmg, heavy: true, cruiser: true });
          this.audio.heavyShoot();
        }
        
        e.tCd2! -= dt;
        if (e.tCd2! <= 0) {
          e.tCd2! = rate + rand(-0.15, 0.15);
          const tx = e.x + Math.sin(e.angle) * 14;
          const ty = e.y - Math.cos(e.angle) * 14;
          const tAngle = Math.atan2(this.context.playerY - ty, this.context.playerX - tx) + (Math.random() - 0.5) * 2 * spread;
          this.enemyFireCallback({ x: tx, y: ty, kind: e.kind, angle: tAngle, r: e.r, boltDmg: e.boltDmg, heavy: true, cruiser: true });
          this.audio.heavyShoot();
        }
      } else {
        // Fighter and Carrier: single turret
        const accuracy = this.getAccuracy(this.wave);
        const spread = (1 - accuracy) * 1.2;
        const baseRate = e.kind === EnemyKind.Carrier ? 1.5 : 0.8;
        const waveBoost = Math.min(2.5, 1 + this.wave * 0.08);
        e.fireCd -= dt * waveBoost;
        
        if (e.fireCd <= 0) {
          e.fireCd = baseRate;
          const heavy = e.kind === EnemyKind.Carrier;
          this.enemyFireCallback({
            x: e.x, y: e.y, kind: e.kind,
            angle: e.angle + (Math.random() - 0.5) * 2 * spread,
            r: e.r, boltDmg: e.boltDmg, heavy, cruiser: false,
          });
          if (heavy) this.audio.heavyShoot();
          else this.audio.enemyShoot();
        }
      }
    }
  }

  /** Мягко раздвигает врагов, которые слишком близко друг к другу */
  private applyAvoidance(enemyList: Enemy[], dt: number): void {
    const minDist = 35;
    const basePush = 1.2;
    
    for (let i = 0; i < enemyList.length; i++) {
      const a = enemyList[i];
      if (a.dead) continue;
      
      for (let j = i + 1; j < enemyList.length; j++) {
        const b = enemyList[j];
        if (b.dead) continue;
        
        if (a.parent === b || b.parent === a) continue;
        
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        const minDistSq = minDist * minDist;
        
        if (distSq < minDistSq && distSq > 0.01) {
          const dist = Math.sqrt(distSq);
          const push = (1 - dist / minDist) * basePush;
          const pushX = (dx / dist) * push;
          const pushY = (dy / dist) * push;
          
          const aMult = a.dodgeWeight || 1.0;
          const bMult = b.dodgeWeight || 1.0;
          
          a.vx += pushX * aMult;
          a.vy += pushY * aMult;
          b.vx -= pushX * bMult;
          b.vy -= pushY * bMult;
        }
      }
    }
  }
  
  /** Возвращает weight для avoidance: насколько сильно корабль должен избегать других */  /** Возвращает weight для avoidance: насколько сильно корабль должен избегать других */
  private getDodgeWeight(kind: EnemyKind): number {
    switch (kind) {
      case EnemyKind.Drone:     return 2.5; // рой должен рассеиваться
      case EnemyKind.Hunter:    return 1.5; // охотники маневрируют
      case EnemyKind.Fighter:   return 1.2; // истребители — умеренно
      case EnemyKind.Cruiser:   return 1.0; // тяжёлые — по базе
      case EnemyKind.Carrier:   return 0.8; // носители — меньше избегают
      default:                  return 1.0;
    }
  }
  
  damageEnemy(index: number, dmg: number): boolean {
    if (index < 0 || index >= this.enemyList.length) return false;
    
    const e = this.enemyList[index];
    if (e.dead) return false;
    
    e.hp -= dmg;
    e.hitCd = 0.15;
    
    if (e.hp <= 0) {
      e.dead = true;
      return true;
    }
    
    return false;
  }
  
  removeDead(): void {
    this.enemyList = this.enemyList.filter(e => !e.dead);
  }

  spawn(kind: EnemyKind, x: number, y: number, parent: Enemy | null, enemyList: any[], playerPos?: { x: number; y: number }): void {
    const def = this.getEnemyDef(kind);
    const mass = massForRadius(def.r);
    // Дроны ориентируются носом к игроку при спавне
    const angle = kind === EnemyKind.Drone && playerPos
      ? Math.atan2(playerPos.y - y, playerPos.x - x)
      : rand(0, TAU);
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
      dodgeWeight: this.getDodgeWeight(kind),
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned,
      burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: rand(0.7, 1.2),
      dodgeDir: 0,
      dodgeTimer: 0,
    };
    // Добавляем во внутренний массив и во внешний (enemyList)
    this.enemyList.push(e);
    enemyList.push(e);
    if (parent) {
      parent.spawnCd = 0;
    }
  }

  /** Меткость врагов: 0.3 на волне 1, растёт до 0.7 к волне 30. */
  private getAccuracy(wave: number): number {
    return Math.min(0.7, 0.3 + wave * 0.013);
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    const w = this.wave;
    switch (kind) {
      case EnemyKind.Drone:
        return { hp: 8, r: 14, speed: DRONE_BASE_SPEED + w * 2, contact: 12, score: 10, bolt: 8, mass: massForRadius(14) };
      case EnemyKind.Hunter:
        return { hp: 20, r: 14, speed: HUNTER_SPEED + w * 2, contact: 16, score: 25, bolt: 12, mass: massForRadius(14) };
      case EnemyKind.Fighter:
        return { hp: 35, r: 18, speed: FIGHTER_BASE_SPEED + w * 0.5, contact: 20, score: 40, bolt: 15, mass: massForRadius(18) };
      case EnemyKind.Cruiser:
        return { hp: 250, r: 26, speed: CRUISER_BASE_SPEED + w * 1.5, contact: 24, score: 80, bolt: 18, mass: massForRadius(26) };
      case EnemyKind.Carrier:
        return { hp: 350, r: 41, speed: CARRIER_BASE_SPEED + w * 1, contact: 30, score: 150, bolt: 25, mass: massForRadius(41) };
      default:
        return { hp: 10, r: 12, speed: 80, contact: 14, score: 15, bolt: 10, mass: massForRadius(12) };
    }
  }

  /** Сложение двух углов с учётом весов (для blended dodge) */
  private lerpAngleAngle(a: number, b: number, t: number): number {
    let diff = b - a;
    while (diff > Math.PI) diff -= TAU;
    while (diff < -Math.PI) diff += TAU;
    return a + diff * t;
  }
  
  /**
   * Проверяет, свободна ли сторона от столкновений.
   * Возвращает минимальное расстояние до любой пули/врага в этом направлении.
   */
  private checkSideFree(
    ex: number, ey: number,
    nx: number, ny: number, // направление проверки (нормализованное)
    evx: number, evy: number, // текущая скорость дрона
    bullets: Array<{x: number; y: number; vx: number; vy: number; life: number}>,
    allEnemies: Array<{x: number; y: number; kind: string; dead: boolean}>
  ): number {
    const checkDist = 120;
    let minDist = 9999;
    
    // Проверяем пули
    for (const b of bullets) {
      const dx = b.x - ex;
      const dy = b.y - ey;
      const proj = dx * nx + dy * ny;
      if (proj < 0 || proj > checkDist) continue;
      
      // Перпендикулярное расстояние
      const perpDist = Math.abs(dx * ny - dy * nx);
      if (perpDist < minDist) minDist = perpDist;
    }
    
    // Проверяем других врагов
    for (const other of allEnemies) {
      if (other.dead) continue;
      const dx = other.x - ex;
      const dy = other.y - ey;
      const proj = dx * nx + dy * ny;
      if (proj < 0 || proj > checkDist) continue;
      
      const perpDist = Math.abs(dx * ny - dy * nx);
      if (perpDist < minDist) minDist = perpDist;
    }
    
    return minDist;
  }
}

function rand(min: number, max: number): number {
  return min + Math.random() * (max - min);
}