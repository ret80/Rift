/**
 * EnemySystem - управление врагами.
 * Отвечает за AI, движение, стрельбу и состояние врагов.
 */

import { EnemyAI } from '../ai/EnemyAI';
import { GameContext } from '../ai/GameContext';
import { CARRIER_BASE_SPEED, CRUISER_BASE_SPEED, CRUISER_FIRE_RANGE, DRONE_BASE_SPEED, EnemyKind, FIGHTER_BASE_SPEED, HUNTER_SPEED, massForRadius,
  AI_MIN_DIST,
  AI_BASE_PUSH,
  ENEMY_SHOOT_RANGE,
  ENEMY_ACCURACY_MIN,
  ENEMY_ACCURACY_MAX,
  ENEMY_ACCURACY_RAMP,
} from '../balance';
import type { EventBus } from '../core/EventBus';
import type { Fx } from '../fx';
import { TAU, rand } from '../math';
import type { Enemy } from '../types';
import type { AudioManager } from './AudioManager';


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
  private fx: Fx;
  private audio: AudioManager;
  
  private wave = 1;
  
  // Для отрисовки
  private enemyList: Enemy[] = [];
  
  constructor(
    eventBus: EventBus,
    fx: Fx,
    audio: AudioManager
  ) {
    this.eventBus = eventBus;
    this.fx = fx;
    this.audio = audio;
    this.ai = new EnemyAI();
    this.context = new GameContext(this.eventBus);
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

  /** Factory для создания врага с общими полями */
  private createEnemy(
    kind: EnemyKind, x: number, y: number, def: EnemyDef,
    playerPos?: { x: number; y: number },
    parent: Enemy | null = null
  ): Enemy {
    const angle = kind === EnemyKind.Drone && playerPos
      ? Math.atan2(playerPos.y - y, playerPos.x - x)
      : rand(0, TAU);
    const mass = massForRadius(def.r);
    const tStagger = rand(-0.5, 0.5);
    const carrierBurstActive = Math.random() < 0.5;
    const carrierBurstSpawned = carrierBurstActive ? 10 : 0;

    // Инициализация полей орбиты: только для дронов Carrier
    let droneState: 'orbiting' | 'attacking' | 'none' = 'none';
    let orbitAngle = rand(0, TAU);
    let orbitRadius = 0; // 0 = без орбиты

    if (kind === EnemyKind.Drone && parent) {
      droneState = 'orbiting';
      orbitRadius = parent.r + 80;
    }

    // Орбитальные дроны имеют низкий dodgeWeight чтобы avoidance их не толкал
    let dodgeWeight = this.getDodgeWeight(kind);
    if (kind === EnemyKind.Drone && parent) {
      dodgeWeight = 0.1; // Практически не реагирует на avoidance
    }

    return {
      kind, x, y, vx: 0, vy: 0, angle,
      hp: def.hp, maxHp: def.hp, r: def.r, speed: def.speed,
      contact: def.contact, score: def.score, boltDmg: def.bolt,
      fireCd: rand(0.3, 1), mode: 0, modeT: 0,
      strafeDir: Math.random() < 0.5 ? -1 : 1,
      seed: Math.random() * 100, spawnCd: rand(1, 2),
      flash: 0, hitCd: 0, dead: false, parent, mass,
      dodgeWeight: this.getDodgeWeight(kind),
      tCd1: rand(0.3, 0.8) + tStagger,
      tCd2: rand(0.3, 0.8) - tStagger,
      burstSpawned: carrierBurstSpawned, burstActive: carrierBurstActive,
      burstRestT: carrierBurstActive ? 0 : rand(6, 10),
      burstCd: 0.5, dodgeDir: 0, dodgeTimer: 0,
      droneState, orbitAngle, orbitRadius,
      orbitTimer: carrierBurstActive ? 0 : rand(5, 8),
      waitTimer: 0,
      phaseDrones: 0,
      carrierChildren: 0,
    };
  }

  addEnemy(kind: EnemyKind, x: number, y: number, def: EnemyDef, playerPos?: { x: number; y: number }): void {
    this.enemyList.push(this.createEnemy(kind, x, y, def, playerPos));
  }
  
  update(
    dt: number,
    enemyList: Enemy[],
    playerPos: { x: number; y: number; vx?: number; vy?: number },
    enemyBullets?: EnemyBullet[],
    zoneBounds?: { x: number; y: number; radius: number }
  ): void {
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = playerPos.vx || 0;
    const playerVy = playerPos.vy || 0;
    const zoneX = zoneBounds?.x ?? 0;
    const zoneY = zoneBounds?.y ?? 0;
    const zoneRadius = zoneBounds?.radius ?? 0;
    
    // Update game context for strategies
    this.context.update(
      dt,
      playerX, playerY, playerVx, playerVy,
      0, 0, 0,
      this.wave,
      enemyBullets || [],
      zoneX, zoneY, zoneRadius
    );
    
    // AI movement via strategy pattern
    this.context.enemies = enemyList;
    this.ai.updateAI(enemyList, this.context, dt);
    
    // Apply velocity and update state
    for (let i = 0; i < enemyList.length; i++) {
      const e = enemyList[i];
      if (e.dead) continue;
      
      e.flash = Math.max(0, e.flash - dt * 5);
      e.hitCd = Math.max(0, e.hitCd - dt);
      
      // skip velocity apply for orbiting drones — they control their own position
      if (e.droneState === 'orbiting') continue;
      
      // apply velocity
      e.x += e.vx * dt;
      e.y += e.vy * dt;
    }
    
    // processing carrier drone spawns
    const carrierSpawns = this.ai.processCarrierSpawns(enemyList, this.context, dt);
    for (const spawn of carrierSpawns) {
      const droneDef = this.getEnemyDef(EnemyKind.Drone);
      const drone = this.createEnemy(EnemyKind.Drone, spawn.x, spawn.y, droneDef, playerPos, null);
      // Set parent to carrier for proper tracking
      const carrier = this.findCarrierForDrone(enemyList, spawn);
      if (carrier) {
        drone.parent = carrier;
        // Дрон начинается на орбите вокруг Carrier
        drone.droneState = 'orbiting';
        drone.orbitRadius = carrier.r + 80;
        drone.orbitAngle = Math.random() * Math.PI * 2;
      }
      this.enemyList.push(drone);
      enemyList.push(drone);
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
      
      const canShoot = (e.kind === EnemyKind.Fighter && dist < ENEMY_SHOOT_RANGE) ||
                       (e.kind === EnemyKind.Cruiser && dist < CRUISER_FIRE_RANGE) ||
                       (e.kind === EnemyKind.Carrier && dist < ENEMY_SHOOT_RANGE);
      
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
          this.eventBus.publish('enemy_fired', { x: tx, y: ty, kind: e.kind, angle: tAngle, r: e.r, boltDmg: e.boltDmg, heavy: true, cruiser: true });
          this.audio.playHeavyShoot();
        }
        
        e.tCd2! -= dt;
        if (e.tCd2! <= 0) {
          e.tCd2! = rate + rand(-0.15, 0.15);
          const tx = e.x + Math.sin(e.angle) * 14;
          const ty = e.y - Math.cos(e.angle) * 14;
          const tAngle = Math.atan2(this.context.playerY - ty, this.context.playerX - tx) + (Math.random() - 0.5) * 2 * spread;
          this.eventBus.publish('enemy_fired', { x: tx, y: ty, kind: e.kind, angle: tAngle, r: e.r, boltDmg: e.boltDmg, heavy: true, cruiser: true });
          this.audio.playHeavyShoot();
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
          // Fighter: стреляем в игрока, Carrier: по корпусу
          const fireAngle = e.kind === EnemyKind.Fighter
            ? Math.atan2(this.context.playerY - e.y, this.context.playerX - e.x)
            : e.angle;
          this.eventBus.publish('enemy_fired', {
            x: e.x, y: e.y, kind: e.kind,
            angle: fireAngle + (Math.random() - 0.5) * 2 * spread,
            r: e.r, boltDmg: e.boltDmg, heavy, cruiser: false,
          });
          if (heavy) this.audio.playHeavyShoot();
          else this.audio.playEnemyShoot();
        }
      }
    }
  }

  /** Мягко раздвигает врагов, которые слишком близко друг к другу */
  private applyAvoidance(enemyList: Enemy[], dt: number): void {
    const minDistSq = AI_MIN_DIST * AI_MIN_DIST;
    
    for (let i = 0; i < enemyList.length; i++) {
      const a = enemyList[i];
      if (a.dead) continue;
      
      // Орбитальные дроны полностью игнорируют avoidance
      if (a.droneState === 'orbiting') continue;
      
      for (let j = i + 1; j < enemyList.length; j++) {
        const b = enemyList[j];
        if (b.dead) continue;
        
        if (a.parent === b || b.parent === a) continue;
        
        // Орбитальные дроны игнорируют avoidance полностью
        if (b.droneState === 'orbiting') continue;
        
        const dx = a.x - b.x;
        const dy = a.y - b.y;
        const distSq = dx * dx + dy * dy;
        
      if (distSq < AI_MIN_DIST * AI_MIN_DIST && distSq > 0.01) {
        const dist = Math.sqrt(distSq);
        const push = (1 - dist / AI_MIN_DIST) * AI_BASE_PUSH;
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
  
  /** Возвращает weight для avoidance: насколько сильно корабль должен избегать других */
  private getDodgeWeight(kind: EnemyKind): number {
    const weights: Record<EnemyKind, number> = {
      [EnemyKind.Drone]: 2.5,
      [EnemyKind.Hunter]: 1.5,
      [EnemyKind.Fighter]: 1.2,
      [EnemyKind.Cruiser]: 1.0,
      [EnemyKind.Carrier]: 0.8,
    };
    return weights[kind] ?? 1.0;
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
    let spawnX = x;
    let spawnY = y;

    // Если дрон спавнится от Carrier — размещаем на орбите
    if (kind === EnemyKind.Drone && parent && parent.kind === EnemyKind.Carrier) {
      const orbitAngle = Math.random() * TAU;
      const orbitRadius = parent.r + 80;
      spawnX = parent.x + Math.cos(orbitAngle) * orbitRadius;
      spawnY = parent.y + Math.sin(orbitAngle) * orbitRadius;
    }

    const e = this.createEnemy(kind, spawnX, spawnY, def, playerPos, parent);
    this.enemyList.push(e);
    enemyList.push(e);
    if (parent) {
      parent.spawnCd = 0;
    }
  }

  /** Меткость врагов: ENEMY_ACCURACY_MIN на волне 1, растёт до ENEMY_ACCURACY_MAX к волне 30. */
  private getAccuracy(wave: number): number {
    return Math.min(ENEMY_ACCURACY_MAX, ENEMY_ACCURACY_MIN + wave * ENEMY_ACCURACY_RAMP);
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

  /** Найти ближайшего живого Carrier для дрона */
  private findCarrierForDrone(enemies: Enemy[], spawnPos: { x: number; y: number }): Enemy | null {
    let closest: Enemy | null = null;
    let closestDist = Infinity;
    for (const e of enemies) {
      if (e.kind !== EnemyKind.Carrier || e.dead) continue;
      const d = Math.hypot(e.x - spawnPos.x, e.y - spawnPos.y);
      if (d < closestDist) {
        closestDist = d;
        closest = e;
      }
    }
    return closest;
  }
}
