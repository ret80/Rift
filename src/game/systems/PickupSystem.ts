/**
 * PickupSystem - управление бонусами (power-ups, минералы).
 * Отвечает за спавн, обновление и сбор бонусов.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import type { PickupKind } from '../balance';
import { ZONE_PICKUP_MAGNET } from '../balance';

export interface PickupData {
  kind: PickupKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  seed: number;
}

export class PickupSystem {
  private eventBus: EventBus;
  private state: GameState;
  
  private pickups: Array<{ 
    kind: PickupKind; 
    x: number; 
    y: number; 
    vx: number; 
    vy: number; 
    life: number; 
    seed: number;
  }> = [];

  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
  }

  /**
   * Создать бонус.
   */
  spawn(kind: PickupKind, x: number, y: number, vx: number, vy: number): void {
    this.pickups.push({
      kind,
      x,
      y,
      vx,
      vy,
      life: 20, // 20 секунд жизни
      seed: Math.random(),
    });
  }

  /**
   * Обновить все бонусы.
   */
  update(dt: number, playerX: number, playerY: number, zoneRadius: number): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      
      // Движение
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      
      // Магнит к игроку если близко
      const distToPlayer = Math.hypot(playerX - p.x, playerY - p.y);
      const distToZoneEdge = zoneRadius - Math.hypot(p.x - this.state.zone.x, p.y - this.state.zone.y);
      
      if (distToZoneEdge < ZONE_PICKUP_MAGNET || distToPlayer < 150) {
        const angle = Math.atan2(playerY - p.y, playerX - p.x);
        const magnetSpeed = 200;
        p.vx += Math.cos(angle) * magnetSpeed * dt;
        p.vy += Math.sin(angle) * magnetSpeed * dt;
        
        // Затухание скорости
        p.vx *= 0.95;
        p.vy *= 0.95;
      }
      
      // Удаление по времени жизни
      if (p.life <= 0) {
        this.pickups.splice(i, 1);
      }
    }
  }

  /**
   * Проверить сбор бонуса игроком.
   */
  checkCollection(
    playerX: number,
    playerY: number,
    playerR: number,
    onCollect: (pickup: PickupData, index: number) => void
  ): void {
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      const p = this.pickups[i];
      const dist = Math.hypot(playerX - p.x, playerY - p.y);
      
      if (dist < playerR + 20) {
        onCollect({ ...p }, i);
        this.pickups.splice(i, 1);
      }
    }
  }

  /**
   * Получить все бонусы.
   */
  getPickups(): Array<{ 
    kind: PickupKind; 
    x: number; 
    y: number; 
    vx: number; 
    vy: number; 
    life: number; 
    seed: number;
  }> {
    return this.pickups;
  }

  /**
   * Сбросить все бонусы.
   */
  clear(): void {
    this.pickups = [];
  }

  /**
   * Получить количество бонусов.
   */
  getCount(): number {
    return this.pickups.length;
  }
}
