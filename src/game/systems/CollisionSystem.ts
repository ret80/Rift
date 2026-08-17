/**
 * CollisionSystem - обработка столкновений.
 * Отвечает за проверку и обработку коллизий между объектами.
 */

import type { EventBus } from '../core/EventBus';
import type { GameState } from '../core/GameState';

interface Collidable {
  x: number;
  y: number;
  r: number;
}

export class CollisionSystem {
  private eventBus: EventBus;
  private state: GameState;
  
  constructor(eventBus: EventBus, state: GameState) {
    this.eventBus = eventBus;
    this.state = state;
  }
  
  /**
   * Проверить расстояние между двумя объектами.
   */
  checkDistance(obj1: Collidable, obj2: Collidable): number {
    const dx = obj1.x - obj2.x;
    const dy = obj1.y - obj2.y;
    return Math.hypot(dx, dy);
  }
  
  /**
   * Проверить столкновение двух объектов.
   */
  checkCollision(obj1: Collidable, obj2: Collidable): boolean {
    const dist = this.checkDistance(obj1, obj2);
    return dist < (obj1.r + obj2.r);
  }
  
  /**
   * Проверить столкновение пули с целью.
   */
  checkBulletCollision(
    bulletX: number,
    bulletY: number,
    target: Collidable
  ): boolean {
    const dx = bulletX - target.x;
    const dy = bulletY - target.y;
    const dist = Math.hypot(dx, dy);
    return dist < target.r;
  }
  
  /**
   * Найти все столкновения между списком объектов.
   */
  findAllCollisions(objects: Collidable[]): Array<[number, number]> {
    const collisions: Array<[number, number]> = [];
    
    for (let i = 0; i < objects.length; i++) {
      for (let j = i + 1; j < objects.length; j++) {
        if (this.checkCollision(objects[i], objects[j])) {
          collisions.push([i, j]);
        }
      }
    }
    
    return collisions;
  }
  
  /**
   * Найти ближайший объект к точке.
   */
  findNearest(x: number, y: number, objects: Collidable[], maxDist: number): number {
    let nearestIndex = -1;
    let nearestDist = maxDist;
    
    for (let i = 0; i < objects.length; i++) {
      const dx = objects[i].x - x;
      const dy = objects[i].y - y;
      const dist = Math.hypot(dx, dy);
      
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestIndex = i;
      }
    }
    
    return nearestIndex;
  }
  
  /**
    * Найти все объекты в радиусе.
    */
  findAllInRadius(x: number, y: number, radius: number, objects: Collidable[]): number[] {
    const indices: number[] = [];
    const radius2 = radius * radius;
    
    for (let i = 0; i < objects.length; i++) {
      const dx = objects[i].x - x;
      const dy = objects[i].y - y;
      const dist2 = dx * dx + dy * dy;
      
      if (dist2 < radius2) {
        indices.push(i);
      }
    }
    
    return indices;
  }

  /**
    * Обновить коллизии между всеми объектами.
    */
  update(
    dt: number,
    playerState: { x: number; y: number; r: number; hp: number; invuln: number },
    enemies: Array<{ x: number; y: number; r: number; dead: boolean; hp: number }>,
    bullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number }>,
    enemyBullets: Array<{ x: number; y: number; vx: number; vy: number; life: number; dmg: number; heavy: boolean }>,
    pickups: Array<{ x: number; y: number; r: number }>,
    mines: Array<{ x: number; y: number; r: number }>,
    drones: Array<{ x: number; y: number; r: number }>
  ): void {
    // Этот метод будет вызывать проверку коллизий
    // Пока заглушка для совместимости
  }
}
