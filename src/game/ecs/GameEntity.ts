/**
 * GameEntity — сущность ECS-мира игры.
 *
 * В отличие от игровых объектов-структур (Enemy, Bullet), сущность — это
 * просто контейнер компонентов с уникальным id. Вся логика живёт в системах,
 * а данные — в компонентах, прикреплённых к сущности.
 */

import { AbstractEntity } from "@trixt0r/ecs";

let nextId = 1;

export class GameEntity extends AbstractEntity {
  constructor() {
    super(`game-${nextId++}`);
  }
}