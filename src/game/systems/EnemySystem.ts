/**
 * EnemySystem - управление врагами.
 * Отвечает за AI, движение и состояние врагов.
 * Стрельба вынесена в EnemyShootingSystem.
 */

import { EnemyAI } from '../ai/EnemyAI';
import { GameContext } from '../ai/GameContext';
import type { EnemyDef } from '../balance';
import {
  AI_BASE_PUSH,
  AI_MIN_DIST,
  EnemyKind,
  enemyDefFor,
  massForRadius,
} from '../balance';
import { TAU, rand } from '../math';
import type { Enemy } from '../types';

export class EnemySystem {
  private ai: EnemyAI;
  private context: GameContext;
  
  private wave = 1;
  
  constructor() {
    this.ai = new EnemyAI();
    this.context = new GameContext();
  }
  
  reset(): void {
    this.wave = 1;
  }
  
  setWave(wave: number): void {
    this.wave = wave;
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

  update(
    dt: number,
    enemyList: Enemy[],
    playerPos: { x: number; y: number; vx?: number; vy?: number },
    zoneBounds?: { x: number; y: number; radius: number }
  ): void {
    const playerX = playerPos.x;
    const playerY = playerPos.y;
    const playerVx = playerPos.vx || 0;
    const playerVy = playerPos.vy || 0;
    const zoneX = zoneBounds?.x ?? 0;
    const zoneY = zoneBounds?.y ?? 0;
    const zoneRadius = zoneBounds?.radius ?? 0;
    
    // Sync game context for strategies
    this.context.sync({
      playerX, playerY, playerVx, playerVy,
      zoneX, zoneY, zoneRadius,
      wave: this.wave,
    });
    
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
    const carrierSpawns = this.context.carrierSpawns || [];
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
      enemyList.push(drone);
    }
    
    // Simple collision avoidance between all enemies
    this.applyAvoidance(enemyList, dt);
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
  
  spawn(kind: EnemyKind, x: number, y: number, parent: Enemy | null, enemyList: Enemy[], playerPos?: { x: number; y: number }): void {
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
    enemyList.push(e);
    if (parent) {
      parent.spawnCd = 0;
    }
  }

  private getEnemyDef(kind: EnemyKind): EnemyDef {
    return enemyDefFor(kind, this.wave);
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
