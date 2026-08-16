/**
 * GameContext - контекст, передаваемый в системы для чтения состояния.
 * Содержит ссылки на ключевые объекты и состояние игры.
 */

import type { GameState } from '../core/GameState';
import type { Enemy } from '../entities/Enemy';
import type { EventBus } from '../core/EventBus';

export interface GameContextData {
  state: GameState;
  eventBus: EventBus;
  
  // Быстрый доступ к сущностям
  playerX: number;
  playerY: number;
  playerVx: number;
  playerVy: number;
  playerAngle: number;
  playerHp: number;
  playerMaxHp: number;
  
  zoneX: number;
  zoneY: number;
  zoneRadius: number;
  
  enemies: Enemy[];
  deltaTime: number;
}

export class GameContext implements GameContextData {
  public state: GameState;
  public eventBus: EventBus;
  
  public playerX: number = 0;
  public playerY: number = 0;
  public playerVx: number = 0;
  public playerVy: number = 0;
  public playerAngle: number = 0;
  public playerHp: number = 0;
  public playerMaxHp: number = 0;
  
  public zoneX: number = 0;
  public zoneY: number = 0;
  public zoneRadius: number = 0;
  
  public enemies: Enemy[] = [];
  public deltaTime: number = 0;

  constructor(
    state: GameState,
    eventBus: EventBus,
  ) {
    this.state = state;
    this.eventBus = eventBus;
  }

  /**
   * Обновить контекст перед каждым кадром.
   */
  update(dt: number): void {
    this.deltaTime = dt;
    
    // Синхронизация с состоянием
    this.playerX = this.state.player.x;
    this.playerY = this.state.player.y;
    this.playerVx = this.state.player.vx;
    this.playerVy = this.state.player.vy;
    this.playerAngle = this.state.player.angle;
    this.playerHp = this.state.player.hp;
    this.playerMaxHp = this.state.player.maxHp;
    
    this.zoneX = this.state.zone.x;
    this.zoneY = this.state.zone.y;
    this.zoneRadius = this.state.zone.radius;
  }

  /**
   * Получить расстояние от точки до игрока.
   */
  distanceToPlayer(x: number, y: number): number {
    return Math.hypot(x - this.playerX, y - this.playerY);
  }

  /**
   * Получить угол к игроку из точки.
   */
  angleToPlayer(x: number, y: number): number {
    return Math.atan2(this.playerY - y, this.playerX - x);
  }

  /**
   * Проверить, находится ли точка внутри зоны.
   */
  isInsideZone(x: number, y: number): boolean {
    const dist = Math.hypot(x - this.zoneX, y - this.zoneY);
    return dist <= this.zoneRadius;
  }

  /**
   * Получить ближайшего врага к точке (опционально с фильтром).
   */
  getNearestEnemy(x: number, y: number, filter?: (e: Enemy) => boolean): Enemy | null {
    let nearest: Enemy | null = null;
    let minDist = Infinity;

    for (const enemy of this.enemies) {
      if (enemy.dead) continue;
      if (filter && !filter(enemy)) continue;

      const dist = Math.hypot(enemy.x - x, enemy.y - y);
      if (dist < minDist) {
        minDist = dist;
        nearest = enemy;
      }
    }

    return nearest;
  }
}
