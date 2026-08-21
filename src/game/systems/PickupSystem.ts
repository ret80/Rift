/**
 * PickupSystem - управление бонусами (power-ups, минералы).
 * Отвечает за спавн, обновление и сбор бонусов.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';
import { PickupKind, ZONE_PICKUP_MAGNET } from '../balance';
import type { AudioEngine } from '../audio';

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
  private audio: AudioEngine;
  private applyPickup: (kind: PickupKind) => void;
  private getPlayerPosition: () => { x: number; y: number };
  
  private pickups: Array<{ 
    kind: PickupKind; 
    x: number; 
    y: number; 
    vx: number; 
    vy: number; 
    life: number; 
    seed: number;
  }> = [];

  constructor(
    eventBus: EventBus,
    state: GameState,
    audio: AudioEngine,
    applyPickup: (kind: PickupKind) => void,
    getPlayerPosition: () => { x: number; y: number }
  ) {
    this.eventBus = eventBus;
    this.state = state;
    this.audio = audio;
    this.applyPickup = applyPickup;
    this.getPlayerPosition = getPlayerPosition;
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
  update(dt: number, pickups: Array<{ kind: PickupKind; x: number; y: number; vx: number; vy: number; life: number; seed: number }>): void {
    const pos = this.getPlayerPosition();
    const playerX = pos.x;
    const playerY = pos.y;
    
    for (let i = pickups.length - 1; i >= 0; i--) {
      const p = pickups[i];
      
      // Движение
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      
      // Магнитное притяжение к игроку — чем ближе, тем сильнее
      const dx = playerX - p.x;
      const dy = playerY - p.y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < ZONE_PICKUP_MAGNET && dist > 2) {
        // Непосредственное смещение к игроку: доля от расстояния в секунду
        // fraction = 12 → ~70% расстояния за 1 сек, ~95% за 0.3 сек
        const fraction = Math.pow(1 - dist / ZONE_PICKUP_MAGNET, 0.5) * 25;
        p.x += dx * fraction * dt;
        p.y += dy * fraction * dt;
      }
      
      p.life -= dt;
      
      // Удаление по времени жизни
      if (p.life <= 0) {
        pickups.splice(i, 1);
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
