/**
 * EnemyComponent — канонический данные-компонент врага.
 *
 * Содержит ПОЛНОЕ состояние врага: позицию, скорость, здоровье, радиус и
 * специализированное AI/боевое состояние. Это единый источник правды.
 * Остальной код (физика, коллизии, рендер, оружие, AI-стратегии) читает и
 * пишет врага через этот компонент (или производный DTO). Никакой отдельной
 * живой ссылки и двойной записи между view и компонентами нет.
 *
 * Позиция/скорость/здоровье/радиус дублируются здесь в полях x/y/vx/vy/hp/r —
 * для врагов это удобнее, чем раскладывать по базовым компонентам, т.к.
 * AI-стратегии и физика оперируют врагом как единым объектом. Базовые
 * Position/Velocity/Health/Radius для врагов не используются.
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

export class EnemyComponent implements Component {
  readonly type = "Enemy";
  readonly id = "Enemy";

  // === Позиция/движение (вместо Position/Velocity) ===
  x = 0;
  y = 0;
  vx = 0;
  vy = 0;
  angle = 0;

  // === Здоровье/радиус (вместо Health/Radius) ===
  hp = 0;
  maxHp = 0;
  r = 0;

  // === EntityRef ===
  /** Id ECS-сущности этого врага. */
  ecsId: number | string = "";
  /** Id ECS-сущности родителя (Carrier) или null. */
  parentId: number | string | null = null;

  // === Вид ===
  kind!: EnemyKind;
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

  constructor(state: Partial<EnemyComponent> = {}) {
    Object.assign(this, state);
    if (state.kind !== undefined) this.kind = state.kind as EnemyKind;
  }
}