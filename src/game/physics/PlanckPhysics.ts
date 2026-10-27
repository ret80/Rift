/**
 * PlanckPhysics — реализация IPhysics на библиотеке Planck.js.
 *
 * Тела регистрируются как динамические (кроме орбитальных дронов —
 * кинематические), шаг решает контакты, а позиции/скорости читаются
 * обратно в игровые сущности через PhysicsSystem. Режим включается
 * URL-параметром ?physics=planck или принудительно в композиционном корне.
 */

import { Body, Circle, Settings, Vec2, World } from "planck";
import type { BodyDef, FixtureDef, Shape } from "planck";
import {
  PHYSICS_MAX_TRANSLATION_PER_STEP,
} from "./IPhysics.ts";
import type {
  IPhysics,
  PhysicsBodyDef,
  PhysicsBodyState,
  PhysicsContact,
} from "./IPhysics.ts";

export const PHYSICS_VELOCITY_ITERATIONS = 8;
export const PHYSICS_POSITION_ITERATIONS = 3;

export class PlanckPhysics implements IPhysics {
  readonly resolvesVelocity = true;
  readonly integratesPosition = true;

  private world: World;
  private bodies = new Map<unknown, Body>();
  private _contacts: PhysicsContact[] = [];
  private deferred: Array<() => void> = [];

  constructor() {
    // Игровые единицы — пиксели, а не метры Planck: поднимаем лимит
    // перемещения за шаг, чтобы скорость (до 400 px/s) не зажималась.
    Settings.maxTranslation = PHYSICS_MAX_TRANSLATION_PER_STEP;
    this.world = new World({
      gravity: new Vec2(0, 0),
      allowSleep: false,
      continuousPhysics: true,
    });
  }

  get contacts(): PhysicsContact[] {
    return this._contacts;
  }

  get bodyCount(): number {
    return this.bodies.size;
  }

  addBody(userData: unknown, def: PhysicsBodyDef): void {
    this.removeBody(userData);
    const type = def.kinematic ? "kinematic" : "dynamic";
    const body = this.world.createBody({
      type,
      position: new Vec2(def.x, def.y),
      angle: def.angle ?? 0,
      fixedRotation: def.fixedRotation ?? true,
      allowSleep: false,
      linearDamping: 0,
      angularDamping: 0,
      bullet: false,
      userData,
    } as BodyDef);
    const shape: Shape = new Circle(def.radius);
    const fixture: FixtureDef = {
      shape,
      density: def.density,
      restitution: def.restitution ?? 0.15,
      friction: def.friction ?? 0.05,
    };
    body.createFixture(fixture);
    this.bodies.set(userData, body);
  }

  removeBody(userData: unknown): void {
    const body = this.bodies.get(userData);
    if (!body) return;
    // Во время step мир заблокирован — уничтожаем после шага.
    if (this.world.isLocked()) {
      this.deferred.push(() => this.destroyBody(userData, body));
    } else {
      this.destroyBody(userData, body);
    }
  }

  private destroyBody(userData: unknown, body: Body): void {
    this.world.destroyBody(body);
    this.bodies.delete(userData);
  }

  clear(): void {
    for (const body of Array.from(this.bodies.values())) this.world.destroyBody(body);
    this.bodies.clear();
    this._contacts = [];
    this.deferred = [];
  }

  syncBody(userData: unknown, state: PhysicsBodyState): void {
    const body = this.bodies.get(userData);
    if (!body) return;
    body.setTransform(new Vec2(state.x, state.y), state.angle);
    body.setLinearVelocity(new Vec2(state.vx, state.vy));
    body.setAngularVelocity(state.spin);
  }

  beginFrame(): void {
    this._contacts = [];
  }

  step(dt: number): void {
    if (dt <= 0) return;
    this.world.step(dt, PHYSICS_VELOCITY_ITERATIONS, PHYSICS_POSITION_ITERATIONS);
    for (const fn of this.deferred) fn();
    this.deferred = [];
  }

  endFrame(): void {
    const contacts: PhysicsContact[] = [];
    let contact = this.world.getContactList();
    while (contact) {
      if (contact.isTouching()) {
        const a = contact.getFixtureA().getBody().getUserData();
        const b = contact.getFixtureB().getBody().getUserData();
        if (a != null && b != null && a !== b) {
          contacts.push({ a, b });
        }
      }
      contact = contact.getNext();
    }
    this._contacts = contacts;
  }

  getState(userData: unknown): PhysicsBodyState {
    const body = this.bodies.get(userData);
    if (!body) return { x: 0, y: 0, angle: 0, vx: 0, vy: 0, spin: 0 };
    const p = body.getPosition();
    const v = body.getLinearVelocity();
    return {
      x: p.x,
      y: p.y,
      angle: body.getAngle(),
      vx: v.x,
      vy: v.y,
      spin: body.getAngularVelocity(),
    };
  }
}