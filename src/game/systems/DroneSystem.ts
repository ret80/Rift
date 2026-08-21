/**
 * DroneSystem - управление дронами-компаньонами игрока.
 * Отвечает за спавн, обновление и атаки дронов.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Enemy } from '../types';
import type { Fx } from '../fx';
import type { AudioEngine } from '../audio';
import { ALLY_DRONE_ORBIT, ALLY_DRONE_RANGE, ALLY_DRONE_DMG, ALLY_DRONE_FIRE_CD, MAX_ALLY_DRONES } from '../balance';

export interface DroneData {
  x: number;
  y: number;
  angle: number;
  fireCd: number;
  phase: number;
  hp: number;
  maxHp: number;
  target: Enemy | null;
  retargetT: number;
  flash: number;
}

export class DroneSystem {
  private eventBus: EventBus;
  private state: GameState;
  private fx: Fx;
  private audio: AudioEngine;
  private spawnEnemy: (kind: string, x: number, y: number, parent: any) => void;
  
  private drones: Array<{
    x: number;
    y: number;
    angle: number;
    fireCd: number;
    phase: number;
    hp: number;
    maxHp: number;
    target: Enemy | null;
    retargetT: number;
    flash: number;
  }> = [];

  constructor(eventBus: EventBus, state: GameState, fx: Fx, audio: AudioEngine, spawnEnemy: (kind: string, x: number, y: number, parent: any) => void) {
    this.eventBus = eventBus;
    this.state = state;
    this.fx = fx;
    this.audio = audio;
    this.spawnEnemy = spawnEnemy;
  }

  /**
   * Добавить дрон.
   */
  addDrone(): boolean {
    if (this.drones.length >= MAX_ALLY_DRONES) {
      return false;
    }
    
    const playerPos = { x: this.state.player.x, y: this.state.player.y };
    const phase = (this.drones.length / MAX_ALLY_DRONES) * Math.PI * 2;
    
    this.drones.push({
      x: playerPos.x + Math.cos(phase) * ALLY_DRONE_ORBIT,
      y: playerPos.y + Math.sin(phase) * ALLY_DRONE_ORBIT,
      angle: phase,
      fireCd: 0,
      phase,
      hp: 30,
      maxHp: 30,
      target: null,
      retargetT: 0,
      flash: 0,
    });
    
    return true;
  }

  /**
    * Добавить дрон (при подборе бонуса).
    */
  spawn(drones: Array<{
    x: number; y: number;
    angle?: number; fireCd?: number; phase?: number;
    hp?: number; maxHp?: number;
    target?: any; retargetT?: number; flash?: number;
  }>, playerPos: { x: number; y: number }): void {
    if (drones.length >= MAX_ALLY_DRONES) return;
    const phase = (drones.length / MAX_ALLY_DRONES) * Math.PI * 2;
    drones.push({
      x: playerPos.x + Math.cos(phase) * ALLY_DRONE_ORBIT,
      y: playerPos.y + Math.sin(phase) * ALLY_DRONE_ORBIT,
      angle: phase,
      fireCd: 0,
      phase,
      hp: 30,
      maxHp: 30,
      target: null,
      retargetT: 0,
      flash: 0,
    });
  }

  /**
    * Обновить все дроны.
    */
  update(dt: number, drones: Array<{ x: number; y: number; angle: number; fireCd: number; phase: number; hp: number; maxHp: number; target: any; retargetT: number; flash: number }>, enemies: Array<{ x: number; y: number; dead: boolean; kind: string }>): void {
    for (const drone of drones) {
      // Орбитальное движение вокруг игрока
      drone.phase += dt * 0.5;
      drone.x = drone.x; // stays in place until updated by game
      drone.y = drone.y;
      
      // Перезарядка
      if (drone.fireCd > 0) {
        drone.fireCd -= dt;
      }
      
      // Выбор цели
      drone.retargetT -= dt;
      if (!drone.target || drone.retargetT <= 0 || drone.target.dead) {
        drone.target = this.findNearestTarget(drone.x, drone.y, enemies as any);
        drone.retargetT = 1.0;
      }
      
      // Атака
      if (drone.target && drone.fireCd <= 0) {
        const dx = drone.target.x - drone.x;
        const dy = drone.target.y - drone.y;
        const dist = Math.hypot(dx, dy);
        
        if (dist < ALLY_DRONE_RANGE) {
          // Выстрел
          drone.fireCd = ALLY_DRONE_FIRE_CD;
          drone.flash = 0.15;
          
          const angle = Math.atan2(dy, dx);
          const speed = 500;
          const vx = Math.cos(angle) * speed;
          const vy = Math.sin(angle) * speed;
          
          // Публикация события выстрела
          this.eventBus.publish('drone_fired', {
            x: drone.x,
            y: drone.y,
            vx,
            vy,
            damage: ALLY_DRONE_DMG,
          });
        }
      }
      
      // Затухание вспышки
      if (drone.flash > 0) {
        drone.flash -= dt;
      }
    }
  }

  /**
   * Найти ближайшую цель.
   */
  private findNearestTarget(x: number, y: number, enemies: Enemy[]): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = Infinity;
    
    for (const enemy of enemies) {
      if (enemy.dead) continue;
      
      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = enemy;
      }
    }
    
    return nearest;
  }

  /**
   * Получить все дроны.
   */
  getDrones(): Array<{
    x: number;
    y: number;
    angle: number;
    fireCd: number;
    phase: number;
    hp: number;
    maxHp: number;
    target: Enemy | null;
    retargetT: number;
    flash: number;
  }> {
    return this.drones;
  }

  /**
   * Сбросить все дроны.
   */
  clear(): void {
    this.drones = [];
  }

  /**
   * Получить количество дронов.
   */
  getCount(): number {
    return this.drones.length;
  }
}
