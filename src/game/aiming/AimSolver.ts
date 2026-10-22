/**
 * AimSolver — расчёт упреждающего выстрела.
 *
 * Решает задачу перехвата аналитически (квадратное уравнение времени полёта):
 *   |P_цели + V_цели·t − P_стрелка| = v_снаряда · t
 *
 * Модуль даёт только чистую геометрию прицела. Шанс попадания в него не входит:
 * он превращается в конус рассеивания функцией spreadForChance — так промах
 * остаётся физичным (снаряд реально уходит в сторону), а не «нарисованным».
 */

import { clamp } from "../math";
import {
  AIM_CHANCE_CEILING,
  AIM_CHANCE_FLOOR,
  AIM_MANEUVER_FACTOR,
  AIM_MAX_SPREAD,
  AIM_MIN_SPREAD,
  LEAD_MAX_TIME,
  LEAD_MIN_TIME,
} from "../balance";

/** Цель: позиция, скорость и радиус поражения. */
export interface AimTarget {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
}

/** Параметры выстрела. */
export interface AimParams {
  /** Позиция стрелка. */
  sx: number;
  sy: number;
  /** Цель. */
  target: AimTarget;
  /** Скорость снаряда. */
  bulletSpeed: number;
  /** Предельное время полёта снаряда (дальность поражения). */
  maxFlightTime?: number;
}

/** Результат расчёта упреждения. */
export interface LeadResult {
  /** Угол на точку встречи, радианы. */
  angle: number;
  /** Время полёта до точки встречи, секунды. */
  timeOfFlight: number;
}

/**
 * Рассчитать угол упреждения.
 * null — встречи нет: цель уходит быстрее снаряда либо снаряд не долетит.
 */
export function solveLead(params: AimParams): LeadResult | null {
  const { sx, sy, target, bulletSpeed } = params;
  const maxTime = params.maxFlightTime ?? LEAD_MAX_TIME;
  if (bulletSpeed <= 0) return null;

  // Вектор от стрелка к цели.
  const dx = target.x - sx;
  const dy = target.y - sy;

  // |D + V·t| = v·t  ⇔  a·t² + b·t + c = 0
  const a = target.vx * target.vx + target.vy * target.vy - bulletSpeed * bulletSpeed;
  const b = 2 * (dx * target.vx + dy * target.vy);
  const c = dx * dx + dy * dy;

  let t: number;

  if (Math.abs(a) < 1e-10) {
    // Скорость цели равна скорости снаряда: уравнение вырождается в линейное.
    if (Math.abs(b) < 1e-10) return null;
    t = -c / b;
  } else {
    const disc = b * b - 4 * a * c;
    if (disc < 0) return null;

    const sqrtD = Math.sqrt(disc);
    const t1 = (-b - sqrtD) / (2 * a);
    const t2 = (-b + sqrtD) / (2 * a);

    // Ближайшая встреча в будущем.
    const first = Math.min(t1, t2);
    const second = Math.max(t1, t2);
    if (first > 0) t = first;
    else if (second > 0) t = second;
    else return null;
  }

  if (t > maxTime || t < LEAD_MIN_TIME) return null;

  // Точка встречи: куда цель придёт через t.
  const leadX = target.x + target.vx * t;
  const leadY = target.y + target.vy * t;

  return { angle: Math.atan2(leadY - sy, leadX - sx), timeOfFlight: t };
}

/**
 * Полуугол конуса рассеивания под желаемый шанс попадания.
 *
 * Цель видна от стрелка под углом asin(hitRadius / distance). При равномерном
 * отклонении в пределах ±spread доля попаданий равна angular / spread,
 * поэтому spread = angular / chance.
 *
 * Коэффициент манёвра закладывает недобор: линейный прогноз не учитывает
 * поворот цели за время полёта, поэтому реальное попадание всегда ниже
 * номинального шанса и никогда не достигает 100%.
 */
export function spreadForChance(
  chance: number,
  distance: number,
  hitRadius: number
): number {
  const c = clamp(chance, AIM_CHANCE_FLOOR, AIM_CHANCE_CEILING);
  if (distance <= hitRadius) return AIM_MIN_SPREAD;

  const angular = Math.asin(clamp(hitRadius / distance, 0, 1));
  return clamp((angular / c) * AIM_MANEUVER_FACTOR, AIM_MIN_SPREAD, AIM_MAX_SPREAD);
}

/**
 * Угол выстрела: упреждение плюс случайное отклонение внутри конуса рассеивания.
 * Если встречи нет — цель берётся по текущей позиции.
 */
export function aimAtTarget(
  params: AimParams,
  hitChance: number,
  hitRadius: number
): number {
  const dx = params.target.x - params.sx;
  const dy = params.target.y - params.sy;

  const lead = solveLead(params);
  if (!lead) return Math.atan2(dy, dx);

  const spread = spreadForChance(hitChance, Math.hypot(dx, dy), hitRadius);
  return lead.angle + (Math.random() - 0.5) * 2 * spread;
}
