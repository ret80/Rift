/**
 * Спецификации спавна сущностей.
 *
 * Это не DTO для чтения: после создания ECS-сущности единственный источник
 * правды — её компоненты и живые связки (`EnemyRef`, `BulletRef`, ...).
 * Спецификация нужна только на входе фабрик доменов.
 */

import type { EnemyKind } from "../balance";
import type { EnemyRef } from "./refs";

/** Данные для создания врага. */
export interface EnemySpawn {
  kind: EnemyKind;
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  hp: number;
  maxHp: number;
  r: number;
  speed: number;
  contact: number;
  score: number;
  boltDmg: number;
  fireCd: number;
  mode: number;
  modeT: number;
  strafeDir: number;
  seed: number;
  spawnCd: number;
  flash: number;
  hitCd: number;
  dead: boolean;
  /** Id родителя (Carrier) или null. */
  parentId: number | string | null;
  mass: number;
  dodgeWeight: number;
  dodgeDir: number;
  dodgeTimer: number;
  burstSpawned: number;
  burstActive: boolean;
  burstRestT: number;
  burstCd: number;
  /** Независимые кулдауны турелей Cruiser. */
  tCd1?: number;
  tCd2?: number;
  /** Состояние орбитального/атакующего дрона. */
  droneState: "orbiting" | "attacking" | "none" | "accumulating" | "waiting";
  orbitAngle: number;
  orbitRadius: number;
  orbitTimer: number;
  waitTimer: number;
  phaseDrones: number;
  carrierChildren: number;
}

/** Данные для создания снаряда игрока. */
export interface BulletSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  /** Самонаведение: цель — живая ссылка на врага. */
  homing?: { target: EnemyRef | null; turnRate: number; lockRange: number };
}

/** Данные для создания вражеского снаряда. */
export interface EnemyBulletSpawn {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  dmg: number;
  heavy: boolean;
  cruiser: boolean;
  /** Радиус снаряда — участвует в столкновениях и в грейзе. */
  r: number;
  /** Предыдущая позиция для swept-проверки. */
  px: number;
  py: number;
  /** Снаряд уже засчитан как касание. */
  grazed: boolean;
}

/** Данные для создания визуального луча лазера. */
export interface BeamSpawn {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  life: number;
  maxLife: number;
  seed: number;
  /** Id ECS-сущности цели, занятой лучом (или null). */
  targetId?: number | string | null;
}
