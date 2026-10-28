/**
 * BulletSystem — ECS-система движения снарядов игрока и врагов.
 *
 * Снаряды зарегистрированы как ECS-сущности с компонентами
 * BulletComponent (игрок) или EnemyBulletComponent (враг). Система
 * фильтрует сущности по аспектам, интегрирует движение/самонаведение,
 * обновляет время жизни и удаляет просроченные снаряды.
 *
 * Здесь же живёт самонаведение ракет: цель хранится живой ссылкой,
 * поэтому снаряд ведёт врага, а не застывшую точку.
 */

import { System, Aspect, type Engine } from "@trixt0r/ecs";
import type { Bullet, Enemy } from "../types";
import { BulletComponent } from "../ecs/components/BulletComponent";
import { EnemyBulletComponent } from "../ecs/components/EnemyBulletComponent";
import { EnemyComponent } from "../ecs/components/EnemyComponent";
import { GameEntity } from "../ecs/GameEntity";

export class BulletSystem extends System {
  private bulletAspect: Aspect | null = null;
  private enemyBulletAspect: Aspect | null = null;

  constructor() {
    super(2); // после движения врагов (0) и стрельбы (1), до физики
  }

  onAddedToEngine(engine: Engine): void {
    this.bulletAspect = Aspect.for(engine).all(BulletComponent);
    this.enemyBulletAspect = Aspect.for(engine).all(EnemyBulletComponent);
  }

  /** Обновить все снаряды (движение + самонаведение + очистка по времени жизни). */
  process(dt: number): void {
    const bulletAspect = this.bulletAspect;
    const enemyBulletAspect = this.enemyBulletAspect;

    if (bulletAspect) {
      const toRemove: GameEntity[] = [];
      for (const entity of [...bulletAspect.entities] as GameEntity[]) {
        const component = entity.components.get(BulletComponent);
        if (!component) continue;
        const b = component.bullet;
        this.steer(b, dt, this.collectEnemies());
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0) toRemove.push(entity);
      }
      for (const entity of toRemove) this.engine?.entities.remove(entity);
    }

    if (enemyBulletAspect) {
      const toRemove: GameEntity[] = [];
      for (const entity of [...enemyBulletAspect.entities] as GameEntity[]) {
        const component = entity.components.get(EnemyBulletComponent);
        if (!component) continue;
        const b = component.bullet;
        // Предыдущая позиция нужна для swept-проверки пролёта мимо корабля.
        b.px = b.x;
        b.py = b.y;
        b.x += b.vx * dt;
        b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0) toRemove.push(entity);
      }
      for (const entity of toRemove) this.engine?.entities.remove(entity);
    }
  }

  /** Собрать живых врагов из ECS-сущностей с EnemyComponent. */
  private collectEnemies(): Enemy[] {
    const result: Enemy[] = [];
    if (!this.engine) return result;
    for (const entity of this.engine.entities.elements as GameEntity[]) {
      const component = entity.components.get(EnemyComponent);
      if (component) result.push(component.enemy);
    }
    return result;
  }

  /**
   * Повернуть самонаводящийся снаряд к живой цели.
   *
   * Если текущая цель погибла, ракета перенаводится на ближайшего
   * живого врага в пределах радиуса захвата (lockRange). Целей нет —
   * ракета летит прямо до конца времени жизни.
   */
  private steer(b: Bullet, dt: number, enemies: readonly Enemy[]): void {
    const homing = b.homing;
    if (!homing) return;

    let target = homing.target;
    if (!target || target.dead) {
      target = this.findNearest(b.x, b.y, enemies, homing.lockRange);
      homing.target = target;
    }
    if (!target) return;

    const speed = Math.hypot(b.vx, b.vy) || 1;
    const current = Math.atan2(b.vy, b.vx);
    const desired = Math.atan2(target.y - b.y, target.x - b.x);

    // Разница углов в диапазоне (-PI, PI].
    let diff = desired - current;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    // Поворот не превышает скорость наведения.
    const step = Math.min(Math.abs(diff), homing.turnRate * dt);
    const next = current + Math.sign(diff) * step;

    b.vx = Math.cos(next) * speed;
    b.vy = Math.sin(next) * speed;
  }

  /** Ближайший живой враг в пределах радиуса захвата от точки. */
  private findNearest(
    x: number,
    y: number,
    enemies: readonly Enemy[],
    lockRange: number
  ): Enemy | null {
    let nearest: Enemy | null = null;
    let nearestDist = lockRange;

    for (const e of enemies) {
      if (e.dead) continue;
      const dist = Math.hypot(e.x - x, e.y - y);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearest = e;
      }
    }

    return nearest;
  }
}