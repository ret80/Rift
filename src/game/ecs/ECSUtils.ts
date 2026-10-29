/**
 * ECSUtils — утилиты для работы с ECS-миром @trixt0r/ecs.
 *
 * EntityRef: ссылка на другую сущность по id (вместо живой ссылки на
 * объект). resolveEntityId возвращает живой Entity из соответствующей
 * коллекции, либо null, если цель удалена.
 */

import type { Engine } from "@trixt0r/ecs";
import { GameEntity } from "./GameEntity";

export type EntityId = number | string;

/** Получить живую сущность по id из движка. */
export function resolveEntityId(engine: Engine<GameEntity>, id: EntityId | null): GameEntity | null {
  if (id === null || id === undefined) return null;
  const entity = engine.entities.get(id);
  return (entity as GameEntity) ?? null;
}