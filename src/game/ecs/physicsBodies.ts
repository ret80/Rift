/**
 * Сборка физических тел кадра из ECS-компонентов.
 *
 * Игрок, враги, астероиды и пикапы раскладываются в PhysicsBodyDef без
 * промежуточных plain-адаптеров: getState/applyResult читают и пишут прямо
 * в компоненты соответствующей живой связки. Общая геометрия тел (плотность,
 * упругость, трение) задаётся здесь же — это единственное место, где
 * ECS-сущность превращается в тело физического слоя.
 */

import type { PhysicsBodyDef, PhysicsEntity } from "../physics/IPhysics";
import type { EcsEngine } from "./EcsEngine";
import type { AsteroidDomain } from "./domains/AsteroidDomain";
import type { EnemyDomain } from "./domains/EnemyDomain";
import type { PlayerDomain } from "./domains/PlayerDomain";
import { PickupKindComponent } from "./components/PickupKindComponent";
import { PositionComponent } from "./components/PositionComponent";
import { RadiusComponent } from "./components/RadiusComponent";

/** Плотность тела: согласована с массой massForRadius (π·r²·0.02). */
const BODY_DENSITY = 0.02;
const BODY_RESTITUTION = 0.15;
const BODY_FRICTION = 0.05;

/** Единые параметры тела для ECS-сущностей (игрок/враг/астероид/пикап). */
function commonBodyDef(
  kind: PhysicsBodyDef["kind"],
  r: number,
  opts: {
    kinematic?: boolean;
    sensor?: boolean;
    restitution?: number;
    friction?: number;
  } = {},
): Omit<PhysicsBodyDef, "x" | "y" | "kind" | "radius"> {
  return {
    density: BODY_DENSITY,
    restitution: opts.restitution ?? BODY_RESTITUTION,
    friction: opts.friction ?? BODY_FRICTION,
    fixedRotation: true,
    kinematic: opts.kinematic ?? false,
    sensor: opts.sensor ?? false,
  };
}

/** Живые тела текущего кадра для физического слоя. */
export function collectPhysicsBodies(
  ecs: EcsEngine,
  playerDomain: PlayerDomain,
  enemyDomain: EnemyDomain,
  asteroidDomain: AsteroidDomain,
): PhysicsEntity[] {
  const bodies: PhysicsEntity[] = [];

  // Игрок (базовые Position/Velocity + узкий маркер).
  const player = playerDomain.playerRef();
  if (player) {
    const { position, velocity, radius, marker } = player;
    bodies.push({
      userData: player,
      kind: "player",
      radius: radius.r,
      ...commonBodyDef("player", radius.r),
      getState: () => ({
        x: position.x, y: position.y, angle: marker.angle,
        vx: velocity.vx, vy: velocity.vy, spin: 0,
      }),
      applyResult: (s) => {
        position.x = s.x; position.y = s.y; marker.angle = s.angle;
        velocity.vx = s.vx; velocity.vy = s.vy;
      },
    });
  }

  // Враги (компонентные запросы: базовые Position/Velocity/Radius + маркер).
  for (const e of enemyDomain.enemies()) {
    if (e.marker.dead) continue;
    const { position, velocity, radius, marker } = e;
    const kinematic = marker.droneState === "orbiting";
    bodies.push({
      userData: e,
      kind: "enemy",
      radius: radius.r,
      ...commonBodyDef("enemy", radius.r, { kinematic }),
      getState: () => ({
        x: position.x, y: position.y, angle: marker.angle,
        vx: kinematic ? 0 : velocity.vx, vy: kinematic ? 0 : velocity.vy, spin: 0,
      }),
      applyResult: (s) => {
        position.x = s.x; position.y = s.y; marker.angle = s.angle;
        if (!kinematic) { velocity.vx = s.vx; velocity.vy = s.vy; }
      },
    });
  }

  // Астероиды (компонентные запросы: базовые Position/Velocity/Radius + маркер).
  for (const a of asteroidDomain.asteroids()) {
    if (a.marker.dead) continue;
    const { position, velocity, radius, marker } = a;
    bodies.push({
      userData: a,
      kind: "asteroid",
      radius: radius.r,
      ...commonBodyDef("asteroid", radius.r, { restitution: 0.15, friction: 0.05 }),
      getState: () => ({
        x: position.x, y: position.y, angle: marker.angle,
        vx: velocity.vx, vy: velocity.vy, spin: marker.spin,
      }),
      applyResult: (s) => {
        position.x = s.x; position.y = s.y; marker.angle = s.angle;
        velocity.vx = s.vx; velocity.vy = s.vy;
      },
    });
  }

  // Пикапы (сенсорные кинематические тела).
  for (const entity of ecs.entitiesWith(PickupKindComponent)) {
    const position = entity.components.get(PositionComponent);
    if (!position) continue;
    const radius = entity.components.get(RadiusComponent);
    const r = radius ? radius.r : 14;
    bodies.push({
      userData: entity,
      kind: "pickup",
      radius: r,
      ...commonBodyDef("pickup", r, { kinematic: true, sensor: true, restitution: 0, friction: 0 }),
      getState: () => ({ x: position.x, y: position.y, angle: 0, vx: 0, vy: 0, spin: 0 }),
      applyResult: (s) => {
        // Кинематический сенсор двигается ECS PickupMovementSystem.
        position.x = s.x; position.y = s.y;
      },
    });
  }

  return bodies;
}
