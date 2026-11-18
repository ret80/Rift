/**
 * Сборка физических тел кадра из ECS-компонентов.
 *
 * Игрок, враги, астероиды и пикапы раскладываются в PhysicsBodyDef без
 * промежуточных plain-адаптеров: getState/applyResult читают и пишут прямо
 * в компоненты соответствующей живой связки. Общая геометрия тел (плотность,
 * упругость, трение) задаётся здесь же — это единственное место, где
 * ECS-сущность превращается в тело физического слоя.
 *
 * Мосты кэшируются по живой связке: физика запрашивает тела каждый тик, и
 * пересоздание замыканий на каждое тело давало заметный мусор для GC.
 */

import type { PhysicsEntity } from "../physics/IPhysics";
import type { EcsEngine } from "./EcsEngine";
import type { AsteroidDomain } from "./domains/AsteroidDomain";
import type { EnemyDomain } from "./domains/EnemyDomain";
import type { PlayerDomain } from "./domains/PlayerDomain";
import type { AsteroidRef, EnemyRef, PlayerRef } from "./refs";
import type { GameEntity } from "./GameEntity";
import { PickupKindComponent } from "./components/PickupKindComponent";
import { PositionComponent } from "./components/PositionComponent";
import { RadiusComponent } from "./components/RadiusComponent";

/** Плотность тела: согласована с массой massForRadius (π·r²·0.02). */
const BODY_DENSITY = 0.02;
const BODY_RESTITUTION = 0.15;
const BODY_FRICTION = 0.05;

/** Кэш мостов: одна живая связка — один объект тела на всё время жизни. */
const bodyCache = new WeakMap<object, PhysicsEntity>();

/** Мост тела игрока. */
function playerBody(ref: PlayerRef): PhysicsEntity {
  const cached = bodyCache.get(ref);
  if (cached) return cached;
  const { position, velocity, radius, marker } = ref;
  const body: PhysicsEntity = {
    userData: ref,
    kind: "player",
    get radius() { return radius.r; },
    density: BODY_DENSITY,
    restitution: BODY_RESTITUTION,
    friction: BODY_FRICTION,
    fixedRotation: true,
    getState: () => ({
      x: position.x, y: position.y, angle: marker.angle,
      vx: velocity.vx, vy: velocity.vy, spin: 0,
    }),
    applyResult: (s) => {
      position.x = s.x; position.y = s.y; marker.angle = s.angle;
      velocity.vx = s.vx; velocity.vy = s.vy;
    },
  };
  bodyCache.set(ref, body);
  return body;
}

/** Мост тела врага: орбитальные дроны кинематичны и скорость им не пишется. */
function enemyBody(ref: EnemyRef): PhysicsEntity {
  const cached = bodyCache.get(ref);
  if (cached) return cached;
  const { position, velocity, radius, marker } = ref;
  const orbiting = () => marker.droneState === "orbiting";
  const body: PhysicsEntity = {
    userData: ref,
    kind: "enemy",
    get radius() { return radius.r; },
    density: BODY_DENSITY,
    restitution: BODY_RESTITUTION,
    friction: BODY_FRICTION,
    fixedRotation: true,
    get kinematic() { return orbiting(); },
    getState: () => ({
      x: position.x, y: position.y, angle: marker.angle,
      vx: orbiting() ? 0 : velocity.vx, vy: orbiting() ? 0 : velocity.vy, spin: 0,
    }),
    applyResult: (s) => {
      position.x = s.x; position.y = s.y; marker.angle = s.angle;
      if (!orbiting()) { velocity.vx = s.vx; velocity.vy = s.vy; }
    },
  };
  bodyCache.set(ref, body);
  return body;
}

/** Мост тела астероида. */
function asteroidBody(ref: AsteroidRef): PhysicsEntity {
  const cached = bodyCache.get(ref);
  if (cached) return cached;
  const { position, velocity, radius, marker } = ref;
  const body: PhysicsEntity = {
    userData: ref,
    kind: "asteroid",
    get radius() { return radius.r; },
    density: BODY_DENSITY,
    restitution: 0.15,
    friction: 0.05,
    fixedRotation: true,
    getState: () => ({
      x: position.x, y: position.y, angle: marker.angle,
      vx: velocity.vx, vy: velocity.vy, spin: marker.spin,
    }),
    applyResult: (s) => {
      position.x = s.x; position.y = s.y; marker.angle = s.angle;
      velocity.vx = s.vx; velocity.vy = s.vy;
    },
  };
  bodyCache.set(ref, body);
  return body;
}

/**
 * Мост тела пикапа: кинематический сенсор, его позицию двигает
 * PickupMovementSystem. Кэш — по ECS-сущности, она и уходит в контакты.
 */
function pickupBody(
  entity: GameEntity,
  position: PositionComponent,
  radius: number,
): PhysicsEntity {
  const cached = bodyCache.get(entity);
  if (cached) return cached;
  const body: PhysicsEntity = {
    userData: entity,
    kind: "pickup",
    radius,
    density: BODY_DENSITY,
    restitution: 0,
    friction: 0,
    fixedRotation: true,
    kinematic: true,
    sensor: true,
    getState: () => ({ x: position.x, y: position.y, angle: 0, vx: 0, vy: 0, spin: 0 }),
    applyResult: (s) => {
      // Кинематический сенсор двигается ECS PickupMovementSystem.
      position.x = s.x; position.y = s.y;
    },
  };
  bodyCache.set(entity, body);
  return body;
}

/** Живые тела текущего кадра для физического слоя (в переиспользуемый буфер). */
export function collectPhysicsBodies(
  ecs: EcsEngine,
  playerDomain: PlayerDomain,
  enemyDomain: EnemyDomain,
  asteroidDomain: AsteroidDomain,
  out: PhysicsEntity[] = [],
): PhysicsEntity[] {
  out.length = 0;

  const player = playerDomain.playerRef();
  if (player) out.push(playerBody(player));

  // Враги: компонентные запросы базовых Position/Velocity/Radius + маркер.
  for (const enemy of enemyDomain.enemies()) {
    if (enemy.marker.dead) continue;
    out.push(enemyBody(enemy));
  }

  // Астероиды того же вида: позиция/скорость/радиус из компонентов.
  for (const asteroid of asteroidDomain.asteroids()) {
    if (asteroid.marker.dead) continue;
    out.push(asteroidBody(asteroid));
  }

  // Пикапы: сенсорные кинематические тела.
  for (const entity of ecs.entitiesWith(PickupKindComponent)) {
    const position = entity.components.get(PositionComponent);
    if (!position) continue;
    const radius = entity.components.get(RadiusComponent);
    out.push(pickupBody(entity, position, radius ? radius.r : 14));
  }

  return out;
}
