/**
 * PhysicsSystem - обертка над kinetics.ts для физической симуляции.
 * Управляет физическими телами, коллизиями и интеграцией.
 */

import System from 'kinetics.ts/dist/System';
import Entity from 'kinetics.ts/dist/entities/Entity';
import Vector from 'kinetics.ts/dist/utils/Vector';
import type { CircleConfig } from 'kinetics.ts/dist/typings/Interfaces';
import type { SystemConfig } from 'kinetics.ts/dist/typings/Config';
import type { EventBus } from './EventBus';

export interface PhysicsBody {
  id: string;
  entity: Entity;
  kind: 'player' | 'enemy' | 'bullet' | 'asteroid' | 'pickup';
  userData?: any;
}

export interface PhysicsConfig {
  width: number;
  height: number;
  eventBus: EventBus;
}

export class PhysicsSystem {
  private system: System;
  private bodies: Map<string, PhysicsBody> = new Map();
  private eventBus: EventBus;
  private nextId: number = 0;

  constructor(config: PhysicsConfig) {
    this.eventBus = config.eventBus;
    
    const sysConfig: SystemConfig = {
      collisionInfo: {},
      dimensions: { x: config.width, y: config.height },
      tickRate: 60,
      friction: 0,
      gravity: 0,
      verbose: false,
    };

    this.system = new System(sysConfig);

    // Подписка на события коллизий
    this.system.on('collision', (data: any) => {
      this.handleCollision(data);
    });
  }

  /**
   * Создать круглое физическое тело.
   */
  createCircle(
    id: string,
    x: number,
    y: number,
    radius: number,
    mass: number,
    kind: PhysicsBody['kind'],
    userData?: any,
    staticBody: boolean = false
  ): PhysicsBody {
    const config: CircleConfig = {
      radius,
      mass,
      speed: 0,
      elasticity: 0.5,
      static: staticBody,
      form: {
        radius,
      },
    };

    const entity = new Entity(config, this.system);
    entity.position = new Vector(x, y);
    
    const body: PhysicsBody = {
      id,
      entity,
      kind,
      userData,
    };

    this.system.addEntity(entity);
    this.bodies.set(id, body);

    return body;
  }

  /**
   * Обновить позицию физического тела.
   */
  setPosition(id: string, x: number, y: number): void {
    const body = this.bodies.get(id);
    if (body) {
      body.entity.position.x = x;
      body.entity.position.y = y;
    }
  }

  /**
   * Обновить скорость физического тела.
   */
  setVelocity(id: string, vx: number, vy: number): void {
    const body = this.bodies.get(id);
    if (body) {
      body.entity.velocity.x = vx;
      body.entity.velocity.y = vy;
    }
  }

  /**
   * Получить позицию тела.
   */
  getPosition(id: string): { x: number; y: number } | null {
    const body = this.bodies.get(id);
    if (!body) return null;
    return {
      x: body.entity.position.x,
      y: body.entity.position.y,
    };
  }

  /**
   * Получить скорость тела.
   */
  getVelocity(id: string): { vx: number; vy: number } | null {
    const body = this.bodies.get(id);
    if (!body) return null;
    return {
      vx: body.entity.velocity.x,
      vy: body.entity.velocity.y,
    };
  }

  /**
   * Применить силу к телу.
   */
  applyForce(id: string, fx: number, fy: number): void {
    const body = this.bodies.get(id);
    if (body) {
      body.entity.velocity.x += fx / body.entity.mass;
      body.entity.velocity.y += fy / body.entity.mass;
    }
  }

  /**
   * Удалить физическое тело.
   */
  removeBody(id: string): void {
    const body = this.bodies.get(id);
    if (body) {
      this.system.removeEntity(body.entity);
      this.bodies.delete(id);
    }
  }

  /**
   * Получить физическое тело по ID.
   */
  getBody(id: string): PhysicsBody | undefined {
    return this.bodies.get(id);
  }

  /**
   * Обновить физический мир.
   */
  update(dt: number): void {
    // kinetics.ts использует фиксированный timestep, но мы можем вызывать update
    // Для нашей игры мы будем использовать собственную интеграцию
    // и использовать kinetics только для детекции коллизий
    this.system.CollisionManager.query();
  }

  /**
   * Обработать коллизию между телами.
   */
  private handleCollision(data: any): void {
    const bodyA = this.getBodyByEntity(data.entity1);
    const bodyB = this.getBodyByEntity(data.entity2);

    if (!bodyA || !bodyB) return;

    this.eventBus.publish('physics_collision', {
      bodyA: { id: bodyA.id, kind: bodyA.kind, userData: bodyA.userData },
      bodyB: { id: bodyB.id, kind: bodyB.kind, userData: bodyB.userData },
      normal: data.normal,
      depth: data.depth,
    });
  }

  /**
   * Найти тело по entity.
   */
  private getBodyByEntity(entity: Entity): PhysicsBody | undefined {
    for (const body of this.bodies.values()) {
      if (body.entity === entity) {
        return body;
      }
    }
    return undefined;
  }

  /**
   * Очистить все тела.
   */
  clear(): void {
    for (const body of this.bodies.values()) {
      this.system.removeEntity(body.entity);
    }
    this.bodies.clear();
  }

  /**
   * Получить количество тел.
   */
  get bodyCount(): number {
    return this.bodies.size;
  }
}
