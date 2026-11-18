/**
 * RiftPlacement — чистая геометрия размещения разломов.
 *
 * Точки подбираются так, чтобы разломы были не ближе к игроку и краю зоны
 * и не наезжали друг на друга. Никакого состояния — только вход/выход.
 */

import { TAU } from "../math";

/** Минимальное расстояние от игрока для размещения разлома. */
const MIN_PLAYER_DIST = 220;
/** Минимальное расстояние от края зоны. */
const MIN_EDGE_DIST = 100;
/** Минимальное расстояние между разломами. */
export const MIN_RIFT_DIST = 140;
/** Количество проб по углу. */
const RIFT_ANGLE_PROBES = 7;
/** Угловой шаг между пробами (радианы). */
const RIFT_ANGLE_STEP = 0.4;
/** Количество проб по радиусу. */
const RIFT_RADIUS_PROBES = 4;
/** Дуга клещей: половина углового раствора впереди игрока, рад. */
const PINCER_SPREAD = 0.6;
/** Радиус дуги клещей в долях радиуса зоны. */
const PINCER_RADIUS_FRAC = 0.8;
/** Минимальное расстояние от игрока для точки клещей. */
const PINCER_MIN_PLAYER_DIST = 260;
/** Ниже этой скорости игрока направление обхода не определено, px/с. */
const PINCER_MIN_SPEED = 40;

/** Точка в мировых координатах. */
export interface RiftPoint {
  x: number;
  y: number;
}

/**
 * Разместить N точек разломов в зоне.
 *
 * Механизм: отталкиваемся от «противоположной игроку» стороны зоны.
 * Базовый луч идёт от игрока через центр зоны и продолжается за центр —
 * это самая дальняя от игрока точка. Стартовые разломы распределяются
 * равномерным угловым шагом вокруг центра, начиная с этого луча.
 */
export function placeRiftPoints(
  count: number,
  zoneX: number,
  zoneY: number,
  zoneRadius: number,
  playerX: number,
  playerY: number,
  existing: RiftPoint[],
  minDist: number,
): RiftPoint[] {
  const placed: RiftPoint[] = [];
  // Все точки-конкуренты: уже существующие разломы + только что размещённые.
  const occupied = [...existing];

  // Дальний от игрока луч: направление «игрок → центр», продолженное за центр.
  const awayAngle = Math.atan2(zoneY - playerY, zoneX - playerX);

  // Допустимый диапазон радиуса: не близко к игроку и не у самого края.
  const rMax = Math.max(60, zoneRadius - MIN_EDGE_DIST);

  // Угловой шаг для равномерного распределения стартовых разломов.
  const step = TAU / Math.max(1, count);

  for (let i = 0; i < count; i++) {
    // Равномерно вокруг центра, начиная с дальнего от игрока луча.
    const baseAngle = awayAngle + (i - (count - 1) / 2) * step;

    let best: RiftPoint | null = null;
    let bestScore = -Infinity;

    // Пробуем несколько смещений по углу и несколько радиусов,
    // выбирая наиболее «чистую» точку (максимум минимальной дистанции).
    for (let a = 0; a < RIFT_ANGLE_PROBES; a++) {
      const angle = baseAngle + (a - (RIFT_ANGLE_PROBES - 1) / 2) * RIFT_ANGLE_STEP;
      for (let r = 0; r < RIFT_RADIUS_PROBES; r++) {
        // Радиус от дальнего к ближнему к краю, но в пределах rMax.
        const radius = rMax * (0.55 + 0.45 * (r / (RIFT_RADIUS_PROBES - 1)));
        const x = zoneX + Math.cos(angle) * radius;
        const y = zoneY + Math.sin(angle) * radius;

        const dPlayer = Math.hypot(x - playerX, y - playerY);
        const dEdge = zoneRadius - Math.hypot(x - zoneX, y - zoneY);
        if (dPlayer < MIN_PLAYER_DIST || dEdge < MIN_EDGE_DIST) continue;

        let dOcc = Infinity;
        for (const o of occupied) {
          dOcc = Math.min(dOcc, Math.hypot(x - o.x, y - o.y));
        }
        if (dOcc < minDist) continue;

        // Приоритет: чем дальше от occupied и от игрока — тем лучше.
        const score = Math.min(dOcc, 300) + Math.min(dPlayer, 300) * 0.5;
        if (score > bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }

    // Если идеальной точки нет — берём компромисс: игнорируем требование
    // разнесения от occupied, но сохраняем дистанцию от игрока и края.
    if (!best) {
      best = fallbackRiftPoint(zoneX, zoneY, zoneRadius, playerX, playerY);
    }

    placed.push(best);
    occupied.push(best);
  }

  return placed;
}

/**
 * Точки клещей: пара на дуге впереди игрока по направлению обхода.
 *
 * Точка лежит на окружности радиуса 0.8R вокруг центра зоны и ровно в
 * направлении курса игрока ±0.6 рад (GDD §13.3). Курс берётся из скорости:
 * стоящий игрок направления обхода не имеет, и тогда возвращается null —
 * вызывающий ставит обычный разлом с дальней стороны. Если 0.8R на этом
 * луче ближе 260 px к игроку, точка отводится по лучу до минимума; сторона
 * пропускается, только если так она выходит за край зоны. Пустой массив
 * не возвращается.
 */
export function placePincerPoints(
  count: number,
  zoneX: number,
  zoneY: number,
  zoneRadius: number,
  playerX: number,
  playerY: number,
  velocityX: number,
  velocityY: number,
): RiftPoint[] | null {
  if (Math.hypot(velocityX, velocityY) < PINCER_MIN_SPEED) return null;

  const heading = Math.atan2(velocityY, velocityX);
  const ringRadius = Math.min(
    Math.max(60, zoneRadius - MIN_EDGE_DIST),
    zoneRadius * PINCER_RADIUS_FRAC,
  );
  const px = playerX - zoneX;
  const py = playerY - zoneY;
  const playerRadiusSq = px * px + py * py;
  const placed: RiftPoint[] = [];

  for (let i = 0; i < count; i++) {
    // Одна точка — прямо по курсу, пара — симметрично по краям дуги.
    const offset = count === 1 ? 0 : -PINCER_SPREAD + (2 * PINCER_SPREAD * i) / (count - 1);
    const ux = Math.cos(heading + offset);
    const uy = Math.sin(heading + offset);

    // Пересечение луча «игрок → курс ± offset» с кольцом 0.8R.
    const along = px * ux + py * uy;
    const disc = ringRadius * ringRadius - playerRadiusSq + along * along;
    if (disc <= 0) continue;
    // Игрок у края зоны: внутренняя сторона пары на 0.8R ближе минимума —
    // отводим её по тому же лучу до 260 px от игрока.
    const distance = Math.max(-along + Math.sqrt(disc), PINCER_MIN_PLAYER_DIST);
    const x = playerX + ux * distance;
    const y = playerY + uy * distance;
    if (zoneRadius - Math.hypot(x - zoneX, y - zoneY) < MIN_EDGE_DIST) continue;

    placed.push({ x, y });
  }

  return placed.length > 0 ? placed : null;
}

/** Запасная точка: максимально далеко от игрока и края, игнорируя occupied. */
function fallbackRiftPoint(
  zoneX: number,
  zoneY: number,
  zoneRadius: number,
  playerX: number,
  playerY: number,
): RiftPoint {
  const awayAngle = Math.atan2(zoneY - playerY, zoneX - playerX);
  const radius = Math.max(60, (zoneRadius - MIN_EDGE_DIST) * 0.8);
  return {
    x: zoneX + Math.cos(awayAngle) * radius,
    y: zoneY + Math.sin(awayAngle) * radius,
  };
}
