/**
 * Физический слой: абстрактный интерфейс физики и реализации бэкендов.
 *
 * Игровой код использует только PhysicsSystem. Конкретная реализация
 * выбирается в композиционном корне (GameContext), как и рендер-бэкенд.
 */

export type {
  IPhysics,
  PhysicsBodyDef,
  PhysicsBodyKind,
  PhysicsBodyState,
  PhysicsContact,
  PhysicsEntity,
} from "./IPhysics.ts";
export { PHYSICS_MAX_TRANSLATION_PER_STEP } from "./IPhysics.ts";
export { PhysicsSystem } from "./PhysicsSystem";
export { CustomCurrentPhysics } from "./CustomCurrentPhysics";
export { PlanckPhysics } from "./PlanckPhysics";
export { playerEntity, enemyEntity, asteroidEntity } from "./entities";