/**
 * EnemyComponent — данные-компонент врага (вид + боевое/AI-состояние).
 *
 * Это чистые данные, НЕ обёртка над живым объектом `Enemy`. Позиция/скорость/
 * здоровье/радиус живут в собственных базовых компонентах
 * (PositionComponent, VelocityComponent, HealthComponent, RadiusComponent),
 * а здесь — только «вид» и специализированное состояние конкретного врага.
 *
 * Остальной код игры (физика, коллизии, рендер, оружие, AI-стратегии) по-прежнему
 * работает с живым объектом `Enemy` как стабильным представлением (view) — тот же
 * паттерн, что и у пуль/пикапов. EcsWorld синхронизирует компоненты сущности и
 * представление через EnemySystem, поэтому Aspect-системы читают данные напрямую.
 */

import type { Component } from "@trixt0r/ecs";
import type { EnemyKind } from "../../balance";

/** Состояние орбитального/атакующего дрона (стратегия Carrier). */
export type EnemyDroneState =
  | "orbiting"
  | "attacking"
  | "none"
  | "accumulating"
  | "waiting";

/** Начальное/текущее состояние врага как чистые данные. */
export interface EnemyState {
  kind: EnemyKind;
  angle: number;
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
  mass: number;
  dodgeWeight: number;
  dodgeDir: number;
  dodgeTimer: number;
  burstSpawned: number;
  burstActive: boolean;
  burstRestT: number;
  burstCd: number;
  tCd1?: number;
  tCd2?: number;
  droneState: EnemyDroneState;
  orbitAngle: number;
  orbitRadius: number;
  orbitTimer: number;
  waitTimer: number;
  phaseDrones: number;
  carrierChildren: number;
}

export class EnemyComponent implements Component {
  readonly type = "Enemy";
  readonly id = "Enemy";

  kind!: EnemyKind;
  angle = 0;
  speed = 0;
  contact = 0;
  score = 0;
  boltDmg = 0;
  fireCd = 0;
  mode = 0;
  modeT = 0;
  strafeDir = 1;
  seed = 0;
  spawnCd = 0;
  flash = 0;
  hitCd = 0;
  dead = false;
  mass = 1;
  dodgeWeight = 1;
  dodgeDir = 0;
  dodgeTimer = 0;
  burstSpawned = 0;
  burstActive = false;
  burstRestT = 0;
  burstCd = 0;
  tCd1?: number;
  tCd2?: number;
  droneState: EnemyDroneState = "none";
  orbitAngle = 0;
  orbitRadius = 0;
  orbitTimer = 0;
  waitTimer = 0;
  phaseDrones = 0;
  carrierChildren = 0;

  constructor(state: EnemyState) {
    Object.assign(this, state);
  }
}