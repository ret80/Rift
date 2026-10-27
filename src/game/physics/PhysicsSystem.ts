/**
 * PhysicsSystem — координатор физики (аналог RendererSystem в рендер-слое).
 *
 * Сам не решает физические уравнения — делегирует бэкенду IPhysics:
 *   - CustomCurrentPhysics — текущая самописная физика (по умолчанию);
 *   - PlanckPhysics       — физика через библиотеку Planck.js.
 *
 * Каждый кадр PhysicsSystem:
 *   1. регистрирует новые тела и удаляет тела исчезнувших сущностей;
 *   2. синхронизирует тела с состоянием сущностей (beginFrame/sync);
 *   3. делает шаг физики (step);
 *   4. если бэкенд сам решает скорости/позиции — возвращает их в сущности;
 *   5. собирает контакты и обогащает их ролями тел для игровых систем.
 */

import type {
  IPhysics,
  PhysicsBodyDef,
  PhysicsBodyState,
  PhysicsContact,
  PhysicsEntity,
} from "./IPhysics.ts";

export class PhysicsSystem implements IPhysics {
  /** Реестр зарегистрированных сущностей (userData -> адаптер и ключ дефа). */
  private registered = new Map<unknown, { entity: PhysicsEntity; defKey: string }>();

  constructor(private readonly engine: IPhysics) {}

  get contacts(): PhysicsContact[] {
    return this.engine.contacts.map((c) => ({
      a: c.a,
      b: c.b,
      kindA: this.registered.get(c.a)?.entity.kind,
      kindB: this.registered.get(c.b)?.entity.kind,
    }));
  }

  get bodyCount(): number {
    return this.engine.bodyCount;
  }

  get resolvesVelocity(): boolean {
    return this.engine.resolvesVelocity;
  }

  /** Позиции интегрирует сам бэкенд — внешние системы её не двигают. */
  get integratesPosition(): boolean {
    return this.engine.integratesPosition;
  }

  /** Псевдоним integratesPosition (используется игровым кадром). */
  get integratesPositions(): boolean {
    return this.engine.integratesPosition;
  }

  // ===== Делегирование бэкенду =====

  addBody(userData: unknown, def: PhysicsBodyDef): void {
    this.engine.addBody(userData, def);
  }

  removeBody(userData: unknown): void {
    this.registered.delete(userData);
    this.engine.removeBody(userData);
  }

  clear(): void {
    this.registered.clear();
    this.engine.clear();
  }

  syncBody(userData: unknown, state: PhysicsBodyState): void {
    this.engine.syncBody(userData, state);
  }

  beginFrame(): void {
    this.engine.beginFrame();
  }

  step(dt: number): void {
    this.engine.step(dt);
  }

  endFrame(): void {
    this.engine.endFrame();
  }

  getState(userData: unknown): PhysicsBodyState {
    return this.engine.getState(userData);
  }

  /** Полный сброс (новый забег/меню): тела пересоздаются в следующем кадре. */
  reset(): void {
    this.registered.clear();
    this.engine.clear();
  }

  /** Ключ определения тела: при изменении тело пересоздаётся. */
  private defKey(e: PhysicsEntity): string {
    return [e.kind, e.radius, e.density, e.fixedRotation ?? false, e.kinematic ?? false].join("|");
  }

  /**
   * Обновить физику кадра по актуальному списку сущностей.
   * Сущности — live-мосты над игровыми объектами: бэкенд не знает
   * о типах игры, только читает/пишет состояния.
   */
  update(dt: number, entities: PhysicsEntity[]): void {
    const seen = new Set<unknown>();

    // 1. Регистрация новых тел; пересоздание при изменении определения.
    for (const entity of entities) {
      seen.add(entity.userData);
      const key = this.defKey(entity);
      const prev = this.registered.get(entity.userData);
      if (prev && prev.defKey === key) continue;
      if (prev) this.engine.removeBody(entity.userData);
      const s = entity.getState();
      this.engine.addBody(entity.userData, {
        x: s.x,
        y: s.y,
        angle: s.angle,
        radius: entity.radius,
        density: entity.density,
        restitution: entity.restitution ?? 0.15,
        friction: entity.friction ?? 0.05,
        kind: entity.kind,
        fixedRotation: entity.fixedRotation ?? false,
        kinematic: entity.kinematic ?? false,
      });
      this.registered.set(entity.userData, { entity, defKey: key });
    }

    // 2. Удаление тел сущностей, которые исчезли из мира.
    for (const userData of Array.from(this.registered.keys())) {
      if (!seen.has(userData)) {
        this.registered.delete(userData);
        this.engine.removeBody(userData);
      }
    }

    // 3. Синхронизация тел с игровым состоянием (позиция + скорости).
    this.beginFrame();
    for (const { entity } of this.registered.values()) {
      this.engine.syncBody(entity.userData, entity.getState());
    }

    // 4. Шаг физики.
    this.engine.step(dt);

    // 5. Если бэкенд авторитетен — записать результат в игровые сущности.
    if (this.engine.integratesPosition) {
      for (const { entity } of this.registered.values()) {
        entity.applyResult(this.engine.getState(entity.userData));
      }
    }

    // 6. Собрать контакты (урон/толчки решает CollisionSystem).
    this.endFrame();
  }
}