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
  /** Ориентация корпуса врага (угол движения/нос), радианы. */
  angle = 0;
  /**
   * Угол орудийной турели, радианы. У Cruiser корпус смотрит по курсу
   * (angle), а стволы наводятся на цель отдельно (turretAngle).
   * Для видов без отдельной турели совпадает с angle.
   */
  turretAngle = 0;
  speed = 0;
  contact = 0;
  score = 0;
  boltDmg = 0;
  fireCd = 0;
  /**
   * Заявка AI на выстрел: оружие стреляет только при ней. Живёт один кадр —
   * стратегия ставит её в фазе Enemies, EnemyShootingSystem снимает после
   * выстрела. Используется истребителем, остальные виды стреляют по таймеру.
   */
  fireGate = false;
  /**
   * Жетон атаки от ThreatDirector: без него враг держит дистанцию и не
   * открывает огонь. Изначально true — враг вне системы угроз активен.
   */
  attackAllowed = true;
  /**
   * Очередь болтов истребителя: сколько болтов осталось выстрелить.
   * Ставится стратегией при открытии окна огня, EnemyShootingSystem
   * добивает очередь по burstTimer с интервалом 0.15 с.
   */
  burstLeft = 0;
  /** Таймер для очереди болтов: интервал между болтами 0.15 с. */
  burstTimer = 0;
  /**
   * Общий угловой сдвиг текущей очереди, радианы. Считается один раз на
   * очередь, чтобы болты летели близко, а не разлетались полным конусом.
   * null — очередь ещё не начата.
   */
  burstAimOffset: number | null = null;
  /**
   * Угол зафиксированного захода хантера (WINDUP/CHARGE).
   * Фиксируется в WINDUP, используется в CHARGE для движения по прямой.
   */
  lockAngle = 0;
  mode = 0;
  modeT = 0;
  strafeDir = 1;
  seed = 0;
  spawnCd = 0;
  flash = 0;
  hitCd = 0;
  dead = false;
  mass = 1;
  dodgeDir = 0;
  dodgeTimer = 0;
  burstSpawned = 0;
  burstActive = false;
  burstRestT = 0;
  burstCd = 0;
  tCd1?: number;
  tCd2?: number;
  /** Телеграф атаки: оставшееся время предупреждения, сек. */
  telegraphTimer = 0;
  /** Активен ли телеграф атаки. */
  telegraphActive = false;
  /** Угол телеграфа, радианы. */
  telegraphAngle = 0;
  /** Тип телеграфа: line/cone/flash/arc. */
  telegraphType: "line" | "cone" | "flash" | "arc" = "line";
  droneState: EnemyDroneState = "none";
  /** Группа роя дронов (−1 — не назначена). */
  swarmGroupId = -1;
  /** Слот в строю группы. */
  swarmSlot = 0;
  /** Состояние внутри группы: строй, атака, возврат. */
  swarmState: "none" | "formation" | "detached" | "returning" = "none";
  /** Остаток времени атаки отделившегося дрона, секунды. */
  detachT = 0;
  orbitAngle = 0;
  orbitRadius = 0;
  orbitTimer = 0;
  waitTimer = 0;
  phaseDrones = 0;
  carrierChildren = 0;
  /** Глубина деления: 0 — обычный Делитель, 1 — осколок без деления. */
  splitDepth = 0;
  /** Гарпунёр натянул трос (визуальный признак). */
  tetherActive = false;

  constructor(state: Partial<EnemyComponent> = {}) {
    Object.assign(this, state);
    if (state.kind !== undefined) this.kind = state.kind as EnemyKind;
  }
}