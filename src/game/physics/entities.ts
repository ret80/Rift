/**
 * PhysicsEntity adapters — мосты между игровыми объектами и физическим слоем.
 *
 * Каждый адаптер — live-обвязка над игровым объектом: читает состояние
 * до шага физики (getState) и записывает результат после (applyResult).
 * Физический бэкенд работает с интерфейсом PhysicsEntity и не знает
 * игровых типов.
 */

import type { Asteroid } from "../asteroids";
import { PLAYER_HITBOX_RADIUS } from "../balance/player";
import type { Enemy, Pickup } from "../types";
import type { PlayerState } from "../systems/PlayerState";

/** Плотность тела: согласована с массой massForRadius (π·r²·0.02). */
const ENTITY_DENSITY = 0.02;
const ENTITY_RESTITUTION = 0.15;
const ENTITY_FRICTION = 0.05;

/** Адаптер игрока: ссылка на живой PlayerState. */
export function playerEntity(player: PlayerState) {
  return {
    userData: player,
    kind: "player" as const,
    radius: PLAYER_HITBOX_RADIUS,
    density: ENTITY_DENSITY,
    restitution: ENTITY_RESTITUTION,
    friction: ENTITY_FRICTION,
    fixedRotation: true,
    getState: () => ({
      x: player.x,
      y: player.y,
      angle: player.angle,
      vx: player.vx,
      vy: player.vy,
      spin: 0,
    }),
    applyResult: (s: { x: number; y: number; angle: number; vx: number; vy: number }) => {
      player.x = s.x;
      player.y = s.y;
      player.angle = s.angle;
      player.vx = s.vx;
      player.vy = s.vy;
    },
  };
}

/** Адаптер врага: орбитальные дроны — кинематические тела. */
export function enemyEntity(enemy: Enemy) {
  const kinematic = enemy.droneState === "orbiting";
  return {
    userData: enemy,
    kind: "enemy" as const,
    radius: enemy.r,
    density: ENTITY_DENSITY,
    restitution: ENTITY_RESTITUTION,
    friction: ENTITY_FRICTION,
    fixedRotation: true,
    kinematic,
    getState: () => ({
      x: enemy.x,
      y: enemy.y,
      angle: enemy.angle,
      // Кинематическое тело позиционируется стратегией напрямую —
      // скорость не синхронизируем, чтобы Planck не двигал его сам.
      vx: kinematic ? 0 : enemy.vx,
      vy: kinematic ? 0 : enemy.vy,
      spin: 0,
    }),
    applyResult: (s: { x: number; y: number; angle: number; vx: number; vy: number }) => {
      enemy.x = s.x;
      enemy.y = s.y;
      enemy.angle = s.angle;
      // Кинематическое тело двигается самой стратегией (орбита):
      // скорость обратно не пишем, чтобы не затереть касательную.
      if (!kinematic) {
        enemy.vx = s.vx;
        enemy.vy = s.vy;
      }
    },
  };
}

/** Адаптер астероида. */
export function asteroidEntity(a: Asteroid) {
  return {
    userData: a,
    kind: "asteroid" as const,
    radius: a.r,
    density: ENTITY_DENSITY,
    restitution: ENTITY_RESTITUTION,
    friction: ENTITY_FRICTION,
    fixedRotation: true,
    getState: () => ({
      x: a.x,
      y: a.y,
      angle: a.angle,
      vx: a.vx,
      vy: a.vy,
      spin: a.spin,
    }),
    applyResult: (s: { x: number; y: number; angle: number; vx: number; vy: number }) => {
      a.x = s.x;
      a.y = s.y;
      a.angle = s.angle;
      a.vx = s.vx;
      a.vy = s.vy;
    },
  };
}

/**
 * Адаптер бонуса (pickup): сенсорное кинематическое тело.
 * Бонус двигается сам (PickupSystem — магнит/инерция), позицию задаёт
 * внешний код, поэтому body — кинематическое. Флаг sensor гарантирует,
 * что в движках с откликом (Planck/p2) контакт с игроком не порождает
 * и толчка, и отталкивания — игрок просто подбирает бонус.
 */
export function pickupEntity(p: Pickup) {
  return {
    userData: p,
    kind: "pickup" as const,
    radius: p.r,
    density: ENTITY_DENSITY,
    restitution: 0,
    friction: 0,
    fixedRotation: true,
    kinematic: true,
    sensor: true,
    getState: () => ({
      x: p.x,
      y: p.y,
      angle: 0,
      // Движение дрифтом/магнитом выполняет PickupSystem на самом объекте.
      // Телу скорость не передаём: кинематический бэкенд интегрировал бы её
      // сам и позиция двигалась бы дважды за кадр.
      vx: 0,
      vy: 0,
      spin: 0,
    }),
    applyResult: (s: { x: number; y: number; angle: number; vx: number; vy: number }) => {
      // Кинематический сенсор двигается PickupSystem — результат бэкенда
      // не пишем обратно, чтобы не затереть магнит/инерцию.
      p.x = s.x;
      p.y = s.y;
    },
  };
}