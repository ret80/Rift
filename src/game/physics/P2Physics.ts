/**
 * P2Physics — реализация IPhysics на библиотеке p2-es.
 *
 * Тела регистрируются как динамические (кроме орбитальных дронов —
 * кинематические), шаг решает контакты, а позиции/скорости читаются
 * обратно в игровые сущности через PhysicsSystem (аналогично PlanckPhysics).
 * Режим выбирается в меню настроек (физический движок) или URL-параметром
 * ?physics=p2.
 */

import { Body, Circle, World, vec2 } from "p2-es";
import type { BodyOptions, CircleOptions } from "p2-es";
import type {
  IPhysics,
  PhysicsBodyDef,
  PhysicsBodyState,
  PhysicsContact,
} from "./IPhysics.ts";

export const P2_VELOCITY_ITERATIONS = 8;
export const P2_POSITION_ITERATIONS = 3;
export const P2_MAX_SUBSTEPS = 10;

export class P2Physics implements IPhysics {
  readonly resolvesVelocity = true;
  readonly integratesPosition = true;

  private world: World;
  private userDataToBody = new Map<unknown, Body>();
  private bodyToUserData = new Map<Body, unknown>();
  private idToUserData = new Map<number, unknown>();
  // Множество пар (idA|idB) тел, находящихся в контакте на текущем шаге:
  // строится из beginContact/endContact, т.к. p2 не отдаёт готовый список.
  private overlapPairs = new Set<string>();
  private _contacts: PhysicsContact[] = [];
  private deferred: Array<() => void> = [];

  constructor() {
    this.world = new World({
      gravity: vec2.fromValues(0, 0),
    });
    // p2 применяет к контакту материал только если заданы материалы ОБОИХ
    // shape; иначе берётся defaultContactMaterial. Задаём трение/упругость
    // глобально — совпадает с фикстурами Planck (фрикция 0.05, рикошет 0.15).
    this.world.defaultContactMaterial.friction = 0.05;
    this.world.defaultContactMaterial.restitution = 0.15;

    this.world.on("beginContact", (e) => {
      const key = this.pairKey(e.bodyA, e.bodyB);
      if (key) this.overlapPairs.add(key);
    });
    this.world.on("endContact", (e) => {
      const key = this.pairKey(e.bodyA, e.bodyB);
      if (key) this.overlapPairs.delete(key);
    });
  }

  get contacts(): PhysicsContact[] {
    return this._contacts;
  }

  get bodyCount(): number {
    return this.userDataToBody.size;
  }

  addBody(userData: unknown, def: PhysicsBodyDef): void {
    this.removeBody(userData);
    const type = def.kinematic ? Body.KINEMATIC : Body.DYNAMIC;
    const body = new Body({
      type,
      position: vec2.fromValues(def.x, def.y),
      angle: def.angle ?? 0,
      fixedRotation: def.fixedRotation ?? true,
      allowSleep: false,
      damping: 0,
      angularDamping: 0,
      collisionResponse: true,
    } as BodyOptions);
    const shape = new Circle({ radius: def.radius } as CircleOptions);
    // Сенсор (бонус): shape участвует в детекции контактов, но не
    // генерирует физической реакции — не толкает игрока.
    shape.sensor = def.sensor ?? false;
    body.addShape(shape);
    body.setDensity(def.density);
    body.updateMassProperties();
    this.world.addBody(body);
    this.userDataToBody.set(userData, body);
    this.bodyToUserData.set(body, userData);
    this.idToUserData.set(body.id, userData);
  }

  removeBody(userData: unknown): void {
    const body = this.userDataToBody.get(userData);
    if (!body) return;
    // Во время step мир заблокирован — уничтожаем после шага.
    if (this.world.stepping) {
      this.deferred.push(() => this.destroyBody(userData, body));
    } else {
      this.destroyBody(userData, body);
    }
  }

  private destroyBody(userData: unknown, body: Body): void {
    this.world.removeBody(body);
    this.userDataToBody.delete(userData);
    this.bodyToUserData.delete(body);
    this.idToUserData.delete(body.id);
    this.clearPairsForBody(body.id);
  }

  clear(): void {
    for (const body of Array.from(this.userDataToBody.values())) {
      this.world.removeBody(body);
    }
    this.userDataToBody.clear();
    this.bodyToUserData.clear();
    this.idToUserData.clear();
    this.overlapPairs.clear();
    this._contacts = [];
    this.deferred = [];
  }

  syncBody(userData: unknown, state: PhysicsBodyState): void {
    const body = this.userDataToBody.get(userData);
    if (!body) return;
    body.position = vec2.fromValues(state.x, state.y);
    body.velocity = vec2.fromValues(state.vx, state.vy);
    body.angle = state.angle;
    body.angularVelocity = state.spin;
    body.wakeUp();
  }

  beginFrame(): void {
    this._contacts = [];
  }

  step(dt: number): void {
    if (dt <= 0) return;
    this.world.step(dt);
    for (const fn of this.deferred) fn();
    this.deferred = [];
  }

  endFrame(): void {
    const found: PhysicsContact[] = [];
    for (const key of this.overlapPairs) {
      const [ia, ib] = key.split("|").map(Number);
      const ua = this.idToUserData.get(ia);
      const ub = this.idToUserData.get(ib);
      if (ua != null && ub != null && ua !== ub) {
        found.push({ a: ua, b: ub });
      }
    }
    this._contacts = found;
  }

  getState(userData: unknown): PhysicsBodyState {
    const body = this.userDataToBody.get(userData);
    if (!body) return { x: 0, y: 0, angle: 0, vx: 0, vy: 0, spin: 0 };
    return {
      x: body.position[0],
      y: body.position[1],
      angle: body.angle,
      vx: body.velocity[0],
      vy: body.velocity[1],
      spin: body.angularVelocity,
    };
  }

  private pairKey(a: Body, b: Body): string | null {
    if (!a || !b) return null;
    const ia = a.id;
    const ib = b.id;
    return ia < ib ? `${ia}|${ib}` : `${ib}|${ia}`;
  }

  private clearPairsForBody(id: number): void {
    for (const key of this.overlapPairs) {
      const [ia, ib] = key.split("|").map(Number);
      if (ia === id || ib === id) this.overlapPairs.delete(key);
    }
  }
}