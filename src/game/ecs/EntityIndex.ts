/**
 * EntityIndex — обратный индекс «класс компонента → сущности».
 *
 * Устраняет полные проходы по всем сущностям мира при каждом запросе.
 * Индекс поддерживается автоматически через события Engine: add/remove/clear
 * обновляют наборы, поэтому системам не нужно вручную уведомлять его.
 *
 * Это структура данных, а не слой: домены читают готовые наборы и не знают,
 * откуда они взялись.
 */

import type { Component, ComponentClass, Engine, EngineListener } from "@trixt0r/ecs";
import type { GameEntity } from "./GameEntity";

/** Общий пустой набор — не аллоцируем на каждый запрос отсутствующего типа. */
const EMPTY: ReadonlySet<GameEntity> = new Set();

export class EntityIndex implements EngineListener<GameEntity> {
  private readonly byComponent = new Map<ComponentClass<Component>, Set<GameEntity>>();

  constructor(engine: Engine<GameEntity>) {
    engine.addListener(this);
    for (const entity of engine.entities.elements) this.track(entity);
  }

  onAddedEntities(...entities: GameEntity[]): void {
    for (const entity of entities) this.track(entity);
  }

  onRemovedEntities(...entities: GameEntity[]): void {
    for (const entity of entities) this.untrack(entity);
  }

  onClearedEntities(): void {
    this.byComponent.clear();
  }

  /** Сущности, у которых есть компонент заданного класса. */
  entitiesWith<T extends Component>(componentClass: ComponentClass<T>): ReadonlySet<GameEntity> {
    return this.byComponent.get(componentClass as ComponentClass<Component>) ?? EMPTY;
  }

  private track(entity: GameEntity): void {
    for (const component of entity.components.elements) {
      const componentClass = component.constructor as ComponentClass<Component>;
      let entities = this.byComponent.get(componentClass);
      if (!entities) {
        entities = new Set();
        this.byComponent.set(componentClass, entities);
      }
      entities.add(entity);
    }
  }

  private untrack(entity: GameEntity): void {
    for (const component of entity.components.elements) {
      const componentClass = component.constructor as ComponentClass<Component>;
      this.byComponent.get(componentClass)?.delete(entity);
    }
  }
}
