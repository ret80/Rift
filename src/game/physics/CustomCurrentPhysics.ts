/**
 * CustomCurrentPhysics — текущая (самописная) физика игры.
 *
 * Сохраняет прежнее поведение и логику: контакты считаются один раз
 * в кадр по пересечению окружностей с учётом радиусов тел, интеграция
 * позиций остаётся в игровых системах, а «мягкие» толчки при контактах
 * по-прежнему выполняет CollisionSystem. Используется по умолчанию.
 */

import type {
  IPhysics,
  PhysicsBodyDef,
  PhysicsBodyState,
  PhysicsContact,
} from "./IPhysics";

/** Внутреннее представление тела: хранит форму и последнее состояние. */
interface BodyEntry {
  userData: unknown;
  def: PhysicsBodyDef;
  lastState: PhysicsBodyState;
}

export class CustomCurrentPhysics implements IPhysics {
  readonly resolvesVelocity = false;

  private entries = new Map<unknown, BodyEntry>();
  private _contacts: PhysicsContact[] = [];

  get contacts(): PhysicsContact[] {
    return this._contacts;
  }

  get bodyCount(): number {
    return this.entries.size;
  }

  addBody(userData: unknown, def: PhysicsBodyDef): void {
    this.removeBody(userData);
    this.entries.set(userData, {
      userData,
      def,
      lastState: {
        x: def.x,
        y: def.y,
        angle: def.angle ?? 0,
        vx: 0,
        vy: 0,
        spin: 0,
      },
    });
  }

  removeBody(userData: unknown): void {
    this.entries.delete(userData);
  }

  clear(): void {
    this.entries.clear();
    this._contacts = [];
  }

  syncBody(userData: unknown, state: PhysicsBodyState): void {
    const e = this.entries.get(userData);
    if (!e) return;
    e.lastState = state;
  }

  beginFrame(): void {
    this._contacts = [];
  }

  step(dt: number): void {
    // Текущая физика не симулирует тела сама: позицию интегрируют
    // игровые системы (PlayerSystem/EnemySystem/AsteroidField), поэтому
    // шаг здесь — только отметка кадра. dt не используется намеренно.
    void dt;
  }

  endFrame(): void {
    const list = Array.from(this.entries.values());
    const found: PhysicsContact[] = [];
    for (let i = 0; i < list.length; i++) {
      const a = list[i];
      const as = a.lastState;
      for (let j = i + 1; j < list.length; j++) {
        const b = list[j];
        const bs = b.lastState;
        const dx = bs.x - as.x;
        const dy = bs.y - as.y;
        const dist = Math.hypot(dx, dy);
        const minDist = a.def.radius + b.def.radius;
        if (dist < minDist && dist > 0.01) {
          found.push({ a: a.userData, b: b.userData });
        }
      }
    }
    this._contacts = found;
  }

  getState(userData: unknown): PhysicsBodyState {
    const e = this.entries.get(userData);
    if (!e) return { x: 0, y: 0, angle: 0, vx: 0, vy: 0, spin: 0 };
    return { ...e.lastState };
  }
}