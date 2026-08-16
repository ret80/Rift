/**
 * DroneSystem - управление дронами-компаньонами игрока.
 * Отвечает за спавн, обновление и атаки дронов.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { Enemy } from '../entities/Enemy';
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

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
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
   * Обновить все дроны.
   */
  update(dt: number, playerX: number, playerY: number, enemies: Enemy[]): void {
    for (const drone of this.drones) {
      // Орбитальное движение вокруг игрока
      drone.phase += dt * 0.5;
      drone.x = playerX + Math.cos(drone.phase) * ALLY_DRONE_ORBIT;
      drone.y = playerY + Math.sin(drone.phase) * ALLY_DRONE_ORBIT;
      
      // Перезарядка
      if (drone.fireCd > 0) {
        drone.fireCd -= dt;
      }
      
      // Выбор цели
      drone.retargetT -= dt;
      if (!drone.target || drone.retargetT <= 0 || drone.target.dead) {
        drone.target = this.findNearestTarget(drone.x, drone.y, enemies);
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
