/* Shared type definitions extracted from fx.ts, rifts.ts, and game.ts.
   All subsystems import from here to avoid duplication. */

import type { RGBA } from "./render/index";
import type { DroneCombatSpec, DroneId } from "./drones/Drone";

/* ---- Effect types (from fx.ts) ---- */

export interface Ring {
  x: number;
  y: number;
  r: number;
  vr: number;
  life: number;
  maxLife: number;
  c: RGBA;
}

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  c: RGBA;
  size: number;
}

/* ---- Rift types (from rifts.ts) ---- */

import type { EnemyKind } from "./balance";
import type { IEnemyStrategy } from "./ai/IEnemyStrategy";

export interface Rift {
  x: number;
  y: number;
  t: number;
  state: "opening" | "spawning" | "closing";
  queue: EnemyKind[];
  timer: number;
  seed: number;
  rot: number;
  size: number;
}

/* ---- Entity types (from game.ts) ---- */

import type { PickupKind } from "./balance";

export interface Enemy {
  kind: EnemyKind;
  x: number; y: number;
  vx: number; vy: number;
  angle: number;
  hp: number; maxHp: number;
  r: number; speed: number;
  contact: number; score: number;
  boltDmg: number; fireCd: number;
  mode: number; modeT: number;
  strafeDir: number; seed: number;
  spawnCd: number; flash: number; hitCd: number;
  dead: boolean; parent: Enemy | null;
  mass: number;
  dodgeWeight: number;
  dodgeDir: number; dodgeTimer: number;
  burstSpawned: number;
  burstActive: boolean;
  burstRestT: number;
  burstCd: number;
  // Cruiser dual turrets (independent cooldowns)
  tCd1?: number;
  tCd2?: number;
  // AI strategy (set by EnemyAI)
  strategy?: IEnemyStrategy | null;
  // Drone orbit/attack state (Carrier drones)
  droneState: 'orbiting' | 'attacking' | 'none' | 'accumulating' | 'waiting';
  orbitAngle: number;
  orbitRadius: number;
  // Carrier orbit/release timer
  orbitTimer: number;
  // Carrier wait timer (5-8 seconds during waiting phase)
  waitTimer: number;
  phaseDrones: number;
  // Carrier children tracking (count of spawned drones)
  carrierChildren: number;
}

export interface Bullet {
  x: number; y: number;
  vx: number; vy: number;
  life: number; dmg: number;
  /** Самонаведение: цель хранится живой ссылкой, поэтому ракета ведёт цель.
   *  При гибели цели ракета перенаводится на ближайшего живого врага,
   *  ограниченного radius захвата; null — целей в радиусе нет. */
  homing?: { target: Enemy | null; turnRate: number; lockRange: number };
}

export interface EBullet {
  x: number; y: number;
  vx: number; vy: number;
  life: number; dmg: number;
  heavy: boolean;
  cruiser: boolean;
  /** Радиус снаряда — участвует в столкновениях снарядов и в грейзе. */
  r: number;
  /** Предыдущая позиция — нужна для за swept-проверки пролёта мимо корабля. */
  px: number; py: number;
  /** Снаряд уже засчитан как касание — повторно касанием не считается. */
  grazed: boolean;
}

/**
 * Луч лазера — мгновенный отрезок от ствола до цели.
 * Нанесённый урон уже учтён в момент зажигания, поэтому луч живёт
 * только как визуал и не участвует в столкновениях.
 */
export interface LaserBeam {
  x1: number; y1: number;
  x2: number; y2: number;
  /** Остаток жизни луча, секунды. */
  life: number;
  /** Полная длительность луча — для расчёта затухания. */
  maxLife: number;
  /** Случайная фаза мерцания — чтобы контуры не совпадали между кадрами. */
  seed: number;
  /** Цель, занятая лучом — другие залпы не стреляют в неё повторно. */
  target?: Enemy | null;
}

export interface Pickup {
  kind: PickupKind;
  x: number; y: number;
  vx: number; vy: number;
  life: number; seed: number;
  r: number;
}

export interface AllyDrone {
  x: number; y: number;
  r: number;
  angle: number;
  fireCd: number; phase: number;
  hp: number; maxHp: number;
  target: Enemy | null;
  retargetT: number; flash: number;
  /** Постоянная единица флота — восстанавливается после гибели. */
  permanent: boolean;
  /** Вид дрона (для отрисовки и служебной логики). */
  kind: DroneId;
  /** Боевые характеристики единицы дрона. */
  combat: DroneCombatSpec | null;
}
