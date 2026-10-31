/**
 * EcsEngine — владелец ECS-движка и индекса сущностей.
 *
 * Отвечает только за инфраструктуру: создание Engine, поддержку EntityIndex,
 * добавление/удаление сущностей по id и запуск систем. Домены (враги, пули,
 * пикапы и т.д.) строятся поверх него и владеют жизненным циклом своих типов.
 */

import { Engine, type Component, type ComponentClass } from "@trixt0r/ecs";
import { EntityIndex } from "./EntityIndex";
import { GameEntity } from "./GameEntity";

export class EcsEngine {
  readonly engine = new Engine<GameEntity>();
  readonly index: EntityIndex;

  constructor() {
    this.index = new EntityIndex(this.engine);
  }

  /** Выполнить все системы текущего кадра. */
  update(dt: number): void {
    this.engine.run(dt);
  }

  /** Добавить сущность в мир (индекс обновится сам через Engine). */
  add(entity: GameEntity): void {
    this.engine.entities.add(entity);
  }

  /** Удалить сущность из мира. */
  remove(entity: GameEntity): void {
    this.engine.entities.remove(entity);
  }

  /** Найти сущность по id (O(1) через EntityCollection). */
  getEntity(id: number | string): GameEntity | undefined {
    return this.engine.entities.get(id);
  }

  /**
   * Удалить сущность по id, опционально проверив наличие компонента.
   * Возвращает true, если сущность была найдена и удалена.
   */
  removeById(id: number | string, componentClass?: ComponentClass<Component>): boolean {
    const entity = this.getEntity(id);
    if (!entity) return false;
    if (componentClass && !entity.components.get(componentClass)) return false;
    this.remove(entity);
    return true;
  }

  /** Сущности с компонентом заданного класса (без полного скана мира). */
  entitiesWith<T extends Component>(componentClass: ComponentClass<T>): ReadonlySet<GameEntity> {
    return this.index.entitiesWith(componentClass);
  }

  /** Компоненты заданного класса по всем сущностям. */
  query<T extends Component>(componentClass: ComponentClass<T>): T[] {
    const result: T[] = [];
    for (const entity of this.entitiesWith(componentClass)) {
      const component = entity.components.get(componentClass);
      if (component) result.push(component);
    }
    return result;
  }

  /** Полный сброс мира. Индекс очищается через onClearedEntities. */
  clear(): void {
    this.engine.entities.clear();
  }
}
