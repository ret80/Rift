/**
 * AimSolver — расчёт упреждающего выстрела.
 *
 * Решает задачу перехвата аналитически (квадратное уравнение времени полёта):
 *   |P_цели + V_цели·t − P_стрелка| = v_снаряда · t
 *
 * Модуль даёт только чистую геометрию прицела. Шанс попадания в него не входит:
 * он превращается в конус рассеивания функцией spreadForChance — так промах
 * остаётся физичным (снаряд реально уходит в сторону), а не «нарисованным».
 *
 * Решатель уравнения встречи (solveInterceptTime) общий: им пользуются и
 * орудия (нужен угол выстрела), и AI-таран (нужно время до точки перехвата).
 */

import {
    AIM_CHANCE_CEILING,
    AIM_CHANCE_FLOOR,
    AIM_MANEUVER_FACTOR,
    AIM_MAX_SPREAD,
    AIM_MIN_SPREAD,
    LEAD_MAX_TIME,
    LEAD_MIN_TIME,
} from "../balance";
import { clamp } from "../math";

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
  /**
   * Угловая скорость курса цели, рад/с: цель летит по дуге, а не по прямой.
   * 0 или не задана — обычный прямолинейный прогноз.
   */
  turnRate?: number;
}

/**
 * Минимальная угловая скорость, с которой прогноз по дуге имеет смысл.
 * Ниже — курс считается прямым: оценка угловой скорости на пологой дуге
 * шумит сильнее, чем даёт точности.
 */
export const TURN_PREDICT_MIN = 0.3;

/** Угловая скорость для прогноза, либо 0 (прямая). */
export function effectiveTurnRate(turnRate: number | undefined): number {
  if (!turnRate || Math.abs(turnRate) < TURN_PREDICT_MIN) return 0;
  return turnRate;
}

/** Результат расчёта упреждения. */
export interface LeadResult {
  /** Угол на точку встречи, радианы. */
  angle: number;
  /** Время полёта до точки встречи, секунды. */
  timeOfFlight: number;
}

/**
 * Ближайшее время встречи преследователя с движущейся целью.
 *
 * Решает то же уравнение, что и прицел снаряда: |D + V·t| = v·t,
 * где D — вектор от преследователя к цели, V — скорость цели, v — её модуль
 * у преследователя. Раскрыто: a·t² + b·t + c = 0.
 *
 * @param dx, dy — вектор от преследователя к цели
 * @param targetVx, targetVy — скорость цели
 * @param pursuerSpeed — скорость преследователя (снаряда или тарана)
 * @returns время встречи в секундах или null — встречи в будущем нет
 *          (цель уходит быстрее преследователя).
 */
export function solveInterceptTime(
  dx: number,
  dy: number,
  targetVx: number,
  targetVy: number,
  pursuerSpeed: number
): number | null {
  const a = targetVx * targetVx + targetVy * targetVy - pursuerSpeed * pursuerSpeed;
  const b = 2 * (dx * targetVx + dy * targetVy);
  const c = dx * dx + dy * dy;

  if (Math.abs(a) < 1e-10) {
    // Скорость цели равна скорости преследователя: уравнение вырождается в линейное.
    if (Math.abs(b) < 1e-10) return null;
    const t = -c / b;
    return t > 0 ? t : null;
  }

  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;

  const sqrtD = Math.sqrt(disc);
  const t1 = (-b - sqrtD) / (2 * a);
  const t2 = (-b + sqrtD) / (2 * a);

  // Ближайшая встреча в будущем.
  const first = Math.min(t1, t2);
  if (first > 0) return first;
  const second = Math.max(t1, t2);
  return second > 0 ? second : null;
}

/**
 * Куда цель придёт через t, если её курс поворачивает с угловой скоростью
 * turnRate (рад/с, знак — направление вращения).
 *
 * Интеграл вращающегося вектора скорости: цель на дуге окружности, а не на
 * прямой. Именно этим снимается «безопасный облёт»: линейный прогноз уводит
 * точку за корпус, дуговой попадает в неё.
 */
export function predictArc(
  x: number,
  y: number,
  vx: number,
  vy: number,
  turnRate: number,
  t: number
): { x: number; y: number } {
  if (Math.abs(turnRate) < 1e-6) {
    return { x: x + vx * t, y: y + vy * t };
  }
  const s = Math.sin(turnRate * t);
  const c = 1 - Math.cos(turnRate * t);
  return {
    x: x + (s * vx - c * vy) / turnRate,
    y: y + (c * vx + s * vy) / turnRate,
  };
}

/**
 * Время полёта до точки встречи на дуге.
 *
 * Точка встречи зависит от времени полёта, поэтому уравнение решается
 * итерациями простой подстановки (сходится за 3-6 шагов при разумных
 * скоростях). null — итерация разошлась (цель уходит по дуге быстрее снаряда).
 */
export function solveArcInterceptTime(
  sx: number,
  sy: number,
  px: number,
  py: number,
  vx: number,
  vy: number,
  turnRate: number,
  speed: number
): number | null {
  if (speed <= 0) return null;
  let t = Math.hypot(px - sx, py - sy) / speed;
  for (let i = 0; i < 8; i++) {
    const p = predictArc(px, py, vx, vy, turnRate, t);
    const next = Math.hypot(p.x - sx, p.y - sy) / speed;
    if (!Number.isFinite(next) || next > 30) return null;
    if (Math.abs(next - t) < 1e-3) return next;
    t = next;
  }
  return t;
}

/**
 * Оценка угловой скорости курса по двум кадрам (рад/с).
 *
 * Берётся векторное произведение v × a / |v|²: поворот курса даёт угловую
 * скорость, а торможение или разворот «в обратную сторону» — почти нуль
 * (ускорение тогда параллельно скорости), поэтому оценка не прыгает на π
 * при резкой смене направления. Результат сглаживается экспонентой: прицелу
 * нужна не мгновенная реакция, а устойчивый радиус дуги.
 */
export function trackTurnRate(
  previous: number,
  prevVx: number,
  prevVy: number,
  vx: number,
  vy: number,
  dt: number
): number {
  if (dt <= 0) return previous;
  const speed2 = vx * vx + vy * vy;
  // На малой скорости направление курса не определено — оценка гаснет.
  if (speed2 < TURN_TRACK_MIN_SPEED * TURN_TRACK_MIN_SPEED) {
    return previous * Math.exp(-TURN_TRACK_DECAY * dt);
  }

  const ax = (vx - prevVx) / dt;
  const ay = (vy - prevVy) / dt;
  const instant = clamp((vx * ay - vy * ax) / speed2, -TURN_TRACK_MAX_RATE, TURN_TRACK_MAX_RATE);

  return previous + (instant - previous) * (1 - Math.exp(-TURN_TRACK_SMOOTH * dt));
}

/** Ниже этой скорости направление курса считается неопределённым, px/с. */
const TURN_TRACK_MIN_SPEED = 60;
/** Скорость сглаживания оценки угловой скорости, 1/с. */
const TURN_TRACK_SMOOTH = 3.0;
/** Скорость затухания оценки на малой скорости, 1/с. */
const TURN_TRACK_DECAY = 4.0;
/** Потолок модуля угловой скорости, рад/с. */
const TURN_TRACK_MAX_RATE = 6.0;

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

  const turnRate = effectiveTurnRate(params.turnRate);
  const t = turnRate
    ? solveArcInterceptTime(sx, sy, target.x, target.y, target.vx, target.vy, turnRate, bulletSpeed)
    : solveInterceptTime(dx, dy, target.vx, target.vy, bulletSpeed);
  if (t === null || t > maxTime || t < LEAD_MIN_TIME) return null;

  // Точка встречи: куда цель придёт через t (по прямой или по дуге).
  const lead = predictArc(target.x, target.y, target.vx, target.vy, turnRate, t);

  return { angle: Math.atan2(lead.y - sy, lead.x - sx), timeOfFlight: t };
}

/** Условия, при которых выстрел вообще имеет смысл. */
export interface FireWindowParams extends AimParams {
  /** Минимальное время полёта снаряда, секунды. */
  minTime: number;
  /** Максимальное время полёта снаряда, секунды. */
  maxTime: number;
  /** Минимальный угловой радиус цели, радианы. */
  minAngular: number;
}

/** Подтверждённое упреждение: выстрел по нему попадёт при текущем курсе цели. */
export interface FireWindow {
  /** Угол выстрела на точку встречи. */
  angle: number;
  timeOfFlight: number;
  impactX: number;
  impactY: number;
}

/**
 * Проверить, есть ли сейчас выстрел, который попадёт в цель.
 *
 * Это не шанс, а геометрия: снаряд пускается ровно по упреждению, поэтому
 * при неизменном курсе цели он её настигает. Проверка отбрасывает случаи,
 * когда попадания не будет независимо от точности:
 *  - встречи нет (цель уходит быстрее снаряда);
 *  - время полёта вне окна (в упор или слишком далеко для линейного прогноза);
 *  - цель слишком «мелкая» на выбранной дистанции.
 *
 * Рассеивание сюда не входит: это отдельный слой поверх прицела.
 */
export function solveFireWindow(params: FireWindowParams): FireWindow | null {
  const { sx, sy, target, bulletSpeed } = params;
  if (bulletSpeed <= 0) return null;

  const dx = target.x - sx;
  const dy = target.y - sy;

  const turnRate = effectiveTurnRate(params.turnRate);
  const t = turnRate
    ? solveArcInterceptTime(sx, sy, target.x, target.y, target.vx, target.vy, turnRate, bulletSpeed)
    : solveInterceptTime(dx, dy, target.vx, target.vy, bulletSpeed);
  if (t === null || t < params.minTime || t > params.maxTime) return null;

  // Точка встречи: прямолинейная или на дуге курса цели.
  const impact = predictArc(target.x, target.y, target.vx, target.vy, turnRate, t);
  const impactX = impact.x;
  const impactY = impact.y;
  const dist = Math.hypot(impactX - sx, impactY - sy) || 1;

  // Угловой размер цели на дистанции выстрела.
  if (Math.asin(clamp(target.r / dist, 0, 1)) < params.minAngular) return null;

  return {
    angle: Math.atan2(impactY - sy, impactX - sx),
    timeOfFlight: t,
    impactX,
    impactY,
  };
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
