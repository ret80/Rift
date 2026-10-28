/**
 * Физический слой: абстрактный интерфейс физики и реализации бэкендов.
 *
 * Игровой код использует только PhysicsSystem. Конкретная реализация
 * выбирается в композиционном корне (GameContext), как и рендер-бэкенд.
 * Также доступен реестр движков и фабрика createPhysicsEngine для
 * выбора из меню настроек и URL-параметра ?physics=<id>.
 */

import type { IPhysics } from "./IPhysics.ts";
import { CustomCurrentPhysics } from "./CustomCurrentPhysics";
import { PlanckPhysics } from "./PlanckPhysics";
import { P2Physics } from "./P2Physics";

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
export { P2Physics } from "./P2Physics";
export { playerEntity, enemyEntity, asteroidEntity, pickupEntity } from "./entities";

/** Идентификаторы физических движков, доступных в игре. */
export type PhysicsEngineId = "planck" | "custom" | "p2";

/** Порядок и состав списка движков для меню настроек. */
export const PHYSICS_ENGINE_IDS: readonly PhysicsEngineId[] = [
  "planck",
  "custom",
  "p2",
] as const;

export function isPhysicsEngineId(value: string): value is PhysicsEngineId {
  return (PHYSICS_ENGINE_IDS as readonly string[]).includes(value);
}

/** Нормализует произвольный id (из URL/localStorage) в валидный движок. */
export function normalizePhysicsEngine(value: string | null | undefined): PhysicsEngineId {
  return value && isPhysicsEngineId(value) ? value : "planck";
}

/** Создаёт движок по id. Используется в композиционном корне. */
export function createPhysicsEngine(id: PhysicsEngineId): IPhysics {
  switch (id) {
    case "custom":
      return new CustomCurrentPhysics();
    case "p2":
      return new P2Physics();
    case "planck":
    default:
      return new PlanckPhysics();
  }
}