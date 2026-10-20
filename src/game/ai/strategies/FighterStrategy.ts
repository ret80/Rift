/**
 * FighterStrategy - тактика истребителя "заход и уклонение":
 *  1. APPROACH (mode 0): прямой манёвр в сторону игрока до дистанции выстрела.
 *  2. SHOOT    (mode 1): продолжает заход на игрока, ведёт очередь
 *                        (выстрелы создаёт EnemySystem.updateFiring), пока не
 *                        проскочит слишком близко или очередь не закончится.
 *  3. EVADE    (mode 2): резко отворачивает от игрока в сторону свободного
 *                        пространства и уходит — подготовка следующего захода.
 *
 * Дополнительно:
 *  - боковое уклонение от столкновения с игроком при сближении (таран);
 *  - отворачивание от барьера зоны, но только когда движение ведёт к краю
 *    (движение внутрь зоны/к игроку tangent не перехватывает).
 */

import { lerpAngle } from '../../math';
import type { Enemy } from '../../types';
import type { GameContext } from '../GameContext';
import type { IEnemyStrategy } from '../IEnemyStrategy';

// Дальность выстрела файтера — синхронизирована с EnemySystem.SHOOT_RANGE
const FIRE_RANGE = 500;
// Длительность очереди (≈ 2–3 выстрела при rate ~0.3–0.8 с)
const BURST_TIME = 1.05;
// Критическая близость к игроку — немедленный уход (проскок мимо цели)
const PANIC_DIST = 130;
// Максимальное время маневра уклонения
const EVADE_TIME = 1.1;
// Дистанция, после которой уклонение завершено (достаточно места для нового захода)
const EVADE_LEAD = 380;

// Уклонение от тарана с игроком
const TURN_AVOID_DIST = 280; // начало отворота при сближении
const TURN_HARD_DIST = 110;  // почти столкновение — форсированный отворот

// Отворачивание от края зоны
const AVOID_ZONE_RADIUS = 160; // радиус, на котором начинается избегание
const AVOID_HARD = 60;         // ближе — движение у края полностью по касательной

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));
// Сглаживание рампы (smoothstep)
const smooth01 = (v: number) => v * v * (3 - 2 * v);

export class FighterStrategy implements IEnemyStrategy {
  update(enemy: Enemy, context: GameContext, dt: number): void {
    const { playerX, playerY, zoneX, zoneY, zoneRadius } = context;
    const hasZone = zoneRadius > 40;

    const dx = playerX - enemy.x;
    const dy = playerY - enemy.y;
    const dist = Math.hypot(dx, dy) || 1;
    const angleToPlayer = Math.atan2(dy, dx);

    // --- Переходы между фазами ---
    if (enemy.mode === 0) {
      // APPROACH: подошли на дальность выстрела — переключаемся на атаку
      enemy.modeT += dt; // фаза "покачивания" при заходе
      if (dist <= FIRE_RANGE) {
        enemy.mode = 1;
        enemy.modeT = BURST_TIME;
      }
    } else if (enemy.mode === 1) {
      // SHOOT: очередь отстреляна или проскочили слишком близко — уход
      enemy.modeT -= dt;
      if (dist < PANIC_DIST || enemy.modeT <= 0) {
        enemy.mode = 2;
        enemy.modeT = EVADE_TIME;
        enemy.strafeDir = this.pickEscapeSide(enemy, context, angleToPlayer);
      } else if (dist > FIRE_RANGE) {
        // Игрок ушёл из зоны огня — снова заход
        enemy.mode = 0;
        enemy.modeT = 0;
      }
    } else {
      // EVADE: набрали дистанцию или вышло время — следующий заход
      enemy.modeT -= dt;
      if (enemy.modeT <= 0 || dist > EVADE_LEAD) {
        enemy.mode = 0;
        enemy.modeT = 0;
        enemy.strafeDir = this.pickEscapeSide(enemy, context, angleToPlayer);
      }
    }

    // --- Целевой угол движения по текущей фазе ---
    let targetMoveAngle: number;
    let speed = enemy.speed;
    let turnRate: number;

    if (enemy.mode === 0) {
      // Прямой манёвр в сторону игрока с лёгким "покачиванием"
      const weave = Math.sin(enemy.seed + enemy.modeT * 2.3) * 0.1;
      targetMoveAngle = angleToPlayer + weave;
      speed = enemy.speed * 1.05;
      turnRate = 1 - Math.exp(-4.5 * dt);
    } else if (enemy.mode === 1) {
      // Продолжаем заход на игрока, стреляя на проходе
      targetMoveAngle = angleToPlayer;
      speed = enemy.speed * 0.95;
      turnRate = 1 - Math.exp(-4.2 * dt);
    } else {
      // Уход от игрока по дуге — в сторону с бОльшим свободным пространством
      const side = this.pickEscapeSide(enemy, context, angleToPlayer);
      const escape = angleToPlayer + Math.PI + (Math.PI / 3) * -side;
      targetMoveAngle = escape;
      speed = enemy.speed * 1.15;
      turnRate = 1 - Math.exp(-4.8 * dt);
    }

    // --- Уклонение от столкновения с игроком (таран) ---
    // Срабатывает в любой фазе, если враг приближается к игроку.
    // (playerVx/playerVy передаются как 0 — учитываем только движение врага.)
    {
      const closing = (enemy.vx * dx + enemy.vy * dy) / dist;
      if (dist < TURN_AVOID_DIST && closing > 15) {
        const w = smooth01((TURN_AVOID_DIST - dist) / (TURN_AVOID_DIST - TURN_HARD_DIST));
        const side = this.pickEscapeSide(enemy, context, angleToPlayer);
        const evade = angleToPlayer + (Math.PI / 2) * side;
        targetMoveAngle = lerpAngle(targetMoveAngle, evade, w);
        // Почти столкновение — форсированный отворот, чтобы разминуться
        if (dist < TURN_HARD_DIST) {
          targetMoveAngle = evade;
        }
      }
    }

    // --- Отворачивание от края зоны (только если движение ведёт к барьеру) ---
    if (hasZone) {
      const distToZoneCenter = Math.hypot(enemy.x - zoneX, enemy.y - zoneY) || 1;
      const distToZoneEdge = zoneRadius - distToZoneCenter - enemy.r;

      if (distToZoneEdge < AVOID_ZONE_RADIUS) {
        const raw = clamp01(
          (AVOID_ZONE_RADIUS - distToZoneEdge) / (AVOID_ZONE_RADIUS - AVOID_HARD)
        );
        const avoidWeight = smooth01(raw);

        // Доля движения, направленного внутрь зоны (к центру).
        // Если файтер уже летит от края — избегание не вмешивается.
        const angleToCenter = Math.atan2(zoneY - enemy.y, zoneX - enemy.x);
        const inwardness = Math.cos(targetMoveAngle - angleToCenter);
        const needAvoid = clamp01(1 - inwardness * 1.5);

        if (needAvoid > 0.05) {
          // Касательная к окружности зоны — направление облёта края
          const angleToEdge = Math.atan2(enemy.y - zoneY, enemy.x - zoneX);
          const tangentA = angleToEdge + Math.PI / 2;
          const velMag = Math.hypot(enemy.vx, enemy.vy);
          let tangent: number;
          if (velMag > 5) {
            const velAngle = Math.atan2(enemy.vy, enemy.vx);
            tangent = Math.cos(velAngle - tangentA) >= 0 ? tangentA : tangentA + Math.PI;
          } else {
            tangent = enemy.strafeDir >= 0 ? tangentA : tangentA + Math.PI;
          }

          const effective = avoidWeight * needAvoid;
          targetMoveAngle = lerpAngle(targetMoveAngle, tangent, raw >= 1 ? 1 : effective * 0.9);

          // Гасим направленную наружу радиальную скорость — файтер не "тыкается" в барьер,
          // а плавно скользит вдоль края
          const rx = (enemy.x - zoneX) / distToZoneCenter;
          const ry = (enemy.y - zoneY) / distToZoneCenter;
          const radialV = enemy.vx * rx + enemy.vy * ry;
          if (radialV > 0) {
            const damp = effective * (1 - Math.exp(-9 * dt));
            enemy.vx -= rx * radialV * damp;
            enemy.vy -= ry * radialV * damp;
          }
        }
      }
    }

    // --- Плавный разворот и применение скорости ---
    enemy.angle = lerpAngle(enemy.angle, targetMoveAngle, turnRate);

    const k = 1 - Math.exp(-5 * dt);
    enemy.vx += (Math.cos(targetMoveAngle) * speed - enemy.vx) * k;
    enemy.vy += (Math.sin(targetMoveAngle) * speed - enemy.vy) * k;
  }

  /**
   * Выбрать сторону (справа/слева) с большим свободным пространством до края зоны.
   * Без зоны — сохранить текущее направление стрейфа.
   */
  private pickEscapeSide(enemy: Enemy, context: GameContext, angleToPlayer: number): number {
    const { zoneX, zoneY, zoneRadius } = context;
    const hasZone = zoneRadius > 40;

    let best = enemy.strafeDir;
    let bestScore = -Infinity;
    for (const side of [1, -1]) {
      let score: number;
      if (hasZone) {
        const angle = angleToPlayer + (Math.PI / 2) * side;
        // Прогноз позиции через ~0.6 с — там должно быть свободнее
        const px = enemy.x + Math.cos(angle) * 60;
        const py = enemy.y + Math.sin(angle) * 60;
        score = zoneRadius - Math.hypot(px - zoneX, py - zoneY) - enemy.r;
      } else {
        score = side === enemy.strafeDir ? 1 : 0;
      }
      if (score > bestScore) {
        bestScore = score;
        best = side;
      }
    }
    return best;
  }
}
