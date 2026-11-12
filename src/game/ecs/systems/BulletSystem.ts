/**
 * BulletSystem — ECS-система движения, самонаведения и дальности снарядов.
 *
 * Снаряды игрока и врагов — чистые данные (Position + Velocity, плюс
 * BulletComponent / EnemyBulletComponent, BulletSweepComponent и HomingRef).
 * Система фильтрует сущности по аспектам, интегрирует движение/самонаведение
 * и тикает время жизни. Дальность снаряда задаётся LifeComponent при спавне
 * (дальность / скорость), а не границей зоны: зона проницаема для выстрелов.
 *
 * Если LifeComponent на сущности нет, снаряд летит бесконечно — так живут
 * только специальные эффекты, обычные выстрелы всегда получают запас.
 *
 * Цель самонаведения — HomingRef.targetId (ссылка на сущность по id,
 * EntityRef), а не живая ссылка на объект.
 */

import { Aspect, type Engine } from "@trixt0r/ecs";
import { BulletComponent } from "../components/BulletComponent";
import { BulletSweepComponent } from "../components/BulletSweepComponent";
import { EnemyBulletComponent } from "../components/EnemyBulletComponent";
import { EnemyComponent } from "../components/EnemyComponent";
import { HomingRef } from "../components/HomingRef";
import { LifeComponent } from "../components/LifeComponent";
import { PositionComponent } from "../components/PositionComponent";
import { VelocityComponent } from "../components/VelocityComponent";
import { GameEntity } from "../GameEntity";
import { Phase, PhasedSystem } from "../SystemSchedule";

/** Позиция (и признак живости) врага как цель самонаведения. */
interface EnemyTarget {
  id: number | string;
  x: number;
  y: number;
  dead: boolean;
}

export class BulletSystem extends PhasedSystem {
  private bulletAspect: Aspect | null = null;
  private enemyBulletAspect: Aspect | null = null;
  private enemyAspect: Aspect | null = null;

  constructor() {
    super(Phase.Projectiles);
  }

  onAddedToEngine(engine: Engine): void {
    // LifeComponent в аспект не входит: снаряд без него просто не имеет срока.
    this.bulletAspect = Aspect.for(engine).all(
      BulletComponent, PositionComponent, VelocityComponent,
    );
    this.enemyBulletAspect = Aspect.for(engine).all(
      EnemyBulletComponent, PositionComponent, VelocityComponent,
      BulletSweepComponent,
    );
    this.enemyAspect = Aspect.for(engine).all(EnemyComponent);
  }

  /** Обновить все снаряды (движение + самонаведение + время жизни). */
  process(dt: number): void {
    const bulletAspect = this.bulletAspect;
    const enemyBulletAspect = this.enemyBulletAspect;
    if (!bulletAspect && !enemyBulletAspect) return;

    if (bulletAspect) {
      const toRemove: GameEntity[] = [];
      for (const entity of [...bulletAspect.entities]) {
        const position = entity.components.get(PositionComponent);
        const velocity = entity.components.get(VelocityComponent);
        const bullet = entity.components.get(BulletComponent);
        if (!position || !velocity || !bullet) continue;

        this.steer(entity, dt);
        position.x += velocity.vx * dt;
        position.y += velocity.vy * dt;
        if (this.tickLife(entity, dt)) {
          toRemove.push(entity);
        }
      }
      for (const entity of toRemove) this.engine?.entities.remove(entity);
    }

    if (enemyBulletAspect) {
      const toRemove: GameEntity[] = [];
      for (const entity of [...enemyBulletAspect.entities]) {
        const position = entity.components.get(PositionComponent);
        const velocity = entity.components.get(VelocityComponent);
        const sweep = entity.components.get(BulletSweepComponent);
        if (!position || !velocity || !sweep) continue;

        // Предыдущая позиция нужна для swept-проверки пролёта мимо корабля.
        sweep.px = position.x;
        sweep.py = position.y;
        position.x += velocity.vx * dt;
        position.y += velocity.vy * dt;
        if (this.tickLife(entity, dt)) {
          toRemove.push(entity);
        }
      }
      for (const entity of toRemove) this.engine?.entities.remove(entity);
    }
  }

  /**
   * Снять кадр времени жизни, если снаряд его имеет.
   * true — запас исчерпан, снаряд пора удалить.
   */
  private tickLife(entity: GameEntity, dt: number): boolean {
    const life = entity.components.get(LifeComponent);
    if (!life) return false;
    life.remaining -= dt;
    return life.remaining <= 0;
  }

  /**
   * Повернуть самонаводящийся снаряд к живой цели.
   *
   * Если текущая цель погибла/удалена, ракета перенаводится на ближайшего
   * живого врага в пределах радиуса захвата (lockRange). Целей нет — ракета
   * летит прямо до конца времени жизни.
   */
  private steer(entity: GameEntity, dt: number): void {
    const homing = entity.components.get(HomingRef);
    if (!homing) return;

    const position = entity.components.get(PositionComponent);
    const velocity = entity.components.get(VelocityComponent);
    if (!position || !velocity) return;

    const targetEntity = homing.targetId !== null && homing.targetId !== undefined
      ? this.engine?.entities.get(homing.targetId)
      : undefined;
    // Цель жива, только если сущность существует и враг ещё не погиб.
    let target = this.enemyFromEntity(targetEntity);
    if (!target || target.dead) {
      target = this.findNearest(position.x, position.y, homing.lockRange);
      homing.targetId = target ? target.id : null;
    }
    if (!target) return;

    const speed = Math.hypot(velocity.vx, velocity.vy) || 1;
    const current = Math.atan2(velocity.vy, velocity.vx);
    const desired = Math.atan2(target.y - position.y, target.x - position.x);

    // Разница углов в диапазоне (-PI, PI].
    let diff = desired - current;
    if (diff > Math.PI) diff -= Math.PI * 2;
    if (diff < -Math.PI) diff += Math.PI * 2;

    // Поворот не превышает скорость наведения.
    const step = Math.min(Math.abs(diff), homing.turnRate * dt);
    const next = current + Math.sign(diff) * step;

    velocity.vx = Math.cos(next) * speed;
    velocity.vy = Math.sin(next) * speed;
  }

  /** Прочитать цель (позицию и живость) из сущности-врага по компонентам.
   *  Позиция врага живёт в базовом PositionComponent, живость — в EnemyComponent. */
  private enemyFromEntity(entity: GameEntity | undefined): EnemyTarget | null {
    if (!entity) return null;
    const enemy = entity.components.get(EnemyComponent);
    if (!enemy) return null;
    const position = entity.components.get(PositionComponent);
    if (!position) return null;
    return {
      id: entity.id,
      x: position.x,
      y: position.y,
      dead: enemy.dead,
    };
  }

  /** Собрать живых врагов из ECS-сущностей с EnemyComponent. */
  private collectEnemyTargets(): EnemyTarget[] {
    const result: EnemyTarget[] = [];
    if (!this.enemyAspect) return result;
    for (const entity of this.enemyAspect.entities) {
      const target = this.enemyFromEntity(entity);
      if (target) result.push(target);
    }
    return result;
  }

  /** Ближайший живой враг в пределах радиуса захвата от точки. */
  private findNearest(x: number, y: number, lockRange: number): EnemyTarget | null {
    let nearest: EnemyTarget | null = null;
    let nearestDist = lockRange;

    for (const e of this.collectEnemyTargets()) {
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
