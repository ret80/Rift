/**
 * PlayerAgent — сменный «пилот» игрока для симуляции.
 *
 * Агент видит только `PlayerView` (read-only снимок мира) и возвращает
 * `PlayerIntent`. Он не получает ECS-сущности, не пишет в `position`/`velocity`
 * и не знает, что существует реальный игрок: тот же путь работает и в игре,
 * если подменить `PlayerControls`.
 *
 * Базовый класс `AbstractPlayerAgent` держит общую механику: частоту решений,
 * задержку реакции, прицеливание с детерминированным джиттером и выбор цели.
 * Конкретные агенты переопределяют только `desiredMove`.
 */

import type { PlayerIntent } from "../../core/PlayerControls";
import type { Rng } from "../../core/rng";

export type { PlayerIntent } from "../../core/PlayerControls";

/** Враг в снимке мира. */
export interface PlayerViewEnemy {
  x: number;
  y: number;
  vx: number;
  vy: number;
  kind: string;
  hp: number;
}

/** Вражеский снаряд в снимке мира. */
export interface PlayerViewBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
}

/** Read-only снимок мира, доступный агенту. */
export interface PlayerView {
  /** Время мира, секунды. */
  time: number;
  player: { x: number; y: number; vx: number; vy: number; hp: number; maxHp: number };
  enemies: ReadonlyArray<PlayerViewEnemy>;
  enemyBullets: ReadonlyArray<PlayerViewBullet>;
  zone: { x: number; y: number; radius: number; active: boolean } | null;
}

/** Контракт агента. */
export interface PlayerAgent {
  /** Решение на текущий тик. */
  update(view: PlayerView, dt: number): PlayerIntent;
  /** Сброс состояния перед новым забегом. */
  reset(): void;
}

/** Параметры, общие для всех агентов. */
export interface AgentParams {
  /** Частота решений, секунды (0.02–0.05 ≈ 20–50 Гц). */
  decisionInterval: number;
  /** Задержка перед резкой сменой курса, секунды. */
  reactionTime: number;
  /** Детерминированный разброс прицела, радианы. */
  aimJitter: number;
  /** Полуугол конуса, в котором агент открывает огонь. */
  fireCone: number;
  /** Дальность, дальше которой агент не стреляет. */
  fireRange: number;
}

export const DEFAULT_AGENT_PARAMS: AgentParams = {
  decisionInterval: 0.05,
  reactionTime: 0.15,
  aimJitter: 0.02,
  fireCone: 0.28,
  fireRange: 640,
};

/** Вектор-2. */
export interface Vec2 {
  x: number;
  y: number;
}

/** Нормализовать вектор; нулевой остаётся нулевым. */
export function normalize(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  return len < 1e-6 ? { x: 0, y: 0 } : { x: x / len, y: y / len };
}

/** Ограничить длину вектора единицей. */
export function clampUnit(x: number, y: number): Vec2 {
  const len = Math.hypot(x, y);
  return len <= 1 || len < 1e-6 ? { x, y } : { x: x / len, y: y / len };
}

/** Ближайший живой враг (или null). */
export function nearestEnemy(view: PlayerView, fromX?: number, fromY?: number): PlayerViewEnemy | null {
  const px = fromX ?? view.player.x;
  const py = fromY ?? view.player.y;
  let best: PlayerViewEnemy | null = null;
  let bestDist = Infinity;
  for (const enemy of view.enemies) {
    if (enemy.hp <= 0) continue;
    const d = Math.hypot(enemy.x - px, enemy.y - py);
    if (d < bestDist) {
      bestDist = d;
      best = enemy;
    }
  }
  return best;
}

/** Центр удержания: центр зоны, иначе — текущая позиция игрока. */
export function arenaCenter(view: PlayerView): { x: number; y: number; radius: number } {
  if (view.zone && view.zone.active && view.zone.radius > 0) {
    return { x: view.zone.x, y: view.zone.y, radius: view.zone.radius };
  }
  return { x: view.player.x, y: view.player.y, radius: 600 };
}

/**
 * База агента: темп решений, реакция, прицел и огонь.
 *
 * Наследник задаёт только `desiredMove` — куда агент хочет лететь.
 * Прицел и стрельба считаются одинаково: по ближайшей цели с упреждением
 * по скорости (тот же горизонт, что у орудий) и джиттером.
 */
export abstract class AbstractPlayerAgent implements PlayerAgent {
  protected readonly params: AgentParams;
  protected readonly rng: Rng;

  /** Текущий вектор движения (единичный). */
  protected move: Vec2 = { x: 0, y: 0 };
  /** Запланированная смена курса после задержки реакции. */
  private pendingMove: Vec2 | null = null;
  private pendingT = 0;
  private decisionT = 0;
  private hasDecision = false;
  /** Джиттер, зафиксированный на текущее решение. */
  private aimJitter = 0;

  constructor(params: Partial<AgentParams>, rng: Rng) {
    this.params = { ...DEFAULT_AGENT_PARAMS, ...params };
    this.rng = rng;
  }

  update(view: PlayerView, dt: number): PlayerIntent {
    this.decisionT -= dt;
    if (this.decisionT <= 0 && view.player.hp > 0) {
      this.decide(view);
      this.decisionT = this.params.decisionInterval;
    }

    if (this.pendingMove) {
      this.pendingT -= dt;
      if (this.pendingT <= 0) {
        this.move = this.pendingMove;
        this.pendingMove = null;
      }
    }

    const { angle, inCone } = this.aim(view);
    return {
      moveX: this.move.x,
      moveY: this.move.y,
      aimAngle: angle,
      firing: inCone && view.player.hp > 0,
      ability: this.wantAbility(view),
    };
  }

  reset(): void {
    this.move = { x: 0, y: 0 };
    this.pendingMove = null;
    this.pendingT = 0;
    this.decisionT = 0;
    this.hasDecision = false;
    this.aimJitter = 0;
    this.onReset();
  }

  /** Хук сброса для наследников. */
  protected onReset(): void {}

  /** Хук: использовать ли способность на этом тике. */
  protected wantAbility(_view: PlayerView): boolean {
    return false;
  }

  /** Куда агент хочет лететь (единичный вектор). */
  protected abstract desiredMove(view: PlayerView): Vec2;

  /** Принять решение с учётом задержки реакции на резкую смену курса. */
  private decide(view: PlayerView): void {
    const desired = this.desiredMove(view);
    const next = clampUnit(desired.x, desired.y);
    const jitter = (this.rng.next() - 0.5) * 2 * this.params.aimJitter;

    // Резкий разворот (>90°) требует времени реакции: человек не меняет
    // курс мгновенно. Плавная коррекция применяется сразу.
    const sharp =
      this.hasDecision &&
      (this.move.x * next.x + this.move.y * next.y) < 0 &&
      this.pendingMove === null;

    if (sharp && this.params.reactionTime > 0) {
      this.pendingMove = next;
      this.pendingT = this.params.reactionTime;
    } else {
      this.move = next;
    }
    this.aimJitter = jitter;
    this.hasDecision = true;
  }

  /** Прицел по ближайшему врагу с упреждением и джиттером. */
  protected aim(view: PlayerView): { angle: number; inCone: boolean } {
    const target = nearestEnemy(view);
    if (!target) {
      return { angle: Math.atan2(this.move.y, this.move.x), inCone: false };
    }

    const dx = target.x - view.player.x;
    const dy = target.y - view.player.y;
    const dist = Math.hypot(dx, dy) || 1;

    // Упреждение: цель летит с известной скоростью, снаряд — с типовой.
    const leadTime = Math.min(0.6, dist / 900);
    const aimX = target.x + target.vx * leadTime;
    const aimY = target.y + target.vy * leadTime;

    const angle = Math.atan2(aimY - view.player.y, aimX - view.player.x) + this.aimJitter;
    const forward = Math.atan2(dy, dx);
    const diff = Math.abs(wrapAngle(angle - forward));
    return { angle, inCone: diff <= this.params.fireCone && dist <= this.params.fireRange };
  }
}

/** Нормализовать угол в [-π, π]. */
export function wrapAngle(angle: number): number {
  let a = angle;
  while (a > Math.PI) a -= Math.PI * 2;
  while (a < -Math.PI) a += Math.PI * 2;
  return a;
}
