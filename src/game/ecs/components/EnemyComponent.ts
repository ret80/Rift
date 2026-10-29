/**
 * EnemyComponent — узкий доменный ECS-компонент врага.
 *
 * Позиция/скорость/радиус/запас прочности живут в базовых
 * `Position/Velocity/Radius/Life` компонентах на той же сущности; здесь
 * остаются только доменные поля: идентичность (ecsId/parentId), вид (kind)
 * и специализированное AI/боевое состояние. Читатели работают с врагом
 * через живую связку `EnemyRef` (base-компоненты + маркер) — без DTO-копий.
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

  // === EntityRef ===
  /** Id ECS-сущности этого врага. */
  ecsId: number | string = "";
  /** Id ECS-сущности родителя (Carrier) или null. */
  parentId: number | string | null = null;

  // === Вид ===
  kind!: EnemyKind;
  /** Ориентация врага (угол ствола/корпуса), радианы. */
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

  constructor(state: Partial<EnemyComponent> = {}) {
    Object.assign(this, state);
    if (state.kind !== undefined) this.kind = state.kind as EnemyKind;
  }
}